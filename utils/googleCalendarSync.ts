import {
  GOOGLE_CALENDAR_EVENT_ID_PROPERTY,
  FRIENDEX_GOOGLE_CALENDAR_SUMMARY,
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
  clearGoogleTokens,
  hasGoogleTokens,
  revokeGoogleAccess,
} from '@/lib/googleAuth';
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
};

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
} => {
  initializeDatabase();
  return {
    email: getAppSetting(GOOGLE_CALENDAR_EMAIL_KEY),
    calendarId: getAppSetting(GOOGLE_CALENDAR_ID_KEY),
    lastSyncAt: getAppSetting(GOOGLE_CALENDAR_LAST_SYNC_AT_KEY),
    lastError: getAppSetting(GOOGLE_CALENDAR_LAST_ERROR_KEY),
  };
};

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

export const pushLocalEventToGoogleCalendar = async (eventId: string): Promise<boolean> => {
  if (!(await hasGoogleTokens())) {
    return false;
  }

  initializeDatabase();
  const event = getEvent(eventId);
  if (!event) {
    return false;
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
        setLastError(null);
        setLastSyncAt();
        return true;
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
    setLastError(null);
    setLastSyncAt();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google カレンダーへの送信に失敗しました';
    setLastError(message);
    return false;
  }
};

export const deleteLocalEventFromGoogleCalendar = async (
  googleEventId: string | null | undefined
): Promise<void> => {
  const remoteId = googleEventId?.trim();
  if (!remoteId) {
    return;
  }
  if (!(await hasGoogleTokens())) {
    return;
  }
  initializeDatabase();
  const calendarId = getAppSetting(GOOGLE_CALENDAR_ID_KEY);
  if (!calendarId) {
    return;
  }
  try {
    await deleteGoogleCalendarEventRemote(calendarId, remoteId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google カレンダーからの削除に失敗しました';
    setLastError(message);
  }
};

export const scheduleGoogleCalendarPush = (eventId: string): void => {
  void pushLocalEventToGoogleCalendar(eventId);
};

export const scheduleGoogleCalendarDelete = (googleEventId: string | null | undefined): void => {
  void deleteLocalEventFromGoogleCalendar(googleEventId);
};

export const pushAllLocalEventsToGoogleCalendar = async (): Promise<GoogleCalendarPushResult> => {
  initializeDatabase();
  const events = getAllEvents();
  let pushed = 0;
  let failed = 0;
  for (const event of events) {
    const ok = await pushLocalEventToGoogleCalendar(event.id);
    if (ok) {
      pushed += 1;
    } else {
      failed += 1;
    }
  }
  if (failed === 0) {
    setLastError(null);
  }
  return { pushed, failed };
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
};
