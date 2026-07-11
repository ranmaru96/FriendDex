import type { Event } from '../types';
import { getEventCalendarColor } from './calendarEventColors';
import {
  filterEventsByLocalDate,
  formatDateKey,
  getLocalDateKeysForEvent,
  parseDateKey,
} from './eventHelpers';

export const SCHEDULE_GRID_MAX_EVENTS = 3;
export const SCHEDULE_GRID_TITLE_CHARS = 4;
export const SCHEDULE_GRID_EVENT_SLOTS = 3;

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export type ScheduleGridChipSpan = 'single' | 'start' | 'middle' | 'end';

export type ScheduleGridDay = {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
  dayOfWeek: number;
};

export type ScheduleGridEventChip = {
  eventId: string;
  color: string;
  /** 開始日のみタイトル先頭数文字。継続日は null */
  label: string | null;
  span: ScheduleGridChipSpan;
};

export function getScheduleGridChipSpan(event: Event, dateKey: string): ScheduleGridChipSpan {
  const keys = getLocalDateKeysForEvent(event);
  if (keys.length <= 1) {
    return 'single';
  }
  if (dateKey === keys[0]) {
    return 'start';
  }
  if (dateKey === keys[keys.length - 1]) {
    return 'end';
  }
  return 'middle';
}

export function getScheduleGridWeekdayLabels(): readonly string[] {
  return WEEKDAY_LABELS;
}

export function buildScheduleGridWeeks(year: number, month: number): ScheduleGridDay[][] {
  const weeks: ScheduleGridDay[][] = [];
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = lastOfMonth.getDate();
  const weekCount = Math.ceil((startOffset + daysInMonth) / 7);
  const gridStart = new Date(year, month - 1, 1 - startOffset);

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const week: ScheduleGridDay[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const cursor = new Date(gridStart);
      cursor.setDate(gridStart.getDate() + weekIndex * 7 + dayIndex);
      const dateKey = formatDateKey(cursor);
      week.push({
        dateKey,
        day: cursor.getDate(),
        inCurrentMonth: cursor.getMonth() === month - 1,
        dayOfWeek: cursor.getDay(),
      });
    }
    weeks.push(week);
  }

  return weeks;
}

export function truncateScheduleGridTitle(title: string): string {
  const normalized = title.trim() || '（無題）';
  return normalized.slice(0, SCHEDULE_GRID_TITLE_CHARS);
}

export function buildScheduleGridChipsForDate(events: Event[], dateKey: string): ScheduleGridEventChip[] {
  const dayEvents = filterEventsByLocalDate(events, dateKey);
  return dayEvents.slice(0, SCHEDULE_GRID_MAX_EVENTS).map((event) => {
    const startKey = getLocalDateKeysForEvent(event)[0];
    const isStart = startKey === dateKey;
    return {
      eventId: event.id,
      color: getEventCalendarColor(event.episodeTag),
      label: isStart ? truncateScheduleGridTitle(event.title) : null,
      span: getScheduleGridChipSpan(event, dateKey),
    };
  });
}

/** @deprecated 固定スロット高さに移行。互換のため残す */
export function getScheduleGridRowEventCount(
  week: ScheduleGridDay[],
  events: Event[]
): number {
  let maxCount = 0;
  week.forEach((day) => {
    const count = filterEventsByLocalDate(events, day.dateKey).length;
    maxCount = Math.max(maxCount, Math.min(count, SCHEDULE_GRID_MAX_EVENTS));
  });
  return maxCount;
}

/** 6週グリッド全体（前月・次月の余白日を含む）の ISO 範囲 */
export function getScheduleGridMonthRangeIso(
  year: number,
  month: number
): { rangeStartAt: string; rangeEndAt: string } {
  const weeks = buildScheduleGridWeeks(year, month);
  const firstKey = weeks[0][0].dateKey;
  const lastKey = weeks[weeks.length - 1][6].dateKey;
  const rangeStartAt = parseDateKey(firstKey);
  rangeStartAt.setHours(0, 0, 0, 0);
  const rangeEndAt = parseDateKey(lastKey);
  rangeEndAt.setDate(rangeEndAt.getDate() + 1);
  rangeEndAt.setHours(0, 0, 0, 0);
  return {
    rangeStartAt: rangeStartAt.toISOString(),
    rangeEndAt: rangeEndAt.toISOString(),
  };
}

const WEEKDAY_SHORT = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function formatScheduleGridSelectedLabel(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = WEEKDAY_SHORT[date.getDay()];
  return `${month}月${day}日（${weekday}）`;
}
