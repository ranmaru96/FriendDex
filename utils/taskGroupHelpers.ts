import type { Task, TaskGroup } from '@/types';
import { formatRecurringActivityLabel, isRecurringDueOnDate, toYmd } from '@/utils/taskHelpers';

export type RecurringTaskGroupBundle = {
  group: TaskGroup;
  members: Task[];
};

/** 定期タスクをグループ束と未所属に分割。emptyGroups が true ならメンバー0のグループも残す */
export function partitionRecurringByGroup(
  tasks: Task[],
  groups: TaskGroup[],
  options?: { includeEmptyGroups?: boolean }
): { bundles: RecurringTaskGroupBundle[]; ungrouped: Task[] } {
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

  const bundles: RecurringTaskGroupBundle[] = [];
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
