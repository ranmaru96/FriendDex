import { combineLocalDateTime, formatDateKey, parseDateKey } from './eventHelpers';

export type EventNotifyTimingPreset =
  | 'day_before_22'
  | 'day_before_18'
  | 'morning_of_8'
  | 'one_hour_before';

export const DEFAULT_NOTIFY_TIMING_PRESET: EventNotifyTimingPreset = 'day_before_22';

export const NOTIFY_TIMING_OPTIONS: {
  value: EventNotifyTimingPreset;
  label: string;
  requiresTimedEvent?: boolean;
}[] = [
  { value: 'day_before_22', label: '前日22時' },
  { value: 'day_before_18', label: '前日18時' },
  { value: 'morning_of_8', label: '当日朝8時' },
  { value: 'one_hour_before', label: '1時間前', requiresTimedEvent: true },
];

type NotifyTimingInput = {
  startDateKey: string;
  startTime: string;
  allDay: boolean;
};

const atLocalDateTime = (dateKey: string, hours: number, minutes: number): Date => {
  const base = parseDateKey(dateKey);
  base.setHours(hours, minutes, 0, 0);
  return base;
};

export const computeNotifyAtFromPreset = (
  preset: EventNotifyTimingPreset,
  input: NotifyTimingInput
): string | null => {
  const { startDateKey, startTime, allDay } = input;
  if (!startDateKey.trim()) {
    return null;
  }

  const eventStart = allDay
    ? atLocalDateTime(startDateKey, 0, 0)
    : combineLocalDateTime(startDateKey, startTime);

  switch (preset) {
    case 'day_before_22': {
      const notify = atLocalDateTime(startDateKey, 22, 0);
      notify.setDate(notify.getDate() - 1);
      return notify.toISOString();
    }
    case 'day_before_18': {
      const notify = atLocalDateTime(startDateKey, 18, 0);
      notify.setDate(notify.getDate() - 1);
      return notify.toISOString();
    }
    case 'morning_of_8':
      return atLocalDateTime(startDateKey, 8, 0).toISOString();
    case 'one_hour_before':
      if (allDay) {
        return null;
      }
      return new Date(eventStart.getTime() - 60 * 60 * 1000).toISOString();
    default:
      return null;
  }
};

const isSameInstant = (left: string, right: string): boolean =>
  new Date(left).getTime() === new Date(right).getTime();

export const inferNotifyTimingPreset = (
  notifyAt: string | null,
  input: NotifyTimingInput
): EventNotifyTimingPreset => {
  if (!notifyAt) {
    return DEFAULT_NOTIFY_TIMING_PRESET;
  }

  const candidates = NOTIFY_TIMING_OPTIONS.filter(
    (option) => !option.requiresTimedEvent || !input.allDay
  );

  for (const option of candidates) {
    const computed = computeNotifyAtFromPreset(option.value, input);
    if (computed && isSameInstant(computed, notifyAt)) {
      return option.value;
    }
  }

  return DEFAULT_NOTIFY_TIMING_PRESET;
};

export const getEventLocalDateKey = (startAt: string, allDay: boolean, startDateKey?: string): string => {
  if (allDay && startDateKey?.trim()) {
    return startDateKey;
  }
  return formatDateKey(new Date(startAt));
};
