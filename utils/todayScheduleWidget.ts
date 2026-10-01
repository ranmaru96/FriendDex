import * as Linking from 'expo-linking';
import { getAllTaskGroups, getAllTasks, getEventsByDateRange, initializeDatabase } from '@/db';
import type { Task, TaskGroup } from '@/types';
import {
  filterEventsByLocalDate,
  formatDateKey,
  formatEventScheduleLabelForCard,
  formatMonthDayLabel,
} from '@/utils/eventHelpers';
import { toYmd } from '@/utils/taskHelpers';
import {
  isGroupRequiredOnDate,
  isRecurringTaskRequiredOnDate,
  isTemporaryDueOnOrBefore,
  partitionTasksByGroup,
} from '@/utils/taskGroupHelpers';
import {
  TodayScheduleWidget,
  type TodayScheduleWidgetProps,
} from '@/widgets/TodayScheduleWidget';

const DAY_COUNT = 7;
const EVENT_SLOT_COUNT = 3;
const TASK_SLOT_COUNT = 3;

type WidgetTask = {
  title: string;
  kind: 'temporary' | 'recurring';
};

const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const blankProps = (dateLabel: string, openUrl: string): TodayScheduleWidgetProps => ({
  dateLabel,
  openUrl,
  eventCount: 0,
  taskCount: 0,
  eventTime0: '',
  eventTitle0: '',
  eventTime1: '',
  eventTitle1: '',
  eventTime2: '',
  eventTitle2: '',
  taskKind0: '',
  taskTitle0: '',
  taskKind1: '',
  taskTitle1: '',
  taskKind2: '',
  taskTitle2: '',
});

const requiredTasksForDay = (tasks: Task[], groups: TaskGroup[], day: Date): WidgetTask[] => {
  const ymd = toYmd(day);
  const items: WidgetTask[] = [];
  for (const task of tasks) {
    if (task.kind === 'temporary' && !task.completedAt && isTemporaryDueOnOrBefore(task, ymd)) {
      items.push({ title: task.title, kind: 'temporary' });
    }
  }
  const recurring = tasks.filter((task) => task.kind === 'recurring');
  const recurringGroups = groups.filter((group) => group.kind === 'recurring');
  const { bundles, ungrouped } = partitionTasksByGroup(recurring, recurringGroups, {
    includeEmptyGroups: true,
  });
  for (const task of ungrouped) {
    if (isRecurringTaskRequiredOnDate(task, day)) {
      items.push({ title: task.title, kind: 'recurring' });
    }
  }
  for (const bundle of bundles) {
    const individual = bundle.members.filter((task) => isRecurringTaskRequiredOnDate(task, day));
    if (individual.length > 0) {
      individual.forEach((task) => items.push({ title: task.title, kind: 'recurring' }));
    } else if (isGroupRequiredOnDate(bundle.group, bundle.members, day)) {
      items.push({ title: bundle.group.title, kind: 'recurring' });
    }
  }
  return items;
};

const buildDayProps = (
  events: ReturnType<typeof getEventsByDateRange>,
  tasks: Task[],
  groups: TaskGroup[],
  day: Date,
  openUrl: string
): TodayScheduleWidgetProps => {
  const dateKey = formatDateKey(day);
  const dayEvents = filterEventsByLocalDate(events, dateKey);
  const dayTasks = requiredTasksForDay(tasks, groups, day);
  const props = blankProps(formatMonthDayLabel(day), openUrl);
  props.eventCount = dayEvents.length;
  props.taskCount = dayTasks.length;
  dayEvents.slice(0, EVENT_SLOT_COUNT).forEach((event, index) => {
    const timeLabel = formatEventScheduleLabelForCard(event, dateKey);
    if (index === 0) {
      props.eventTime0 = timeLabel;
      props.eventTitle0 = event.title;
    } else if (index === 1) {
      props.eventTime1 = timeLabel;
      props.eventTitle1 = event.title;
    } else {
      props.eventTime2 = timeLabel;
      props.eventTitle2 = event.title;
    }
  });
  dayTasks.slice(0, TASK_SLOT_COUNT).forEach((task, index) => {
    if (index === 0) {
      props.taskKind0 = task.kind;
      props.taskTitle0 = task.title;
    } else if (index === 1) {
      props.taskKind1 = task.kind;
      props.taskTitle1 = task.title;
    } else {
      props.taskKind2 = task.kind;
      props.taskTitle2 = task.title;
    }
  });
  return props;
};

export const syncTodayScheduleWidget = (): void => {
  try {
    initializeDatabase();
    const today = startOfLocalDay(new Date());
    const rangeEnd = new Date(today);
    rangeEnd.setDate(rangeEnd.getDate() + DAY_COUNT);
    const events = getEventsByDateRange(today.toISOString(), rangeEnd.toISOString());
    const tasks = getAllTasks();
    const groups = getAllTaskGroups();
    const openUrl = Linking.createURL('/calendar');
    const entries = Array.from({ length: DAY_COUNT }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() + index);
      return {
        date: index === 0 ? new Date() : day,
        props: buildDayProps(events, tasks, groups, day, openUrl),
      };
    });
    TodayScheduleWidget.updateTimeline(entries);
  } catch {
    // The widget extension exists only after a native build that includes it.
  }
};

let syncTimer: ReturnType<typeof setTimeout> | null = null;

export const requestTodayScheduleWidgetSync = (): void => {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncTodayScheduleWidget();
  }, 400);
};
