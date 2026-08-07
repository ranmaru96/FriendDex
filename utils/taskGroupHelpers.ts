import type { Task, TaskGroup, TaskPace } from '@/types';
import {
  formatRecurringActivityLabel,
  isRecurringDueOnDate,
  toYmd,
  type TaskScheduleLike,
} from '@/utils/taskHelpers';

export type RecurringTaskGroupBundle = {
  group: TaskGroup;
  members: Task[];
};

export type TaskGroupBundle = RecurringTaskGroupBundle;

/** タスクをグループ束と未所属に分割。emptyGroups が true ならメンバー0のグループも残す */
export function partitionTasksByGroup(
  tasks: Task[],
  groups: TaskGroup[],
  options?: { includeEmptyGroups?: boolean }
): { bundles: TaskGroupBundle[]; ungrouped: Task[] } {
  const includeEmptyGroups = options?.includeEmptyGroups ?? false;
  const byGroupId = new Map<string, Task[]>();
  const ungrouped: Task[] = [];
  for (const task of tasks) {
    const groupId = task.groupId?.trim();
    if (!groupId) {
      ungrouped.push(task);
      continue;
    }
    const list = byGroupId.get(groupId) ?? [];
    list.push(task);
    byGroupId.set(groupId, list);
  }

  const bundles: TaskGroupBundle[] = [];
  for (const group of groups) {
    const members = byGroupId.get(group.id) ?? [];
    byGroupId.delete(group.id);
    if (members.length === 0 && !includeEmptyGroups) {
      continue;
    }
    bundles.push({ group, members });
  }
  // グループ行が消えているのに groupId が残っている場合は未所属扱い
  for (const orphans of byGroupId.values()) {
    ungrouped.push(...orphans);
  }
  return { bundles, ungrouped };
}

/** @deprecated Use partitionTasksByGroup */
export function partitionRecurringByGroup(
  tasks: Task[],
  groups: TaskGroup[],
  options?: { includeEmptyGroups?: boolean }
): { bundles: RecurringTaskGroupBundle[]; ungrouped: Task[] } {
  return partitionTasksByGroup(tasks, groups, options);
}

/** グループ実施日集合向けの活動ラベル（暦日の連続＝unpaced 相当） */
export function formatGroupActivityLabel(
  completedOnSet: Set<string>,
  asOf: Date = new Date()
): string {
  return formatRecurringActivityLabel(
    { pace: 'unpaced', recurrenceUnit: null, recurrenceConfig: null },
    completedOnSet,
    asOf
  );
}

export function isGroupDoneOn(completedOnSet: Set<string>, ymd: string): boolean {
  return completedOnSet.has(ymd);
}

/** 指定日に due な「記録ON」メンバのうち完了数 */
export function countGroupDueProgress(
  members: Task[],
  date: Date,
  isDoneOn: (task: Task, ymd: string) => boolean
): { done: number; total: number } {
  const ymd = toYmd(date);
  const dueMembers = members.filter(
    (task) => task.trackCompletions && isRecurringDueOnDate(task, date)
  );
  const done = dueMembers.filter((task) => isDoneOn(task, ymd)).length;
  return { done, total: dueMembers.length };
}

/** グループにドット／履歴を出すか（記録ONメンバが1人以上） */
export function groupTracksCompletions(members: Task[]): boolean {
  return members.some((task) => task.trackCompletions);
}

export function trackingMembers(members: Task[]): Task[] {
  return members.filter((task) => task.trackCompletions);
}

export function formatGroupListMeta(
  completedOnSet: Set<string>,
  progress: { done: number; total: number },
  asOf: Date = new Date()
): string {
  if (progress.total > 0) {
    return `今日 ${progress.done}/${progress.total}`;
  }
  return '';
}

/** 臨時グループ内で最も早い期限（YYYY-MM-DD）。期限なしのみなら null */
export function getNearestTemporaryGroupDueDate(members: Task[]): string | null {
  let nearest: string | null = null;
  for (const task of members) {
    const due = task.dueDate?.trim();
    if (!due) continue;
    if (nearest == null || due < nearest) {
      nearest = due;
    }
  }
  return nearest;
}

export function groupToScheduleLike(group: TaskGroup): TaskScheduleLike {
  return {
    pace: group.pace,
    recurrenceUnit: group.recurrenceUnit,
    recurrenceConfig: group.recurrenceConfig,
  };
}

/** 周期あり＆対象日 → 必須。周期なしは必須にならない */
export function isRecurringTaskRequiredOnDate(task: TaskScheduleLike, date: Date): boolean {
  if (task.pace !== 'scheduled') {
    return false;
  }
  return isRecurringDueOnDate(task, date);
}

/** 周期なし（記録のみ）→ 自由として今日触れる */
export function isRecurringTaskFree(task: TaskScheduleLike): boolean {
  return task.pace === 'unpaced' || task.pace == null;
}

/** グループ固有周期による必須日（メンバーは見ない） */
export function isGroupOwnRequiredOnDate(group: TaskGroup, date: Date): boolean {
  if (group.kind !== 'recurring') {
    return false;
  }
  if (group.pace !== 'scheduled') {
    return false;
  }
  return isRecurringDueOnDate(groupToScheduleLike(group), date);
}

/** グループ必須 = グループ周期 OR メンバーに必須が1つでもある */
export function isGroupRequiredOnDate(
  group: TaskGroup,
  members: Task[],
  date: Date
): boolean {
  if (isGroupOwnRequiredOnDate(group, date)) {
    return true;
  }
  return members.some((task) => isRecurringTaskRequiredOnDate(task, date));
}

/**
 * 定期タブ「本日対象」: 今日チェック可能なメンバーがいる、
 * または空グループでグループ自身が必須日。
 */
export function isGroupCheckableOnDate(
  group: TaskGroup,
  members: Task[],
  date: Date
): boolean {
  if (members.some((task) => isRecurringDueOnDate(task, date))) {
    return true;
  }
  return members.length === 0 && isGroupOwnRequiredOnDate(group, date);
}

/** 自由定期向け: 必須ではなく、自由メンバーがいる */
export function isGroupFreeOnDate(
  group: TaskGroup,
  members: Task[],
  date: Date
): boolean {
  if (isGroupRequiredOnDate(group, members, date)) {
    return false;
  }
  if (members.length === 0) {
    return false;
  }
  return members.some((task) => isRecurringTaskFree(task));
}

export function isTemporaryDueOnOrBefore(task: Task, ymd: string): boolean {
  const due = task.dueDate?.trim();
  if (!due) {
    return false;
  }
  return due <= ymd;
}

export function isTemporaryOpenIncompleteBucket(task: Task, ymd: string): boolean {
  const due = task.dueDate?.trim();
  return !due || due > ymd;
}

export function isCompletedOnLocalDay(iso: string | null | undefined, ymd: string): boolean {
  if (!iso) {
    return false;
  }
  return toYmd(new Date(iso)) === ymd;
}

export function normalizeGroupPace(pace: TaskPace | null | undefined): TaskPace {
  return pace === 'scheduled' ? 'scheduled' : 'unpaced';
}
