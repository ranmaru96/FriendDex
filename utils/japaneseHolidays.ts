import { getAppSetting, initializeDatabase, setAppSetting } from '@/db';

export const JAPANESE_HOLIDAY_TEXT_COLOR = '#dc2626';

export type JapaneseHolidayMap = Record<string, string>;

const ICS_URL =
  'https://calendar.google.com/calendar/ical/ja.japanese%23holiday%40group.v.calendar.google.com/public/basic.ics';
const JSON_FALLBACK_URL =
  'https://raw.githubusercontent.com/holiday-jp/holiday_jp/master/holidays.json';

export const JAPANESE_HOLIDAYS_JSON_KEY = 'japanese_holidays_json';
export const JAPANESE_HOLIDAYS_FETCHED_AT_KEY = 'japanese_holidays_fetched_at';

const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

/** オフライン初回用。ICS / JSON 取得後はキャッシュが優先される */
const FALLBACK_HOLIDAYS: JapaneseHolidayMap = {
  '2025-01-01': '元日',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日',
  '2025-02-24': '振替休日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-03': '憲法記念日',
  '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日',
  '2025-05-06': '振替休日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日',
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日',
  '2027-01-11': '成人の日',
  '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日',
  '2027-04-29': '昭和の日',
  '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日',
  '2027-07-19': '海の日',
  '2027-08-11': '山の日',
  '2027-09-20': '敬老の日',
  '2027-09-23': '秋分の日',
  '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
};

let memoryHolidays: JapaneseHolidayMap | null = null;
let refreshInFlight: Promise<JapaneseHolidayMap> | null = null;

const isDateKey = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const unfoldIcs = (raw: string): string =>
  raw.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');

const unescapeIcsText = (value: string): string =>
  value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();

const icsDateToKey = (value: string): string | null => {
  const compact = value.replace(/[-:]/g, '').slice(0, 8);
  if (!/^\d{8}$/.test(compact)) {
    return null;
  }
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
};

const readIcsProperty = (block: string, name: string): string | null => {
  const pattern = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'm');
  const match = block.match(pattern);
  return match?.[1]?.trim() ? match[1].trim() : null;
};

export const parseIcsHolidays = (ics: string): JapaneseHolidayMap => {
  const holidays: JapaneseHolidayMap = {};
  const unfolded = unfoldIcs(ics);
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  blocks.forEach((chunk) => {
    const block = chunk.split('END:VEVENT')[0] ?? '';
    const startRaw = readIcsProperty(block, 'DTSTART');
    const summaryRaw = readIcsProperty(block, 'SUMMARY');
    if (!startRaw || !summaryRaw) {
      return;
    }
    const dateKey = icsDateToKey(startRaw);
    const name = unescapeIcsText(summaryRaw);
    if (!dateKey || !name) {
      return;
    }
    holidays[dateKey] = name;
  });
  return holidays;
};

const parseHolidayJson = (raw: string): JapaneseHolidayMap => {
  const holidays: JapaneseHolidayMap = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return holidays;
    }
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!isDateKey(key) || typeof value !== 'string' || !value.trim()) {
        return;
      }
      holidays[key] = value.trim();
    });
  } catch {
    return holidays;
  }
  return holidays;
};

const loadStoredHolidays = (): JapaneseHolidayMap => {
  initializeDatabase();
  const raw = getAppSetting(JAPANESE_HOLIDAYS_JSON_KEY);
  if (!raw) {
    return {};
  }
  return parseHolidayJson(raw);
};

const persistHolidays = (holidays: JapaneseHolidayMap): void => {
  initializeDatabase();
  setAppSetting(JAPANESE_HOLIDAYS_JSON_KEY, JSON.stringify(holidays));
  setAppSetting(JAPANESE_HOLIDAYS_FETCHED_AT_KEY, new Date().toISOString());
};

export const loadJapaneseHolidays = (): JapaneseHolidayMap => {
  if (memoryHolidays) {
    return memoryHolidays;
  }
  const merged = { ...FALLBACK_HOLIDAYS, ...loadStoredHolidays() };
  memoryHolidays = merged;
  return merged;
};

export const getJapaneseHolidayName = (
  dateKey: string,
  holidays: JapaneseHolidayMap = loadJapaneseHolidays()
): string | null => holidays[dateKey] ?? null;

const fetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/calendar, application/json, text/plain;q=0.9, */*;q=0.8' },
    });
    if (!response.ok) {
      throw new Error(`祝日データの取得に失敗しました (${response.status})`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
};

const fetchRemoteHolidays = async (): Promise<JapaneseHolidayMap> => {
  try {
    const ics = await fetchText(ICS_URL);
    const fromIcs = parseIcsHolidays(ics);
    if (Object.keys(fromIcs).length >= 10) {
      return fromIcs;
    }
  } catch {
    // ICS が取れない場合は JSON にフォールバック
  }
  const json = await fetchText(JSON_FALLBACK_URL);
  return parseHolidayJson(json);
};

const shouldRefresh = (): boolean => {
  initializeDatabase();
  const fetchedAt = getAppSetting(JAPANESE_HOLIDAYS_FETCHED_AT_KEY);
  if (!fetchedAt) {
    return true;
  }
  const timestamp = Date.parse(fetchedAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }
  return Date.now() - timestamp > REFRESH_INTERVAL_MS;
};

export const refreshJapaneseHolidaysIfNeeded = async (force = false): Promise<JapaneseHolidayMap> => {
  const current = loadJapaneseHolidays();
  if (!force && !shouldRefresh()) {
    return current;
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    try {
      const remote = await fetchRemoteHolidays();
      if (Object.keys(remote).length === 0) {
        return current;
      }
      const merged = { ...FALLBACK_HOLIDAYS, ...current, ...remote };
      persistHolidays(merged);
      memoryHolidays = merged;
      return merged;
    } catch {
      return current;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
};

export const clearJapaneseHolidayMemoryCache = (): void => {
  memoryHolidays = null;
};
