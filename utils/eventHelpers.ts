import type { Event } from '../types';

export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (dateKey: string): Date => {
  const parts = dateKey.split('-').map(Number);
  if (parts.length === 3 && !parts.some((value) => Number.isNaN(value))) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
};

export const getMonthRangeIso = (year: number, month: number): { rangeStartAt: string; rangeEndAt: string } => {
  const rangeStartAt = new Date(year, month - 1, 1, 0, 0, 0, 0).toISOString();
  const rangeEndAt = new Date(year, month, 1, 0, 0, 0, 0).toISOString();
  return { rangeStartAt, rangeEndAt };
};

const formatHm = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const formatMonthDayLabel = (date: Date, includeYear = false): string => {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (includeYear) {
    return `${date.getFullYear()}年${month}月${day}日`;
  }
  return `${month}月${day}日`;
};

export const formatMonthDayLabelFromDateKey = (dateKey: string): string => {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
    return dateKey;
  }
  const [, month, day] = parts;
  return `${month}月${day}日`;
};

const formatDateTimeLabel = (date: Date, includeYear: boolean): string =>
  `${formatMonthDayLabel(date, includeYear)} ${formatHm(date)}`;

export const formatEventTimeLabel = (event: Event): string => {
  if (event.allDay) {
    return '終日';
  }
  const start = new Date(event.startAt);
  const startLabel = formatHm(start);
  if (!event.endAt) {
    return startLabel;
  }
  const end = new Date(event.endAt);
  return `${startLabel} – ${formatHm(end)}`;
};

export const formatEventScheduleLabel = (event: Event): string => {
  if (event.allDay) {
    const { startDateKey, endDateKey } = getAllDayDateKeysFromEvent(event);
    if (startDateKey === endDateKey) {
      return `終日（${formatMonthDayLabelFromDateKey(startDateKey)}）`;
    }
    return `終日（${formatMonthDayLabelFromDateKey(startDateKey)} – ${formatMonthDayLabelFromDateKey(endDateKey)}）`;
  }

  const start = new Date(event.startAt);
  if (!event.endAt) {
    return formatDateTimeLabel(start, false);
  }

  const end = new Date(event.endAt);
  const sameDay = formatDateKey(start) === formatDateKey(end);
  const crossYear = start.getFullYear() !== end.getFullYear();

  if (sameDay) {
    return `${formatMonthDayLabel(start)} ${formatHm(start)} – ${formatHm(end)}`;
  }

  return `${formatDateTimeLabel(start, crossYear)} – ${formatDateTimeLabel(end, crossYear)}`;
};

/** カード表示用。表示中日（viewDateKey）に応じた時刻ラベルを返す */
export const formatEventScheduleLabelForCard = (event: Event, viewDateKey: string): string => {
  const dateKeys = getLocalDateKeysForEvent(event);

  if (dateKeys.length <= 1) {
    if (event.allDay) {
      return '終日';
    }
    const start = new Date(event.startAt);
    if (!event.endAt) {
      return formatHm(start);
    }
    const end = new Date(event.endAt);
    return `${formatHm(start)}-${formatHm(end)}`;
  }

  const dayIndex = dateKeys.indexOf(viewDateKey);
  if (dayIndex < 0) {
    return formatEventScheduleLabel(event);
  }

  const dayLabel = `day${dayIndex + 1}`;

  if (event.allDay) {
    return `${dayLabel} 終日`;
  }

  const isFirst = dayIndex === 0;
  const isLast = dayIndex === dateKeys.length - 1;

  if (isFirst) {
    return `${dayLabel} ${formatHm(new Date(event.startAt))}-`;
  }
  if (isLast) {
    const end = event.endAt ? new Date(event.endAt) : new Date(event.startAt);
    return `${dayLabel} -${formatHm(end)}`;
  }

  return `${dayLabel} 終日`;
};

export const getLocalDateKeysForEvent = (event: Event): string[] => {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : start;
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= endDay) {
    keys.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
};

export const eventOccursOnLocalDate = (event: Event, dateKey: string): boolean =>
  getLocalDateKeysForEvent(event).includes(dateKey);

export const collectMarkedDateKeys = (events: Event[]): Set<string> => {
  const keys = new Set<string>();
  events.forEach((event) => {
    getLocalDateKeysForEvent(event).forEach((dateKey) => keys.add(dateKey));
  });
  return keys;
};

export const filterEventsByLocalDate = (events: Event[], dateKey: string): Event[] =>
  events
    .filter((event) => eventOccursOnLocalDate(event, dateKey))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

export const combineLocalDateTime = (dateKey: string, time: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
};

export const formatTimeFromDate = (date: Date): string => formatHm(date);

export const buildAllDayStartAt = (dateKey: string): string =>
  combineLocalDateTime(dateKey, '00:00').toISOString();

export const buildAllDayEndAt = (dateKey: string): string => {
  const end = parseDateKey(dateKey);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
};

export const getAllDayDateKeysFromEvent = (event: Event): { startDateKey: string; endDateKey: string } => {
  const dateKeys = getLocalDateKeysForEvent(event);
  if (dateKeys.length === 0) {
    const fallback = formatDateKey(new Date(event.startAt));
    return { startDateKey: fallback, endDateKey: fallback };
  }
  return {
    startDateKey: dateKeys[0],
    endDateKey: dateKeys[dateKeys.length - 1],
  };
};
