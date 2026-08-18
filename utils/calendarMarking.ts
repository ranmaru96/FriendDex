import type { MarkingProps } from 'react-native-calendars/src/calendar/day/marking';
import type { Event } from '../types';
import { getEventCalendarColor } from './calendarEventColors';
import { filterEventsByLocalDate, getLocalDateKeysForEvent } from './eventHelpers';
import type { JapaneseHolidayMap } from './japaneseHolidays';

export const MAX_CALENDAR_VISIBLE_BARS = 3;

export type CalendarPeriodMark = {
  startingDay: boolean;
  endingDay: boolean;
  color: string;
  title: string;
  showTitle: boolean;
};

export type CalendarDayMarking = Omit<MarkingProps, 'periods'> & {
  periods: CalendarPeriodMark[];
  totalCount: number;
  overflowCount: number;
  showCountLabel: boolean;
  isHoliday?: boolean;
};

function buildPeriodForEventOnDate(event: Event, dateKey: string): CalendarPeriodMark {
  const keys = getLocalDateKeysForEvent(event);
  const startKey = keys[0];
  const endKey = keys[keys.length - 1];
  const startingDay = dateKey === startKey;
  return {
    startingDay,
    endingDay: dateKey === endKey,
    color: getEventCalendarColor(event.episodeTag),
    title: event.title.trim() || '（無題）',
    showTitle: startingDay,
  };
}

export function buildCalendarMarkedDates(
  events: Event[],
  selectedDate: string,
  holidays: JapaneseHolidayMap = {},
  visibleMonth?: { year: number; month: number }
): Record<string, CalendarDayMarking> {
  const marked: Record<string, CalendarDayMarking> = {};
  const dateKeys = new Set<string>();
  const visibleIndex =
    visibleMonth != null ? visibleMonth.year * 12 + visibleMonth.month : null;

  const isVisibleHoliday = (dateKey: string): boolean => {
    if (visibleIndex == null) {
      return true;
    }
    const [year, month] = dateKey.split('-').map(Number);
    if (!year || !month) {
      return false;
    }
    return Math.abs(year * 12 + month - visibleIndex) <= 1;
  };

  events.forEach((event) => {
    getLocalDateKeysForEvent(event).forEach((dateKey) => dateKeys.add(dateKey));
  });
  dateKeys.add(selectedDate);
  Object.keys(holidays).forEach((dateKey) => {
    if (isVisibleHoliday(dateKey)) {
      dateKeys.add(dateKey);
    }
  });

  dateKeys.forEach((dateKey) => {
    const dayEvents = filterEventsByLocalDate(events, dateKey);
    const totalCount = dayEvents.length;
    const visibleEvents = dayEvents.slice(0, MAX_CALENDAR_VISIBLE_BARS);
    const overflowCount = Math.max(0, totalCount - MAX_CALENDAR_VISIBLE_BARS);
    const periods = visibleEvents.map((event) => buildPeriodForEventOnDate(event, dateKey));
    const isHoliday = Boolean(holidays[dateKey]);

    marked[dateKey] = {
      periods,
      totalCount,
      overflowCount,
      showCountLabel: totalCount >= MAX_CALENDAR_VISIBLE_BARS + 1,
      isHoliday,
    };
  });

  const selectedMark = marked[selectedDate] ?? {
    periods: [],
    totalCount: 0,
    overflowCount: 0,
    showCountLabel: false,
  };

  marked[selectedDate] = {
    ...selectedMark,
    selected: true,
    selectedColor: getEventCalendarColor(null),
  };

  return marked;
}
