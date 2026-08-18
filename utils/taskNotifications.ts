import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  getAllTaskGroups,
  getAllTasks,
  getTasksByGroupId,
  isRecurringDoneOn,
} from '../db';
import type { Task, TaskGroup } from '../types';
import { addDays, isRecurringDueOnDate, parseYmd, toYmd } from '@/utils/taskHelpers';
import {
  isGroupRequiredWorkOpen,
} from '@/utils/taskGroupHelpers';
import {
  canScheduleNotifications,
  ensureNotificationInfrastructure,
} from '@/utils/eventNotifications';

export const DEFAULT_REMIND_TIME = '08:00';
export const MAX_REMIND_DAYS_BEFORE = 30;
export const TASK_REMIND_ID_PREFIX = 'fd-task-remind:';
export const GROUP_REMIND_ID_PREFIX = 'fd-group-remind:';

const TASK_ANDROID_CHANNEL_ID = 'frienddex-tasks';
const LOOKAHEAD_DAYS = 400;

export type TaskNotificationData = {
  kind: 'task-reminder';
};

export function normalizeRemindTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatRemindTimeLabel(value: string | null | undefined): string {
  const normalized = normalizeRemindTime(value) ?? DEFAULT_REMIND_TIME;
  const [hours, minutes] = normalized.split(':');
  return `${Number(hours)}:${minutes}`;
}

export function formatRemindDaysLabel(days: number): string {
  if (days <= 0) {
    return '当日';
  }
  return `${days}日前`;
}

export function remindTimeToDate(time: string, base = new Date()): Date {
  const normalized = normalizeRemindTime(time) ?? DEFAULT_REMIND_TIME;
  const [hours, minutes] = normalized.split(':').map(Number);
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function dateToRemindTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 今より前の分は使わない（秒は切り上げ） */
export function earliestRemindTimeDate(now = new Date()): Date {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);
  if (now.getSeconds() > 0 || now.getMilliseconds() > 0) {
    next.setMinutes(next.getMinutes() + 1);
  }
  return next;
}

export function clampRemindTimeToNow(time: string | null | undefined, now = new Date()): string {
  const min = earliestRemindTimeDate(now);
  const picked = remindTimeToDate(time || DEFAULT_REMIND_TIME, now);
  if (picked.getTime() < min.getTime()) {
    return dateToRemindTime(min);
  }
  return normalizeRemindTime(time) ?? DEFAULT_REMIND_TIME;
}

/** iOS の時刻スピナーが固まるのを防ぐため、min/max を両方渡す */
export function remindTimePickerBounds(now = new Date()): { minimumDate: Date; maximumDate: Date } {
  const minimumDate = earliestRemindTimeDate(now);
  let maximumDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (maximumDate.getTime() < minimumDate.getTime()) {
    maximumDate = new Date(minimumDate.getTime() + 60 * 1000);
  }
  return { minimumDate, maximumDate };
}

const atRemindTime = (ymd: string, time: string): Date => {
  const date = parseYmd(ymd);
  const normalized = normalizeRemindTime(time) ?? DEFAULT_REMIND_TIME;
  const [hours, minutes] = normalized.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const findNextFire = (
  matches: (date: Date) => boolean,
  time: string,
  now: Date
): Date | null => {
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) {
    if (matches(cursor)) {
      const fire = atRemindTime(toYmd(cursor), time);
      if (fire.getTime() > now.getTime()) {
        return fire;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return null;
};

const ensureTaskAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(TASK_ANDROID_CHANNEL_ID, {
    name: 'タスク',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
};

const cancelByPrefix = async (prefix: string): Promise<void> => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.identifier.startsWith(prefix))
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => undefined))
  );
};

const scheduleAt = async (
  identifier: string,
  title: string,
  body: string,
  fireAt: Date
): Promise<void> => {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title,
      body,
      data: { kind: 'task-reminder' } satisfies TaskNotificationData,
      ...(Platform.OS === 'android' ? { channelId: TASK_ANDROID_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
};

const temporaryFireAt = (task: Task, now: Date): Date | null => {
  if (!task.remindEnabled || task.kind !== 'temporary' || task.completedAt) {
    return null;
  }
  const due = task.dueDate?.trim();
  const time = normalizeRemindTime(task.remindTime);
  if (!due || !time) {
    return null;
  }
  const daysBefore = Math.min(
    MAX_REMIND_DAYS_BEFORE,
    Math.max(0, Math.floor(task.remindDaysBefore ?? 0))
  );
  const fire = atRemindTime(toYmd(addDays(parseYmd(due), -daysBefore)), time);
  if (fire.getTime() <= now.getTime()) {
    return null;
  }
  return fire;
};

const recurringTaskFireAt = (task: Task, now: Date): Date | null => {
  if (!task.remindEnabled || task.kind !== 'recurring' || task.groupId) {
    return null;
  }
  if (task.pace !== 'scheduled') {
    return null;
  }
  const time = normalizeRemindTime(task.remindTime);
  if (!time) {
    return null;
  }
  return findNextFire(
    (date) => {
      if (!isRecurringDueOnDate(task, date)) {
        return false;
      }
      return !isRecurringDoneOn(task, toYmd(date));
    },
    time,
    now
  );
};

const groupFireAt = (group: TaskGroup, members: Task[], now: Date): Date | null => {
  if (group.kind !== 'recurring' || !group.remindEnabled) {
    return null;
  }
  const time = normalizeRemindTime(group.remindTime);
  if (!time) {
    return null;
  }
  return findNextFire(
    (date) => isGroupRequiredWorkOpen(group, members, date, isRecurringDoneOn),
    time,
    now
  );
};

export const isTaskNotificationData = (value: unknown): value is TaskNotificationData => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (value as Partial<TaskNotificationData>).kind === 'task-reminder';
};

export const syncTaskReminders = async (): Promise<void> => {
  try {
    await cancelByPrefix(TASK_REMIND_ID_PREFIX);
    await cancelByPrefix(GROUP_REMIND_ID_PREFIX);

    const granted = await canScheduleNotifications();
    if (!granted) {
      return;
    }

    await ensureNotificationInfrastructure();
    await ensureTaskAndroidChannel();

    const now = new Date();
    const groups = getAllTaskGroups();
    const groupById = new Map(groups.map((group) => [group.id, group]));

    for (const task of getAllTasks()) {
      if (task.kind === 'temporary') {
        const fireAt = temporaryFireAt(task, now);
        if (!fireAt) {
          continue;
        }
        const group = task.groupId ? groupById.get(task.groupId) : undefined;
        const title = group?.title?.trim() || task.title;
        const body = group ? task.title : 'タスクのリマインダーです';
        await scheduleAt(`${TASK_REMIND_ID_PREFIX}${task.id}`, title, body, fireAt);
        continue;
      }

      const fireAt = recurringTaskFireAt(task, now);
      if (!fireAt) {
        continue;
      }
      await scheduleAt(
        `${TASK_REMIND_ID_PREFIX}${task.id}`,
        task.title,
        'タスクのリマインダーです',
        fireAt
      );
    }

    for (const group of groups) {
      if (group.kind !== 'recurring') {
        continue;
      }
      const members = getTasksByGroupId(group.id, 'recurring');
      const fireAt = groupFireAt(group, members, now);
      if (!fireAt) {
        continue;
      }
      await scheduleAt(
        `${GROUP_REMIND_ID_PREFIX}${group.id}`,
        group.title,
        '要対応のタスクがあります',
        fireAt
      );
    }
  } catch {
    // 通知API失敗はタスク保存を落とさない
  }
};
