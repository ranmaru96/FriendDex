import type { MarkingProps } from 'react-native-calendars/src/calendar/day/marking';
import type { Event } from '../types';
import { filterEventsByLocalDate, getLocalDateKeysForEvent } from './eventHelpers';

export const MAX_CALENDAR_VISIBLE_BARS = 3;

export type CalendarPeriodMark = {
  startingDay: boolean;
  endingDay: boolean;
  color: string;
};

export type CalendarDayMarking = MarkingProps & {
  periods: CalendarPeriodMark[];
  totalCount: number;
  overflowCount: number;
  showCountLabel: boolean;
};

function buildPeriodForEventOnDate(
  event: Event,
  dateKey: string,
  color: string
): CalendarPeriodMark {
  const keys = getLocalDateKeysForEvent(event);
  const startKey = keys[0];
  const endKey = keys[keys.length - 1];
  return {
    startingDay: dateKey === startKey,
    endingDay: dateKey === endKey,
    color,
  };
}

export function buildCalendarMarkedDates(
  events: Event[],
  selectedDate: string,
  accentColor: string
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
    const periods = visibleEvents.map((event) =>
      buildPeriodForEventOnDate(event, dateKey, accentColor)
    );

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
    selectedColor: accentColor,
  };

  return marked;
}
