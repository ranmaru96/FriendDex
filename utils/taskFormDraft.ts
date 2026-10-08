import type { EpisodeEventLinkMode } from '@/hooks/useEpisodeForm';
import { deleteFormDraft, readFormDraftRecord } from '@/utils/formDraftStore';
import { formatDateKey, getAllDayDateKeysFromEvent } from '@/utils/eventHelpers';
import { DEFAULT_REMIND_TIME } from '@/utils/taskNotifications';
import { resolveMonthNths, resolveMonthWeekdays } from '@/utils/taskHelpers';
import type { Event, Task, TaskKind, TaskPace, TaskRecurrenceUnit } from '@/types';

const NEW_KEY = 'draft.task.new';

export type TaskFormDraft = {
  kind: TaskKind;
  title: string;
  memo: string;
  pace: TaskPace;
  unit: TaskRecurrenceUnit;
  weekdaysUnspecified: boolean;
  weekdays: number[];
  weekStartsOn: number;
  monthDay: number;
  monthMode: 'day' | 'nth';
  monthNths: number[];
  monthWeekdays: number[];
  yearMonth: number;
  yearDay: number;
  dueDate: string;
  eventLinkMode: EpisodeEventLinkMode;
  eventId: string;
  groupSelect: string;
  newGroupTitle: string;
  trackCompletions: boolean;
  remindEnabled: boolean;
  remindDaysBefore: number;
  remindTime: string;
  presetEventId: string;
  presetGroupId: string;
  presetKind: TaskKind | '';
};

export function taskDraftKey(taskId: string | null): string {
  return taskId ? `draft.task.${taskId}` : NEW_KEY;
}

export function serializeTaskForm(fields: TaskFormDraft): string {
  return JSON.stringify(fields);
}

const isKind = (value: unknown): value is TaskKind => value === 'recurring' || value === 'temporary';
const isPace = (value: unknown): value is TaskPace => value === 'scheduled' || value === 'unpaced';
const isUnit = (value: unknown): value is TaskRecurrenceUnit =>
  value === 'day' || value === 'week' || value === 'month' || value === 'year';
const isLink = (value: unknown): value is EpisodeEventLinkMode =>
  value === 'none' || value === 'existing' || value === 'create_new';
const isNums = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

export function parseTaskFormDraft(raw: string): TaskFormDraft | null {
  try {
    const value = JSON.parse(raw) as Partial<TaskFormDraft>;
    if (
      !isKind(value.kind) ||
      typeof value.title !== 'string' ||
      typeof value.memo !== 'string' ||
      !isPace(value.pace) ||
      !isUnit(value.unit) ||
      typeof value.weekdaysUnspecified !== 'boolean' ||
      !isNums(value.weekdays) ||
      typeof value.weekStartsOn !== 'number' ||
      typeof value.monthDay !== 'number' ||
      (value.monthMode !== 'day' && value.monthMode !== 'nth') ||
      !isNums(value.monthNths) ||
      !isNums(value.monthWeekdays) ||
      typeof value.yearMonth !== 'number' ||
      typeof value.yearDay !== 'number' ||
      typeof value.dueDate !== 'string' ||
      !isLink(value.eventLinkMode) ||
      typeof value.eventId !== 'string' ||
      typeof value.groupSelect !== 'string' ||
      typeof value.newGroupTitle !== 'string' ||
      typeof value.trackCompletions !== 'boolean' ||
      typeof value.remindEnabled !== 'boolean' ||
      typeof value.remindDaysBefore !== 'number' ||
      typeof value.remindTime !== 'string' ||
      typeof value.presetEventId !== 'string' ||
      typeof value.presetGroupId !== 'string' ||
      value.presetKind !== '' && !isKind(value.presetKind)
    ) {
      return null;
    }
    return {
      kind: value.kind,
      title: value.title,
      memo: value.memo,
      pace: value.pace,
      unit: value.unit,
      weekdaysUnspecified: value.weekdaysUnspecified,
      weekdays: value.weekdays,
      weekStartsOn: value.weekStartsOn,
      monthDay: value.monthDay,
      monthMode: value.monthMode,
      monthNths: value.monthNths,
      monthWeekdays: value.monthWeekdays,
      yearMonth: value.yearMonth,
      yearDay: value.yearDay,
      dueDate: value.dueDate,
      eventLinkMode: value.eventLinkMode,
      eventId: value.eventId,
      groupSelect: value.groupSelect,
      newGroupTitle: value.newGroupTitle,
      trackCompletions: value.trackCompletions,
      remindEnabled: value.remindEnabled,
      remindDaysBefore: value.remindDaysBefore,
      remindTime: value.remindTime,
      presetEventId: value.presetEventId,
      presetGroupId: value.presetGroupId,
      presetKind: value.presetKind,
    };
  } catch {
    return null;
  }
}

export function readTaskFormDraft(taskId: string | null): { base: string; fields: TaskFormDraft } | null {
  const record = readFormDraftRecord(taskDraftKey(taskId));
  if (!record) {
    return null;
  }
  const fields = parseTaskFormDraft(record.fields);
  if (!fields) {
    deleteFormDraft(taskDraftKey(taskId));
    return null;
  }
  return { base: record.base, fields };
}

export function deleteTaskFormDraft(taskId: string | null): void {
  deleteFormDraft(taskDraftKey(taskId));
}

function eventStartDateKey(event: Event): string {
  if (event.allDay) {
    return getAllDayDateKeysFromEvent(event).startDateKey;
  }
  return formatDateKey(new Date(event.startAt));
}

function blankTaskForm(args: {
  presetEventId: string;
  presetGroupId: string;
  presetKind: TaskKind | null;
}): TaskFormDraft {
  return {
    kind: args.presetKind ?? 'temporary',
    title: '',
    memo: '',
    pace: 'scheduled',
    unit: 'day',
    weekdaysUnspecified: false,
    weekdays: [1],
    weekStartsOn: 1,
    monthDay: 1,
    monthMode: 'day',
    monthNths: [1],
    monthWeekdays: [1],
    yearMonth: 1,
    yearDay: 1,
    dueDate: '',
    eventLinkMode: args.presetEventId ? 'existing' : 'none',
    eventId: args.presetEventId,
    groupSelect: args.presetGroupId || '',
    newGroupTitle: '',
    trackCompletions: true,
    remindEnabled: false,
    remindDaysBefore: 0,
    remindTime: DEFAULT_REMIND_TIME,
    presetEventId: args.presetEventId,
    presetGroupId: args.presetGroupId,
    presetKind: args.presetKind ?? '',
  };
}

export function buildTaskBaseline(args: {
  task: Task | null;
  presetEventId: string;
  presetGroupId: string;
  presetKind: TaskKind | null;
  linkedEvent: Event | null;
}): TaskFormDraft {
  const presets = {
    presetEventId: args.presetEventId,
    presetGroupId: args.presetGroupId,
    presetKind: args.presetKind,
  };
  if (args.task) {
    const task = args.task;
    const config = task.recurrenceConfig ?? {};
    const week = task.recurrenceUnit === 'week';
    const hasDays = Boolean(config.weekdays?.length);
    let monthMode: 'day' | 'nth' = 'day';
    let monthDay = 1;
    let monthNths = [1];
    let monthWeekdays = [1];
    if (config.monthDay != null) {
      monthMode = 'day';
      monthDay = config.monthDay;
    } else if (resolveMonthNths(config).length > 0) {
      monthMode = 'nth';
      monthNths = resolveMonthNths(config);
      monthWeekdays = resolveMonthWeekdays(config).length ? resolveMonthWeekdays(config) : [1];
    }
    return {
      ...blankTaskForm(presets),
      kind: task.eventId ? 'temporary' : task.kind,
      title: task.title,
      memo: task.memo ?? '',
      pace: task.pace ?? 'unpaced',
      unit: task.recurrenceUnit ?? 'day',
      weekdaysUnspecified: week ? !hasDays : false,
      weekdays: week ? (hasDays ? config.weekdays! : [1]) : config.weekdays?.length ? config.weekdays : [1],
      weekStartsOn: config.weekStartsOn ?? 1,
      monthDay,
      monthMode,
      monthNths,
      monthWeekdays,
      yearMonth: config.yearMonth ?? 1,
      yearDay: config.yearDay ?? 1,
      dueDate: task.dueDate ?? '',
      eventLinkMode: task.eventId ? 'existing' : 'none',
      eventId: task.eventId ?? '',
      groupSelect: task.groupId ?? '',
      newGroupTitle: '',
      trackCompletions: task.trackCompletions,
      remindEnabled: task.remindEnabled,
      remindDaysBefore: task.remindDaysBefore ?? 0,
      remindTime: task.remindTime ?? DEFAULT_REMIND_TIME,
    };
  }
  if (args.presetEventId) {
    return {
      ...blankTaskForm(presets),
      kind: 'temporary',
      eventId: args.presetEventId,
      eventLinkMode: 'existing',
      dueDate: args.linkedEvent ? eventStartDateKey(args.linkedEvent) : '',
      groupSelect: '',
      newGroupTitle: '',
      remindEnabled: false,
      remindDaysBefore: 0,
      remindTime: DEFAULT_REMIND_TIME,
    };
  }
  return {
    ...blankTaskForm(presets),
    eventLinkMode: 'none',
    kind: args.presetKind ?? 'temporary',
    groupSelect: args.presetGroupId || '',
    newGroupTitle: '',
    remindEnabled: false,
    remindDaysBefore: 0,
    remindTime: DEFAULT_REMIND_TIME,
  };
}
