import * as Linking from 'expo-linking';
import { addUserInteractionListener } from 'expo-widgets';
import { Platform } from 'react-native';
import {
  completeTemporaryTask,
  getAllTaskGroups,
  getAllTasks,
  getEventsByDateRange,
  getTask,
  getWidgetShowRecurringTasks,
  initializeDatabase,
  isRecurringDoneOn,
  reopenTemporaryTask,
  setRecurringDoneOn,
} from '@/db';
import type { Event, Task, TaskGroup } from '@/types';
import {
  filterEventsByLocalDate,
  formatDateKey,
  formatEventScheduleLabelForCard,
  formatMonthDayLabel,
} from '@/utils/eventHelpers';
import { formatRecurrenceLabel, formatTaskDueDateLabel, toYmd } from '@/utils/taskHelpers';
import {
  isCompletedOnLocalDay,
  isGroupFreeOnDate,
  isGroupRequiredOnDate,
  isRecurringTaskFree,
  isRecurringTaskRequiredOnDate,
  isTemporaryDueOnOrBefore,
  isTemporaryOpenIncompleteBucket,
  mergeTemporaryItemsByDueDate,
  partitionTasksByGroup,
  type TaskGroupBundle,
} from '@/utils/taskGroupHelpers';
import {
  TodayScheduleWidget,
  type TodayScheduleWidgetProps,
} from '@/widgets/TodayScheduleWidget';

const DAY_COUNT = 7;
const EVENT_SLOT_COUNT = 5;
const TASK_ROW_LIMIT = 10;

type WidgetTask = {
  id: string;
  title: string;
  due: string;
  required: boolean;
  done: boolean;
};

type RequiredPreviewTask = {
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
  screenTaskCount: 0,
  eventTime0: '',
  eventTitle0: '',
  eventTime1: '',
  eventTitle1: '',
  eventTime2: '',
  eventTitle2: '',
  eventTime3: '',
  eventTitle3: '',
  eventTime4: '',
  eventTitle4: '',
  taskKind0: '',
  taskTitle0: '',
  taskKind1: '',
  taskTitle1: '',
  taskKind2: '',
  taskTitle2: '',
  taskRows: '',
});

const dueLabelForTask = (task: Task, day: Date): string => {
  if (task.kind === 'temporary') {
    return task.dueDate ? formatTaskDueDateLabel(task.dueDate, day) : '';
  }
  return formatRecurrenceLabel(task.pace, task.recurrenceUnit, task.recurrenceConfig);
};

const toWidgetTask = (task: Task, day: Date, required: boolean): WidgetTask => ({
  id: task.id,
  title: task.title,
  due: dueLabelForTask(task, day),
  required,
  done: task.kind === 'recurring' ? isRecurringDoneOn(task, toYmd(day)) : Boolean(task.completedAt),
});

const pushUnique = (items: WidgetTask[], seen: Set<string>, task: Task, day: Date, required: boolean) => {
  if (seen.has(task.id)) {
    return;
  }
  seen.add(task.id);
  items.push(toWidgetTask(task, day, required));
};

const recurringMembersInScreenOrder = (bundle: TaskGroupBundle, day: Date): Task[] => {
  const requiredMembers = bundle.members.filter((task) => isRecurringTaskRequiredOnDate(task, day));
  if (requiredMembers.length > 0) {
    return requiredMembers;
  }
  return bundle.members.filter(
    (task) => isRecurringTaskFree(task) || isRecurringTaskRequiredOnDate(task, day)
  );
};

/** タスク画面「今日」の上から順。グループは折りたたまず、中のタスクをその順で出す。 */
const tasksInTodayScreenOrder = (
  tasks: Task[],
  groups: TaskGroup[],
  day: Date,
  includeRecurringTasks = true
): WidgetTask[] => {
  const ymd = toYmd(day);
  const temporary = tasks.filter((task) => task.kind === 'temporary' && !task.completedAt);
  const recurring = includeRecurringTasks ? tasks.filter((task) => task.kind === 'recurring') : [];
  const temporaryGroups = groups.filter((group) => group.kind === 'temporary');
  const recurringGroups = includeRecurringTasks
    ? groups.filter((group) => group.kind === 'recurring')
    : [];

  const { bundles: temporaryBundles, ungrouped: temporaryUngrouped } = partitionTasksByGroup(
    temporary,
    temporaryGroups
  );
  const actionTemporaryBundles = temporaryBundles.filter((bundle) =>
    bundle.members.some((task) => isTemporaryDueOnOrBefore(task, ymd))
  );
  const actionTemporaryItems = mergeTemporaryItemsByDueDate(
    actionTemporaryBundles,
    temporaryUngrouped.filter((task) => isTemporaryDueOnOrBefore(task, ymd))
  );

  const { bundles: recurringBundles, ungrouped: recurringUngrouped } = partitionTasksByGroup(
    recurring,
    recurringGroups
  );
  const actionRecurringBundles = recurringBundles.filter((bundle) =>
    isGroupRequiredOnDate(bundle.group, bundle.members, day)
  );
  const freeRecurringBundles = recurringBundles.filter((bundle) =>
    isGroupFreeOnDate(bundle.group, bundle.members, day)
  );

  const actionGroupIds = new Set(actionTemporaryBundles.map((bundle) => bundle.group.id));
  const openTemporaryItems = mergeTemporaryItemsByDueDate(
    temporaryBundles.filter((bundle) => !actionGroupIds.has(bundle.group.id)),
    temporaryUngrouped.filter((task) => isTemporaryOpenIncompleteBucket(task, ymd))
  );

  const items: WidgetTask[] = [];
  const seen = new Set<string>();

  for (const item of actionTemporaryItems) {
    const members =
      item.type === 'task'
        ? [item.task]
        : item.bundle.members.filter((task) => isTemporaryDueOnOrBefore(task, ymd));
    members.forEach((task) => pushUnique(items, seen, task, day, true));
  }
  for (const bundle of actionRecurringBundles) {
    recurringMembersInScreenOrder(bundle, day).forEach((task) => pushUnique(items, seen, task, day, true));
  }
  recurringUngrouped
    .filter((task) => isRecurringTaskRequiredOnDate(task, day))
    .forEach((task) => pushUnique(items, seen, task, day, true));
  for (const bundle of freeRecurringBundles) {
    bundle.members
      .filter((task) => isRecurringTaskFree(task))
      .forEach((task) => pushUnique(items, seen, task, day, false));
  }
  recurringUngrouped
    .filter((task) => isRecurringTaskFree(task))
    .forEach((task) => pushUnique(items, seen, task, day, false));
  for (const item of openTemporaryItems) {
    const members = item.type === 'task' ? [item.task] : item.bundle.members;
    members.forEach((task) => pushUnique(items, seen, task, day, false));
  }

  const completedToday = tasks.filter(
    (task) => task.kind === 'temporary' && isCompletedOnLocalDay(task.completedAt, ymd)
  );
  const { bundles: completedBundles, ungrouped: completedUngrouped } = partitionTasksByGroup(
    completedToday,
    temporaryGroups
  );
  for (const bundle of completedBundles) {
    bundle.members.forEach((task) => pushUnique(items, seen, task, day, false));
  }
  completedUngrouped.forEach((task) => pushUnique(items, seen, task, day, false));
  return items.filter((task) => !task.done);
};

/** 予定・タスク以外の表示で使っている、要対応だけの先頭3件。 */
const requiredTasksForDay = (
  tasks: Task[],
  groups: TaskGroup[],
  day: Date,
  includeRecurringTasks = true
): RequiredPreviewTask[] => {
  const ymd = toYmd(day);
  const items: RequiredPreviewTask[] = [];
  for (const task of tasks) {
    if (task.kind === 'temporary' && !task.completedAt && isTemporaryDueOnOrBefore(task, ymd)) {
      items.push({ title: task.title, kind: 'temporary' });
    }
  }
  const recurring = includeRecurringTasks ? tasks.filter((task) => task.kind === 'recurring') : [];
  const recurringGroups = includeRecurringTasks
    ? groups.filter((group) => group.kind === 'recurring')
    : [];
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

const encodeTaskRows = (tasks: WidgetTask[]): string =>
  tasks
    .slice(0, TASK_ROW_LIMIT)
    .map((task) =>
      [
        task.required ? '1' : '0',
        task.done ? '1' : '0',
        task.title.replace(/[\t\n]/g, ' '),
        task.due.replace(/[\t\n]/g, ' '),
        task.id.replace(/[\t\n]/g, ''),
      ].join('\t')
    )
    .join('\n');

const eventEndsAt = (event: Event): number => {
  const ms = new Date(event.endAt ?? event.startAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const buildDayProps = (
  events: ReturnType<typeof getEventsByDateRange>,
  tasks: Task[],
  groups: TaskGroup[],
  day: Date,
  openUrl: string,
  includeRecurringTasks = true,
  asOf?: Date
): TodayScheduleWidgetProps => {
  const dateKey = formatDateKey(day);
  const asOfMs = asOf?.getTime();
  const dayEvents = filterEventsByLocalDate(events, dateKey).filter((event) => {
    if (asOfMs === undefined) {
      return true;
    }
    return eventEndsAt(event) > asOfMs;
  });
  const screenTasks = tasksInTodayScreenOrder(tasks, groups, day, includeRecurringTasks);
  const requiredTasks = requiredTasksForDay(tasks, groups, day, includeRecurringTasks);
  const props = blankProps(formatMonthDayLabel(day), openUrl);
  props.eventCount = dayEvents.length;
  props.taskCount = requiredTasks.length;
  props.screenTaskCount = screenTasks.length;
  props.taskRows = encodeTaskRows(screenTasks);
  dayEvents.slice(0, EVENT_SLOT_COUNT).forEach((event, index) => {
    const timeLabel = formatEventScheduleLabelForCard(event, dateKey);
    if (index === 0) {
      props.eventTime0 = timeLabel;
      props.eventTitle0 = event.title;
    } else if (index === 1) {
      props.eventTime1 = timeLabel;
      props.eventTitle1 = event.title;
    } else if (index === 2) {
      props.eventTime2 = timeLabel;
      props.eventTitle2 = event.title;
    } else if (index === 3) {
      props.eventTime3 = timeLabel;
      props.eventTitle3 = event.title;
    } else {
      props.eventTime4 = timeLabel;
      props.eventTitle4 = event.title;
    }
  });
  requiredTasks.slice(0, 3).forEach((task, index) => {
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
  void (async () => {
    try {
      initializeDatabase();
      const today = startOfLocalDay(new Date());
      const rangeEnd = new Date(today);
      rangeEnd.setDate(rangeEnd.getDate() + DAY_COUNT);
      const events = getEventsByDateRange(today.toISOString(), rangeEnd.toISOString());
      const tasks = getAllTasks();
      const groups = getAllTaskGroups();
      const openUrl = Linking.createURL('/');
      const includeRecurringTasks = getWidgetShowRecurringTasks();
      const nowDate = new Date();
      const entries = Array.from({ length: DAY_COUNT }, (_, index) => {
        const day = new Date(today);
        day.setDate(today.getDate() + index);
        return {
          date: index === 0 ? nowDate : day,
          props: buildDayProps(
            events,
            tasks,
            groups,
            day,
            openUrl,
            includeRecurringTasks,
            index === 0 ? nowDate : undefined
          ),
        };
      });
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const endMarks = Array.from(
        new Set(
          filterEventsByLocalDate(events, formatDateKey(today))
            .filter((event) => !event.allDay)
            .map(eventEndsAt)
            .filter((ms) => ms > nowDate.getTime() && ms < tomorrow.getTime())
        )
      ).sort((left, right) => left - right);
      for (const ms of endMarks) {
        const at = new Date(ms);
        entries.push({
          date: at,
          props: buildDayProps(events, tasks, groups, today, openUrl, includeRecurringTasks, at),
        });
      }
      const now = nowDate.getTime();
      const holds = (await readTodayWidgetRows()).filter(
        (row) => row.done && row.pendingAt > 0 && now < row.pendingAt + HOLD_MS
      );
      if (holds.length > 0) {
        const withHolds = (props: TodayScheduleWidgetProps): TodayScheduleWidgetProps => ({
          ...props,
          taskRows: overlayHolds(props.taskRows, holds),
        });
        for (const entry of entries) {
          if (startOfLocalDay(entry.date).getTime() === today.getTime()) {
            entry.props = withHolds(entry.props);
          }
        }
        const revealAt = Math.min(...holds.map((hold) => hold.pendingAt + HOLD_MS)) + 200;
        const revealAsOf = new Date(revealAt);
        entries.push({
          date: revealAsOf,
          props: withHolds(
            buildDayProps(events, tasks, groups, today, openUrl, includeRecurringTasks, revealAsOf)
          ),
        });
      }
      entries.sort((left, right) => left.date.getTime() - right.date.getTime());
      TodayScheduleWidget.updateTimeline(entries);
    } catch {
      // The widget extension exists only after a native build that includes it.
    }
  })();
};

const HOLD_MS = 10000;

type WidgetCheckRow = { id: string; done: boolean; pendingAt: number };

const parseWidgetTaskRows = (raw: string): WidgetCheckRow[] =>
  raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('\t');
      const pendingAt = Number(parts[5] ?? '0');
      return {
        done: parts[1] === '1',
        id: (parts[4] ?? '').trim(),
        pendingAt: Number.isFinite(pendingAt) ? pendingAt : 0,
      };
    })
    .filter((row) => row.id.length > 0);

const readTodayWidgetRows = async (): Promise<WidgetCheckRow[]> => {
  const widget = TodayScheduleWidget as typeof TodayScheduleWidget & {
    getTimeline?: () => Promise<{ date: Date; props: TodayScheduleWidgetProps }[]>;
  };
  if (typeof widget.getTimeline !== 'function') {
    return [];
  }
  const entries = await widget.getTimeline();
  const now = Date.now();
  const today = startOfLocalDay(new Date());
  const todayEntries = entries.filter(
    (entry) => startOfLocalDay(entry.date).getTime() === today.getTime() && entry.date.getTime() <= now
  );
  const todayEntry =
    todayEntries.sort((left, right) => right.date.getTime() - left.date.getTime())[0] ?? entries[0];
  if (!todayEntry?.props.taskRows) {
    return [];
  }
  return parseWidgetTaskRows(todayEntry.props.taskRows);
};

const applyWidgetTaskRow = (row: WidgetCheckRow, ymd: string): boolean => {
  const task = getTask(row.id);
  if (!task) {
    return false;
  }
  if (task.kind === 'temporary') {
    const completed = Boolean(task.completedAt);
    if (row.done && !completed) {
      completeTemporaryTask(task.id);
      return true;
    }
    if (!row.done && completed && isCompletedOnLocalDay(task.completedAt, ymd)) {
      reopenTemporaryTask(task.id);
      return true;
    }
    return false;
  }
  if (task.kind === 'recurring' && isRecurringDoneOn(task, ymd) !== row.done) {
    setRecurringDoneOn(task, ymd, row.done);
    return true;
  }
  return false;
};

const overlayHolds = (raw: string, holds: WidgetCheckRow[]): string => {
  if (holds.length === 0) {
    return raw;
  }
  const pendingById = new Map(holds.map((hold) => [hold.id, hold.pendingAt]));
  return raw
    .split('\n')
    .map((line) => {
      if (!line) {
        return line;
      }
      const parts = line.split('\t');
      const pendingAt = pendingById.get((parts[4] ?? '').trim());
      if (!pendingAt) {
        return line;
      }
      parts[1] = '1';
      while (parts.length < 6) {
        parts.push('');
      }
      parts[5] = String(pendingAt);
      return parts.join('\t');
    })
    .join('\n');
};

let holdTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleHoldCommit = (holds: WidgetCheckRow[]) => {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  const now = Date.now();
  const wait = holds.reduce<number | null>((soonest, hold) => {
    const remaining = hold.pendingAt + HOLD_MS - now;
    if (remaining <= 0) {
      return soonest;
    }
    if (soonest === null || remaining < soonest) {
      return remaining;
    }
    return soonest;
  }, null);
  if (wait === null) {
    return;
  }
  holdTimer = setTimeout(() => {
    holdTimer = null;
    void absorbWidgetTaskChecks().finally(() => {
      requestTodayScheduleWidgetSync();
    });
  }, wait + 80);
};

type AbsorbResult = { committed: boolean; activeHolds: WidgetCheckRow[] };

/** チェックから10秒はデータベースへ書かず、過ぎた分だけ完了状態に合わせる。 */
export const absorbWidgetTaskChecks = async (): Promise<AbsorbResult> => {
  const empty: AbsorbResult = { committed: false, activeHolds: [] };
  try {
    const rows = await readTodayWidgetRows();
    if (rows.length === 0) {
      return empty;
    }
    initializeDatabase();
    const now = Date.now();
    const today = toYmd(startOfLocalDay(new Date()));
    const activeHolds: WidgetCheckRow[] = [];
    let committed = false;
    for (const row of rows) {
      if (row.done && row.pendingAt > 0 && now < row.pendingAt + HOLD_MS) {
        activeHolds.push(row);
        continue;
      }
      if (applyWidgetTaskRow(row, today)) {
        committed = true;
      }
    }
    if (activeHolds.length > 0) {
      scheduleHoldCommit(activeHolds);
    } else if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    return { committed, activeHolds };
  } catch {
    return empty;
  }
};

let widgetToggleListenerStarted = false;
let widgetHoldWatch: ReturnType<typeof setInterval> | null = null;

export const listenForTodayScheduleWidgetToggles = (): void => {
  if (widgetToggleListenerStarted || Platform.OS !== 'ios') {
    return;
  }
  widgetToggleListenerStarted = true;
  let lastHoldKey = '';
  const settleChecks = () => {
    void absorbWidgetTaskChecks().then((result) => {
      const holdKey = result.activeHolds.map((hold) => hold.id + ':' + String(hold.pendingAt)).join('|');
      if (result.committed || holdKey !== lastHoldKey) {
        lastHoldKey = holdKey;
        requestTodayScheduleWidgetSync();
      }
    });
  };
  addUserInteractionListener((event) => {
    if (event.source !== 'TodayScheduleWidget' || !event.target.startsWith('task:')) {
      return;
    }
    settleChecks();
  });
  if (!widgetHoldWatch) {
    widgetHoldWatch = setInterval(settleChecks, 2000);
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
