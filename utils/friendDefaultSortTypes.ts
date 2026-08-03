export type FriendDefaultSortContext = {
  myselfId: string | null;
  todayKey: string;
  /** today+7 (inclusive window end for ①) */
  weekEndKey: string;
  hasToday: Set<string>;
  /** friendId → earliest start date key in (today, weekEnd] */
  nextUpcomingStartKey: Map<string, string>;
  /** friendId → latest end date key strictly before today */
  lastPastEndKey: Map<string, string>;
};
