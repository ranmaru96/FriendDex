import {
  GOOGLE_CALENDAR_EVENT_ID_PROPERTY,
  FRIENDEX_GOOGLE_CALENDAR_SUMMARY,
  GOOGLE_CALENDAR_REAUTH_MESSAGE,
} from '@/constants/googleCalendar';
import {
  clearAllEventGoogleEventIds,
  deleteAppSetting,
  getAllEvents,
  getAppSetting,
  getEvent,
  getEventParticipants,
  GOOGLE_CALENDAR_EMAIL_KEY,
  GOOGLE_CALENDAR_ID_KEY,
  GOOGLE_CALENDAR_LAST_ERROR_KEY,
  GOOGLE_CALENDAR_LAST_SYNC_AT_KEY,
  initializeDatabase,
  setAppSetting,
  updateEventGoogleEventId,
} from '@/db';
import { scheduleOwnedEventSync } from '@/lib/ownedEventSync';
import {
  clearGoogleCalendarNeedsReauth,
  clearGoogleTokens,
  hasGoogleTokens,
  isGoogleCalendarNeedsReauth,
  markGoogleCalendarNeedsReauth,
  resolveGoogleAccessToken,
  revokeGoogleAccess,
} from '@/lib/googleAuth';
import {
  clearPendingGoogleCalendarSync,
  dequeuePendingGoogleDelete,
  dequeuePendingGoogleUpsert,
  enqueuePendingGoogleDelete,
  enqueuePendingGoogleUpsert,
  loadPendingGoogleCalendarSync,
} from '@/lib/pendingGoogleCalendarSync';
import {
  createFriendDexGoogleCalendar,
  deleteGoogleCalendarEventRemote,
  findFriendDexGoogleCalendarId,
  findGoogleCalendarEventIdByFriendDexId,
  getGoogleCalendar,
  GoogleCalendarApiError,
  insertGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  fetchGoogleAccountEmail,
  type GoogleCalendarEventBody,
} from '@/lib/googleCalendarApi';
import type { Event } from '@/types';
import { formatDateKey, getAllDayDateKeysFromEvent, parseDateKey } from '@/utils/eventHelpers';
import { toEventParticipantDisplays } from '@/utils/eventParticipantHelpers';

export type GoogleCalendarPushResult = {
  pushed: number;
  failed: number;
  blocked?: 'auth' | 'disconnected';
};

type PushOutcome = 'sent' | 'absent' | 'auth' | 'transient' | 'permanent';
type DeleteFlush = 'ok' | 'auth' | 'paused';

const AUTH_ERROR_LEFTOVER = /oauth|authentication credential|invalid authentication/i;

const addOneDayToDateKey = (dateKey: string): string => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + 1);
  return formatDateKey(date);
};

const setLastError = (message: string | null): void => {
  initializeDatabase();
  if (!message) {
    deleteAppSetting(GOOGLE_CALENDAR_LAST_ERROR_KEY);
    return;
  }
  setAppSetting(GOOGLE_CALENDAR_LAST_ERROR_KEY, message.slice(0, 300));
};

const setLastSyncAt = (): void => {
  initializeDatabase();
  setAppSetting(GOOGLE_CALENDAR_LAST_SYNC_AT_KEY, new Date().toISOString());
};

export const getGoogleCalendarConnectionSnapshot = (): {
  email: string | null;
  calendarId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  needsReauth: boolean;
} => {
  initializeDatabase();
  return {
    email: getAppSetting(GOOGLE_CALENDAR_EMAIL_KEY),
    calendarId: getAppSetting(GOOGLE_CALENDAR_ID_KEY),
    lastSyncAt: getAppSetting(GOOGLE_CALENDAR_LAST_SYNC_AT_KEY),
    lastError: getAppSetting(GOOGLE_CALENDAR_LAST_ERROR_KEY),
    needsReauth: isGoogleCalendarNeedsReauth(),
  };
};

const failureOf = (error: unknown): 'reauth' | 'transient' | 'permanent' => {
  if (error instanceof GoogleCalendarApiError) {
    return error.failure;
  }
  if (error instanceof TypeError) {
    return 'transient';
  }
  return 'permanent';
};

const noteAuthFailure = (): void => {
  markGoogleCalendarNeedsReauth();
  setLastError(GOOGLE_CALENDAR_REAUTH_MESSAGE);
};

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const buildReminders = (event: Event): GoogleCalendarEventBody['reminders'] => {
  if (!event.notifyEnabled || !event.notifyAt) {
    return { useDefault: false, overrides: [] };
  }
  const startMs = new Date(event.startAt).getTime();
  const notifyMs = new Date(event.notifyAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(notifyMs)) {
    return { useDefault: false, overrides: [] };
  }
  const minutes = Math.round((startMs - notifyMs) / 60_000);
  if (minutes < 0 || minutes > 40320) {
    return { useDefault: false, overrides: [] };
  }
  return {
    useDefault: false,
    overrides: [{ method: 'popup', minutes }],
  };
};

const buildGoogleEventBody = (event: Event): GoogleCalendarEventBody => {
  const participantNames = toEventParticipantDisplays(
    getEventParticipants(event.id).map((participant) => participant.profileId)
  ).map((participant) => participant.name.trim())
    .filter(Boolean);

  const descriptionLines: string[] = [];
  if (event.memo) {
    descriptionLines.push(event.memo);
  }
  if (participantNames.length > 0) {
    descriptionLines.push(`参加者: ${participantNames.join('、')}`);
  }
  if (event.episodeTag) {
    descriptionLines.push(`予定タグ: ${event.episodeTag}`);
  }

  const body: GoogleCalendarEventBody = {
    summary: event.title,
    description: descriptionLines.length > 0 ? descriptionLines.join('\n\n') : undefined,
    reminders: buildReminders(event),
    extendedProperties: {
      private: {
        [GOOGLE_CALENDAR_EVENT_ID_PROPERTY]: event.id,
      },
    },
    start: {},
    end: {},
  };

  if (event.allDay) {
    const { startDateKey, endDateKey } = getAllDayDateKeysFromEvent(event);
    body.start = { date: startDateKey };
    body.end = { date: addOneDayToDateKey(endDateKey) };
    return body;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  const endAt =
    event.endAt ?? new Date(new Date(event.startAt).getTime() + 60 * 60 * 1000).toISOString();
  body.start = { dateTime: event.startAt, timeZone };
  body.end = { dateTime: endAt, timeZone };
  return body;
};

let ensureCalendarInFlight: Promise<string> | null = null;

export const ensureFriendDexGoogleCalendarId = async (): Promise<string> => {
  if (ensureCalendarInFlight) {
    return ensureCalendarInFlight;
  }

  ensureCalendarInFlight = (async () => {
    initializeDatabase();
    const storedId = getAppSetting(GOOGLE_CALENDAR_ID_KEY);
    if (storedId) {
      const existing = await getGoogleCalendar(storedId);
      if (existing?.id) {
        return existing.id;
      }
    }

    const foundId = await findFriendDexGoogleCalendarId();
    const calendarId = foundId ?? (await createFriendDexGoogleCalendar());
    initializeDatabase();
    setAppSetting(GOOGLE_CALENDAR_ID_KEY, calendarId);
    return calendarId;
  })();

  try {
    return await ensureCalendarInFlight;
  } catch (error) {
    ensureCalendarInFlight = null;
    throw error;
  } finally {
    ensureCalendarInFlight = null;
  }
};

const persistGoogleEventId = (eventId: string, googleEventId: string): void => {
  initializeDatabase();
  updateEventGoogleEventId(eventId, googleEventId);
  scheduleOwnedEventSync(eventId);
};

const markPushSuccess = (eventId: string): void => {
  dequeuePendingGoogleUpsert(eventId);
  clearGoogleCalendarNeedsReauth();
  setLastError(null);
  setLastSyncAt();
};

const recordPushFailure = (eventId: string, error: unknown): 'auth' | 'transient' | 'permanent' => {
  const failure = failureOf(error);
  if (failure === 'reauth') {
    enqueuePendingGoogleUpsert(eventId);
    noteAuthFailure();
    return 'auth';
  }
  if (failure === 'transient') {
    enqueuePendingGoogleUpsert(eventId);
    setLastError(messageOf(error, 'Google カレンダーへの送信に失敗しました'));
    return 'transient';
  }
  setLastError(messageOf(error, 'Google カレンダーへの送信に失敗しました'));
  return 'permanent';
};

const pushLocalEventOutcome = async (eventId: string): Promise<PushOutcome> => {
  if (!(await hasGoogleTokens())) {
    return 'permanent';
  }

  initializeDatabase();
  const event = getEvent(eventId);
  if (!event) {
    dequeuePendingGoogleUpsert(eventId);
    return 'absent';
  }

  if (isGoogleCalendarNeedsReauth()) {
    enqueuePendingGoogleUpsert(eventId);
    setLastError(GOOGLE_CALENDAR_REAUTH_MESSAGE);
    return 'auth';
  }

  try {
    const calendarId = await ensureFriendDexGoogleCalendarId();
    const body = buildGoogleEventBody(event);
    let googleEventId = event.googleEventId;

    if (!googleEventId) {
      googleEventId = await findGoogleCalendarEventIdByFriendDexId(calendarId, event.id);
    }

    if (googleEventId) {
      try {
        await updateGoogleCalendarEvent(calendarId, googleEventId, body);
        persistGoogleEventId(event.id, googleEventId);
        markPushSuccess(event.id);
        return 'sent';
      } catch (error) {
        const missing =
          error instanceof GoogleCalendarApiError && (error.status === 404 || error.status === 410);
        if (!missing) {
          throw error;
        }
      }
    }

    const createdId = await insertGoogleCalendarEvent(calendarId, body);
    persistGoogleEventId(event.id, createdId);
    markPushSuccess(event.id);
    return 'sent';
  } catch (error) {
    return recordPushFailure(eventId, error);
  }
};

export const pushLocalEventToGoogleCalendar = async (eventId: string): Promise<boolean> =>
  (await pushLocalEventOutcome(eventId)) === 'sent';

export const holdGoogleCalendarDelete = (googleEventId: string | null | undefined): void => {
  const remoteId = googleEventId?.trim();
  if (!remoteId) {
    return;
  }
  initializeDatabase();
  const calendarId = getAppSetting(GOOGLE_CALENDAR_ID_KEY)?.trim();
  if (!calendarId) {
    return;
  }
  enqueuePendingGoogleDelete({ calendarId, googleEventId: remoteId });
};

export const releaseGoogleCalendarDelete = (googleEventId: string | null | undefined): void => {
  const remoteId = googleEventId?.trim();
  if (!remoteId) {
    return;
  }
  dequeuePendingGoogleDelete(remoteId);
};

const localEventStillUsesGoogleId = (googleEventId: string): boolean => {
  initializeDatabase();
  return getAllEvents().some((event) => event.googleEventId === googleEventId);
};

const calendarIdForQueuedDelete = (googleEventId: string): string | null => {
  const pending = loadPendingGoogleCalendarSync().deletes.find(
    (entry) => entry.googleEventId === googleEventId
  );
  return pending?.calendarId ?? getAppSetting(GOOGLE_CALENDAR_ID_KEY);
};

const recordDeleteFailure = (error: unknown): 'reauth' | 'transient' | 'permanent' => {
  const failure = failureOf(error);
  if (failure === 'reauth') {
    noteAuthFailure();
    return failure;
  }
  setLastError(messageOf(error, 'Google カレンダーからの削除に失敗しました'));
  return failure;
};

export const deleteLocalEventFromGoogleCalendar = async (
  googleEventId: string | null | undefined
): Promise<void> => {
  const remoteId = googleEventId?.trim();
  if (!remoteId) {
    return;
  }
  if (localEventStillUsesGoogleId(remoteId)) {
    dequeuePendingGoogleDelete(remoteId);
    return;
  }
  holdGoogleCalendarDelete(remoteId);
  if (!(await hasGoogleTokens())) {
    return;
  }
  if (isGoogleCalendarNeedsReauth()) {
    setLastError(GOOGLE_CALENDAR_REAUTH_MESSAGE);
    return;
  }
  initializeDatabase();
  const calendarId = calendarIdForQueuedDelete(remoteId);
  if (!calendarId) {
    return;
  }
  try {
    await deleteGoogleCalendarEventRemote(calendarId, remoteId);
    dequeuePendingGoogleDelete(remoteId);
    clearGoogleCalendarNeedsReauth();
  } catch (error) {
    recordDeleteFailure(error);
  }
};

const flushPendingGoogleCalendarDeletes = async (): Promise<DeleteFlush> => {
  if (!(await hasGoogleTokens()) || isGoogleCalendarNeedsReauth()) {
    return isGoogleCalendarNeedsReauth() ? 'auth' : 'ok';
  }
  const pending = loadPendingGoogleCalendarSync();
  let paused = false;
  for (const item of pending.deletes) {
    if (isGoogleCalendarNeedsReauth()) {
      return 'auth';
    }
    if (localEventStillUsesGoogleId(item.googleEventId)) {
      dequeuePendingGoogleDelete(item.googleEventId);
      continue;
    }
    try {
      await deleteGoogleCalendarEventRemote(item.calendarId, item.googleEventId);
      dequeuePendingGoogleDelete(item.googleEventId);
      clearGoogleCalendarNeedsReauth();
    } catch (error) {
      const failure = recordDeleteFailure(error);
      if (failure === 'reauth') {
        return 'auth';
      }
      if (failure === 'transient') {
        return 'paused';
      }
      paused = true;
    }
  }
  return paused ? 'paused' : 'ok';
};

let googleQueueFlushInFlight: Promise<void> | null = null;

const flushPendingGoogleCalendarQueueNow = async (): Promise<void> => {
  initializeDatabase();
  const pending = loadPendingGoogleCalendarSync();
  for (const eventId of pending.upserts) {
    if (!getEvent(eventId)) {
      dequeuePendingGoogleUpsert(eventId);
    }
  }
  const upserts = pending.upserts.filter((eventId) => Boolean(getEvent(eventId)));
  if (upserts.length === 0 && pending.deletes.length === 0) {
    return;
  }
  if (isGoogleCalendarNeedsReauth() || !(await hasGoogleTokens())) {
    return;
  }

  let pauseRemaining = false;
  for (const eventId of upserts) {
    if (isGoogleCalendarNeedsReauth()) {
      pauseRemaining = true;
      break;
    }
    const outcome = await pushLocalEventOutcome(eventId);
    if (outcome === 'auth' || outcome === 'transient') {
      pauseRemaining = true;
      break;
    }
  }
  if (!pauseRemaining && !isGoogleCalendarNeedsReauth()) {
    await flushPendingGoogleCalendarDeletes();
  }
};

export const flushPendingGoogleCalendarQueue = (): Promise<void> => {
  if (!googleQueueFlushInFlight) {
    googleQueueFlushInFlight = flushPendingGoogleCalendarQueueNow().finally(() => {
      googleQueueFlushInFlight = null;
    });
  }
  return googleQueueFlushInFlight;
};

export const scheduleGoogleCalendarPush = (eventId: string): void => {
  void pushLocalEventToGoogleCalendar(eventId);
};

export const scheduleGoogleCalendarDelete = (googleEventId: string | null | undefined): void => {
  holdGoogleCalendarDelete(googleEventId);
  void deleteLocalEventFromGoogleCalendar(googleEventId);
};

export const pushAllLocalEventsToGoogleCalendar = async (): Promise<GoogleCalendarPushResult> => {
  if (!(await hasGoogleTokens())) {
    return { pushed: 0, failed: 0, blocked: 'disconnected' };
  }
  initializeDatabase();
  for (const eventId of loadPendingGoogleCalendarSync().upserts) {
    if (!getEvent(eventId)) {
      dequeuePendingGoogleUpsert(eventId);
    }
  }
  if (isGoogleCalendarNeedsReauth()) {
    setLastError(GOOGLE_CALENDAR_REAUTH_MESSAGE);
    return { pushed: 0, failed: 0, blocked: 'auth' };
  }

  const events = getAllEvents();
  let pushed = 0;
  let failed = 0;
  let pauseRemaining = false;
  for (const event of events) {
    if (isGoogleCalendarNeedsReauth()) {
      pauseRemaining = true;
      break;
    }
    const outcome = await pushLocalEventOutcome(event.id);
    if (outcome === 'sent') {
      pushed += 1;
      continue;
    }
    if (outcome === 'absent') {
      continue;
    }
    failed += 1;
    if (outcome === 'auth' || outcome === 'transient') {
      pauseRemaining = true;
      break;
    }
  }

  let deleteFlush: DeleteFlush = 'ok';
  if (!pauseRemaining && !isGoogleCalendarNeedsReauth()) {
    deleteFlush = await flushPendingGoogleCalendarDeletes();
  }
  const blocked = isGoogleCalendarNeedsReauth() ? ('auth' as const) : undefined;
  if (deleteFlush === 'paused' && !blocked) {
    failed += loadPendingGoogleCalendarSync().deletes.length;
  }
  if (failed === 0 && deleteFlush === 'ok' && !blocked) {
    setLastError(null);
  }
  return { pushed, failed, blocked };
};

export const probeGoogleCalendarAuth = async (): Promise<void> => {
  initializeDatabase();
  if (!getAppSetting(GOOGLE_CALENDAR_ID_KEY)) {
    return;
  }
  if (isGoogleCalendarNeedsReauth()) {
    setLastError(GOOGLE_CALENDAR_REAUTH_MESSAGE);
    return;
  }
  if (!(await hasGoogleTokens())) {
    noteAuthFailure();
    return;
  }
  const resolved = await resolveGoogleAccessToken(false);
  if (!resolved.ok) {
    if (resolved.failure === 'reauth') {
      setLastError(GOOGLE_CALENDAR_REAUTH_MESSAGE);
    }
    return;
  }
  const lastError = getAppSetting(GOOGLE_CALENDAR_LAST_ERROR_KEY);
  if (lastError && AUTH_ERROR_LEFTOVER.test(lastError)) {
    setLastError(null);
  }
};

export const completeGoogleCalendarConnect = async (): Promise<{
  email: string | null;
  calendarSummary: string;
  result: GoogleCalendarPushResult;
}> => {
  initializeDatabase();
  const email = await fetchGoogleAccountEmail();
  const previousEmail = getAppSetting(GOOGLE_CALENDAR_EMAIL_KEY);
  if (email && previousEmail && previousEmail !== email) {
    clearAllEventGoogleEventIds();
    deleteAppSetting(GOOGLE_CALENDAR_ID_KEY);
    clearPendingGoogleCalendarSync();
  }
  if (email) {
    setAppSetting(GOOGLE_CALENDAR_EMAIL_KEY, email);
  }

  await ensureFriendDexGoogleCalendarId();
  const result = await pushAllLocalEventsToGoogleCalendar();
  return {
    email,
    calendarSummary: FRIENDEX_GOOGLE_CALENDAR_SUMMARY,
    result,
  };
};

export const disconnectGoogleCalendar = async (): Promise<void> => {
  await revokeGoogleAccess();
  await clearGoogleTokens();
  initializeDatabase();
  deleteAppSetting(GOOGLE_CALENDAR_ID_KEY);
  deleteAppSetting(GOOGLE_CALENDAR_EMAIL_KEY);
  deleteAppSetting(GOOGLE_CALENDAR_LAST_ERROR_KEY);
  deleteAppSetting(GOOGLE_CALENDAR_LAST_SYNC_AT_KEY);
  clearGoogleCalendarNeedsReauth();
};
