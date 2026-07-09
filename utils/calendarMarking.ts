import type { MarkingProps } from 'react-native-calendars/src/calendar/day/marking';
import type { Event } from '../types';
import { getEventCalendarColor } from './calendarEventColors';
import { filterEventsByLocalDate, getLocalDateKeysForEvent } from './eventHelpers';

export const MAX_CALENDAR_VISIBLE_BARS = 3;

export type CalendarPeriodMark = {
  startingDay: boolean;
  endingDay: boolean;
  color: string;
  title: string;
  showTitle: boolean;
};

export type CalendarDayMarking = MarkingProps & {
  periods: CalendarPeriodMark[];
  totalCount: number;
  overflowCount: number;
  showCountLabel: boolean;
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
  selectedDate: string
): Record<string, CalendarDayMarking> {
  const marked: Record<string, CalendarDayMarking> = {};
  const dateKeys = new Set<string>();

  events.forEach((event) => {
    getLocalDateKeysForEvent(event).forEach((dateKey) => dateKeys.add(dateKey));
  });
  dateKeys.add(selectedDate);

  dateKeys.forEach((dateKey) => {
    const dayEvents = filterEventsByLocalDate(events, dateKey);
    const totalCount = dayEvents.length;
    const visibleEvents = dayEvents.slice(0, MAX_CALENDAR_VISIBLE_BARS);
    const overflowCount = Math.max(0, totalCount - MAX_CALENDAR_VISIBLE_BARS);
    const periods = visibleEvents.map((event) => buildPeriodForEventOnDate(event, dateKey));

    marked[dateKey] = {
      periods,
      totalCount,
      overflowCount,
      showCountLabel: totalCount >= MAX_CALENDAR_VISIBLE_BARS + 1,
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
