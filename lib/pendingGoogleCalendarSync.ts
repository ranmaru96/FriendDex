import {
  deleteAppSetting,
  getAppSetting,
  initializeDatabase,
  PENDING_GOOGLE_CALENDAR_SYNC_KEY,
  setAppSetting,
} from '@/db';

export type PendingGoogleCalendarDelete = {
  calendarId: string;
  googleEventId: string;
};

type PendingGoogleCalendarSync = {
  upserts: string[];
  deletes: PendingGoogleCalendarDelete[];
};

const emptyPending = (): PendingGoogleCalendarSync => ({ upserts: [], deletes: [] });

const uniqueIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

const parseDeletes = (value: unknown): PendingGoogleCalendarDelete[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const out: PendingGoogleCalendarDelete[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Partial<PendingGoogleCalendarDelete>;
    const calendarId = typeof record.calendarId === 'string' ? record.calendarId.trim() : '';
    const googleEventId = typeof record.googleEventId === 'string' ? record.googleEventId.trim() : '';
    if (!calendarId || !googleEventId || seen.has(googleEventId)) {
      continue;
    }
    seen.add(googleEventId);
    out.push({ calendarId, googleEventId });
  }
  return out;
};

const parsePending = (raw: string | null): PendingGoogleCalendarSync => {
  if (!raw) {
    return emptyPending();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PendingGoogleCalendarSync>;
    return {
      upserts: uniqueIds(Array.isArray(parsed.upserts) ? parsed.upserts : []),
      deletes: parseDeletes(parsed.deletes),
    };
  } catch {
    return emptyPending();
  }
};

export const loadPendingGoogleCalendarSync = (): PendingGoogleCalendarSync => {
  initializeDatabase();
  return parsePending(getAppSetting(PENDING_GOOGLE_CALENDAR_SYNC_KEY));
};

const savePendingGoogleCalendarSync = (next: PendingGoogleCalendarSync): void => {
  initializeDatabase();
  setAppSetting(
    PENDING_GOOGLE_CALENDAR_SYNC_KEY,
    JSON.stringify({
      upserts: uniqueIds(next.upserts),
      deletes: parseDeletes(next.deletes),
    })
  );
};

export const clearPendingGoogleCalendarSync = (): void => {
  initializeDatabase();
  deleteAppSetting(PENDING_GOOGLE_CALENDAR_SYNC_KEY);
};

export const enqueuePendingGoogleUpsert = (eventId: string): void => {
  const trimmed = eventId.trim();
  if (!trimmed) {
    return;
  }
  const pending = loadPendingGoogleCalendarSync();
  pending.upserts = uniqueIds([...pending.upserts, trimmed]);
  savePendingGoogleCalendarSync(pending);
};

export const dequeuePendingGoogleUpsert = (eventId: string): void => {
  const trimmed = eventId.trim();
  if (!trimmed) {
    return;
  }
  const pending = loadPendingGoogleCalendarSync();
  pending.upserts = pending.upserts.filter((item) => item !== trimmed);
  savePendingGoogleCalendarSync(pending);
};

export const enqueuePendingGoogleDelete = (item: PendingGoogleCalendarDelete): void => {
  const calendarId = item.calendarId.trim();
  const googleEventId = item.googleEventId.trim();
  if (!calendarId || !googleEventId) {
    return;
  }
  const pending = loadPendingGoogleCalendarSync();
  pending.deletes = [
    ...pending.deletes.filter((entry) => entry.googleEventId !== googleEventId),
    { calendarId, googleEventId },
  ];
  savePendingGoogleCalendarSync(pending);
};

export const dequeuePendingGoogleDelete = (googleEventId: string): void => {
  const trimmed = googleEventId.trim();
  if (!trimmed) {
    return;
  }
  const pending = loadPendingGoogleCalendarSync();
  pending.deletes = pending.deletes.filter((entry) => entry.googleEventId !== trimmed);
  savePendingGoogleCalendarSync(pending);
};
