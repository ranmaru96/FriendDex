import type { Event } from '../types';
import { getEventCalendarColor } from './calendarEventColors';
import {
  filterEventsByLocalDate,
  formatDateKey,
  getLocalDateKeysForEvent,
  parseDateKey,
} from './eventHelpers';

export const SCHEDULE_GRID_MAX_EVENTS = 3;
export const SCHEDULE_GRID_EVENT_SLOTS = 3;

/** ScheduleGridMonthCalendar の dayCell / eventChip と揃える */
export const SCHEDULE_GRID_DAY_CELL_PADDING_H = 2;
export const SCHEDULE_GRID_CHIP_PADDING_H = 3;
export const SCHEDULE_GRID_CELL_BLEED = 3;
/**
 * fontSize 9 bold の半角1文字あたり概算 px。
 * 全角は約 fontSize(=9) なので半角換算は 4.5。5.5 だと1セルで全角4文字に留まる。
 */
export const SCHEDULE_GRID_HALF_WIDTH_PX = 4.5;

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
  /** 開始日のみタイトル（幅に応じて切り詰め）。継続日は null */
  label: string | null;
  span: ScheduleGridChipSpan;
  /** 当該週行内で連続してバーが伸びる日数（開始日のみ 1 超） */
  spanDaysInWeek: number;
};

export function getCharDisplayWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code <= 0x007f) return 1;
  if (code >= 0xff61 && code <= 0xff9f) return 1;
  return 2;
}

export function truncateScheduleGridTitleByWidth(title: string, maxDisplayWidth: number): string {
  const normalized = title.trim() || '（無題）';
  const limit = Math.max(1, maxDisplayWidth);
  let used = 0;
  let result = '';
  for (const char of normalized) {
    const width = getCharDisplayWidth(char);
    if (used + width > limit) {
      break;
    }
    used += width;
    result += char;
  }
  return result;
}

/** 開始日チップが週内で覆うバー幅（セル内容＋セル間ギャップ） */
export function getScheduleGridBarSpanWidthPx(
  cellWidth: number,
  spanDaysInWeek: number
): number {
  if (cellWidth <= 0 || spanDaysInWeek <= 0) {
    return 0;
  }
  const dayContentWidth = cellWidth - SCHEDULE_GRID_DAY_CELL_PADDING_H * 2;
  const interCellGap = SCHEDULE_GRID_DAY_CELL_PADDING_H * 2;
  return (
    spanDaysInWeek * dayContentWidth + Math.max(0, spanDaysInWeek - 1) * interCellGap
  );
}

export function getScheduleGridLabelTextWidthPx(
  cellWidth: number,
  spanDaysInWeek: number
): number {
  const spanWidth = getScheduleGridBarSpanWidthPx(cellWidth, spanDaysInWeek);
  return Math.max(0, spanWidth - SCHEDULE_GRID_CHIP_PADDING_H * 2);
}

export function getScheduleGridMaxDisplayWidthForLabel(
  cellWidth: number,
  spanDaysInWeek: number
): number {
  const textWidthPx = getScheduleGridLabelTextWidthPx(cellWidth, spanDaysInWeek);
  return Math.max(1, Math.floor(textWidthPx / SCHEDULE_GRID_HALF_WIDTH_PX));
}

export function getSpanDaysInWeek(
  event: Event,
  dateKey: string,
  week: ScheduleGridDay[]
): number {
  const keys = getLocalDateKeysForEvent(event);
  const weekKeys = week.map((day) => day.dateKey);
  const startIdx = keys.indexOf(dateKey);
  if (startIdx < 0 || !weekKeys.includes(dateKey)) {
    return 1;
  }

  let span = 1;
  for (let i = startIdx + 1; i < keys.length; i += 1) {
    const prevWeekIdx = weekKeys.indexOf(keys[i - 1]);
    const nextWeekIdx = weekKeys.indexOf(keys[i]);
    if (nextWeekIdx === prevWeekIdx + 1) {
      span += 1;
    } else {
      break;
    }
  }
  return span;
}

/** 当該週行でバー区間が始まる日（イベント開始日、または週またぎの日曜など） */
export function isScheduleGridWeekSegmentStart(
  event: Event,
  dateKey: string,
  week: ScheduleGridDay[]
): boolean {
  const keys = getLocalDateKeysForEvent(event);
  const idx = keys.indexOf(dateKey);
  if (idx < 0) {
    return false;
  }
  if (idx === 0) {
    return true;
  }
  const weekKeySet = new Set(week.map((day) => day.dateKey));
  return !weekKeySet.has(keys[idx - 1]);
}

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

export function buildScheduleGridChipsForDate(
  events: Event[],
  dateKey: string,
  week: ScheduleGridDay[],
  cellWidth: number
): ScheduleGridEventChip[] {
  const dayEvents = filterEventsByLocalDate(events, dateKey);
  return dayEvents.slice(0, SCHEDULE_GRID_MAX_EVENTS).map((event) => {
    const showLabel = isScheduleGridWeekSegmentStart(event, dateKey, week);
    const spanDaysInWeek = showLabel ? getSpanDaysInWeek(event, dateKey, week) : 1;
    const maxDisplayWidth = getScheduleGridMaxDisplayWidthForLabel(cellWidth, spanDaysInWeek);
    return {
      eventId: event.id,
      color: getEventCalendarColor(event.episodeTag),
      label: showLabel
        ? truncateScheduleGridTitleByWidth(event.title, maxDisplayWidth)
        : null,
      span: getScheduleGridChipSpan(event, dateKey),
      spanDaysInWeek,
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
