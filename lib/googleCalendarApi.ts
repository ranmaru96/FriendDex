import {
  FRIENDEX_GOOGLE_CALENDAR_SUMMARY,
  GOOGLE_CALENDAR_EVENT_ID_PROPERTY,
} from '@/constants/googleCalendar';
import { getValidGoogleAccessToken } from '@/lib/googleAuth';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export class GoogleCalendarApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GoogleCalendarApiError';
    this.status = status;
  }
}

type CalendarListEntry = {
  id?: string;
  summary?: string;
  deleted?: boolean;
  hidden?: boolean;
  nextPageToken?: string;
};

type CalendarListResponse = {
  items?: CalendarListEntry[];
  nextPageToken?: string;
};

type GoogleDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleCalendarEventBody = {
  summary: string;
  description?: string;
  start: GoogleDateTime;
  end: GoogleDateTime;
  reminders?: {
    useDefault: boolean;
    overrides?: { method: 'popup' | 'email'; minutes: number }[];
  };
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

export type GoogleCalendarEvent = GoogleCalendarEventBody & {
  id?: string;
};

type EventsListResponse = {
  items?: GoogleCalendarEvent[];
};

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    if (payload.error?.message) {
      return payload.error.message;
    }
  } catch {
    // ignore JSON parse errors
  }
  return `Google カレンダー API エラー (${response.status})`;
};

const calendarFetch = async (
  path: string,
  init: RequestInit = {},
  retried = false
): Promise<Response> => {
  const accessToken = await getValidGoogleAccessToken();
  if (!accessToken) {
    throw new GoogleCalendarApiError(401, 'Google カレンダーに再接続してください');
  }

  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 && !retried) {
    await getValidGoogleAccessToken(true);
    return calendarFetch(path, init, true);
  }

  return response;
};

const calendarJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await calendarFetch(path, init);
  if (!response.ok) {
    throw new GoogleCalendarApiError(response.status, await parseErrorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export const fetchGoogleAccountEmail = async (): Promise<string | null> => {
  const accessToken = await getValidGoogleAccessToken();
  if (!accessToken) {
    return null;
  }
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as { email?: string };
  return payload.email?.trim() || null;
};

const listCalendarEntries = async (): Promise<CalendarListEntry[]> => {
  const entries: CalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ maxResults: '250', minAccessRole: 'owner' });
    if (pageToken) {
      query.set('pageToken', pageToken);
    }
    const payload = await calendarJson<CalendarListResponse>(`/users/me/calendarList?${query.toString()}`);
    (payload.items ?? []).forEach((item) => entries.push(item));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return entries;
};

export const getGoogleCalendar = async (calendarId: string): Promise<{ id: string; summary?: string } | null> => {
  const response = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new GoogleCalendarApiError(response.status, await parseErrorMessage(response));
  }
  return (await response.json()) as { id: string; summary?: string };
};

export const findFriendDexGoogleCalendarId = async (): Promise<string | null> => {
  const entries = await listCalendarEntries();
  const match = entries.find(
    (entry) =>
      entry.id &&
      !entry.deleted &&
      entry.summary === FRIENDEX_GOOGLE_CALENDAR_SUMMARY
  );
  return match?.id ?? null;
};

export const createFriendDexGoogleCalendar = async (): Promise<string> => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  const created = await calendarJson<{ id: string }>('/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: FRIENDEX_GOOGLE_CALENDAR_SUMMARY,
      timeZone,
    }),
  });
  if (!created.id) {
    throw new GoogleCalendarApiError(500, 'FriendDex カレンダーの作成に失敗しました');
  }
  try {
    await calendarJson(`/users/me/calendarList/${encodeURIComponent(created.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        selected: true,
        colorId: '10',
      }),
    });
  } catch {
    // calendar is still usable even if list styling fails
  }
  return created.id;
};

export const insertGoogleCalendarEvent = async (
  calendarId: string,
  body: GoogleCalendarEventBody
): Promise<string> => {
  const created = await calendarJson<GoogleCalendarEvent>(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
  if (!created.id) {
    throw new GoogleCalendarApiError(500, 'Google カレンダーへの予定追加に失敗しました');
  }
  return created.id;
};

export const updateGoogleCalendarEvent = async (
  calendarId: string,
  googleEventId: string,
  body: GoogleCalendarEventBody
): Promise<void> => {
  await calendarJson(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );
};

export const deleteGoogleCalendarEventRemote = async (
  calendarId: string,
  googleEventId: string
): Promise<void> => {
  const response = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    { method: 'DELETE' }
  );
  if (response.status === 404 || response.status === 410) {
    return;
  }
  if (!response.ok) {
    throw new GoogleCalendarApiError(response.status, await parseErrorMessage(response));
  }
};

export const findGoogleCalendarEventIdByFriendDexId = async (
  calendarId: string,
  eventId: string
): Promise<string | null> => {
  const query = new URLSearchParams({
    maxResults: '1',
    privateExtendedProperty: `${GOOGLE_CALENDAR_EVENT_ID_PROPERTY}=${eventId}`,
  });
  const payload = await calendarJson<EventsListResponse>(
    `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`
  );
  return payload.items?.[0]?.id ?? null;
};
