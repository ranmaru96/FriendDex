import type { Friend } from '@/types';
import { getMyself } from '@/db';
import { compareFriendsByDailyOrder } from '@/utils/friendDefaultSort';

const compareSelectedFirst = (aSelected: boolean, bSelected: boolean): number => {
  if (aSelected !== bSelected) {
    return aSelected ? -1 : 1;
  }
  return 0;
};

const compareName = (a: string, b: string): number =>
  a.localeCompare(b, 'ja', { sensitivity: 'base' });

type FriendSortOptions = {
  myselfId?: string | null;
};

function resolveMyselfId(options?: FriendSortOptions): string | null {
  return options?.myselfId !== undefined ? options.myselfId : getMyself();
}

/** 本人最優先 → 選択済み優先 → 当日固定のデフォルト人物並び */
export function sortFriendsBySelectedIds<T extends Friend>(
  items: readonly T[],
  selectedIds: ReadonlySet<string>,
  options?: FriendSortOptions
): T[] {
  const myselfId = resolveMyselfId(options);
  return [...items].sort((a, b) => {
    const aMe = Boolean(myselfId && a.id === myselfId);
    const bMe = Boolean(myselfId && b.id === myselfId);
    if (aMe !== bMe) {
      return aMe ? -1 : 1;
    }
    const bySelection = compareSelectedFirst(selectedIds.has(a.id), selectedIds.has(b.id));
    if (bySelection !== 0) {
      return bySelection;
    }
    return compareFriendsByDailyOrder(a, b, myselfId);
  });
}

/** 単一選択: 本人 → 選択中 → 当日固定デフォルト並び */
export function sortFriendsBySelectedId<T extends Friend>(
  items: readonly T[],
  selectedId: string | null,
  options?: FriendSortOptions
): T[] {
  const myselfId = resolveMyselfId(options);
  if (!selectedId) {
    return [...items].sort((a, b) => compareFriendsByDailyOrder(a, b, myselfId));
  }
  return sortFriendsBySelectedIds(items, new Set([selectedId]), { myselfId });
}

/** 所属グループ等: 選択済み value を上、各グループ内はラベル順 */
export function sortOptionsBySelectedValues(
  items: readonly { label: string; value: string }[],
  selectedValues: ReadonlySet<string>
): { label: string; value: string }[] {
  return [...items].sort((a, b) => {
    const bySelection = compareSelectedFirst(
      selectedValues.has(a.value),
      selectedValues.has(b.value)
    );
    if (bySelection !== 0) {
      return bySelection;
    }
    return compareName(a.label, b.label);
  });
}

/** displayName ベース（精算メンバーなど） */
export function sortMembersBySelectedIds<T extends { id: string; displayName: string }>(
  items: readonly T[],
  selectedIds: ReadonlySet<string>
): T[] {
  return [...items].sort((a, b) => {
    const bySelection = compareSelectedFirst(selectedIds.has(a.id), selectedIds.has(b.id));
    if (bySelection !== 0) {
      return bySelection;
    }
    return compareName(a.displayName, b.displayName);
  });
}

/** 単一選択（立替者など） */
export function sortMembersBySelectedId<T extends { id: string; displayName: string }>(
  items: readonly T[],
  selectedId: string | null
): T[] {
  if (!selectedId) {
    return [...items].sort((a, b) => compareName(a.displayName, b.displayName));
  }
  return sortMembersBySelectedIds(items, new Set([selectedId]));
}
