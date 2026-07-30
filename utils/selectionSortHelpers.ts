const compareSelectedFirst = (aSelected: boolean, bSelected: boolean): number => {
  if (aSelected !== bSelected) {
    return aSelected ? -1 : 1;
  }
  return 0;
};

const compareName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

/** 選択済みを上、各グループ内は名前順 */
export function sortFriendsBySelectedIds<T extends { id: string; name: string }>(
  items: readonly T[],
  selectedIds: ReadonlySet<string>
): T[] {
  return [...items].sort((a, b) => {
    const bySelection = compareSelectedFirst(selectedIds.has(a.id), selectedIds.has(b.id));
    if (bySelection !== 0) {
      return bySelection;
    }
    return compareName(a.name, b.name);
  });
}

/** 単一選択: 選択中を上、それ以外は名前順 */
export function sortFriendsBySelectedId<T extends { id: string; name: string }>(
  items: readonly T[],
  selectedId: string | null
): T[] {
  if (!selectedId) {
    return [...items].sort((a, b) => compareName(a.name, b.name));
  }
  return sortFriendsBySelectedIds(items, new Set([selectedId]));
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
