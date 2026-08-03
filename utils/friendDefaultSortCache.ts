type DailyFriendOrderCacheEntry = {
  todayKey: string;
  myselfId: string | null;
  orderedIds: string[];
};

let cache: DailyFriendOrderCacheEntry | null = null;

/** Kept for rare manual reset; daily order is not invalidated by event/profile edits. */
export function invalidateFriendDefaultSortCache(): void {
  cache = null;
}

export function readDailyFriendOrderCache(
  todayKey: string,
  myselfId: string | null
): string[] | null {
  if (!cache) {
    return null;
  }
  if (cache.todayKey !== todayKey || cache.myselfId !== myselfId) {
    return null;
  }
  return cache.orderedIds;
}

export function writeDailyFriendOrderCache(
  todayKey: string,
  myselfId: string | null,
  orderedIds: readonly string[]
): void {
  cache = {
    todayKey,
    myselfId,
    orderedIds: [...orderedIds],
  };
}
