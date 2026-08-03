import {
  getAllEvents,
  getAllFriends,
  getEventParticipantsForEvents,
  getMyself,
} from '@/db';
import type { Event, Friend } from '@/types';
import { formatDateKey, getAllDayDateKeysFromEvent, parseDateKey } from '@/utils/eventHelpers';
import { profileIdsToFriendIds } from '@/utils/eventParticipantHelpers';
import { computeProfileCompleteness } from '@/utils/profileCompleteness';
import {
  readDailyFriendOrderCache,
  writeDailyFriendOrderCache,
} from '@/utils/friendDefaultSortCache';
import type { FriendDefaultSortContext } from '@/utils/friendDefaultSortTypes';

export type { FriendDefaultSortContext } from '@/utils/friendDefaultSortTypes';
export { invalidateFriendDefaultSortCache } from '@/utils/friendDefaultSortCache';

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

function compareDateKeysAsc(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareDateKeysDesc(left: string, right: string): number {
  return right.localeCompare(left);
}

function habitSayingCount(friend: Friend): number {
  return (friend.traits?.length ?? 0) + (friend.sayings?.length ?? 0);
}

function episodeCount(friend: Friend): number {
  return friend.episodes?.length ?? 0;
}

function compareName(left: string, right: string): number {
  return left.localeCompare(right, 'ja', { sensitivity: 'base' });
}

/**
 * Build per-friend event facts for default person-card ordering.
 * Used when rebuilding the daily order snapshot.
 */
export function buildFriendDefaultSortContext(options?: {
  now?: Date;
  myselfId?: string | null;
  events?: Event[];
}): FriendDefaultSortContext {
  const now = options?.now ?? new Date();
  const todayKey = formatDateKey(now);
  const weekEndKey = addDaysToDateKey(todayKey, 7);
  const myselfId =
    options?.myselfId !== undefined ? options.myselfId : getMyself();

  const hasToday = new Set<string>();
  const nextUpcomingStartKey = new Map<string, string>();
  const lastPastEndKey = new Map<string, string>();

  const events = options?.events ?? getAllEvents();
  if (events.length === 0) {
    return {
      myselfId,
      todayKey,
      weekEndKey,
      hasToday,
      nextUpcomingStartKey,
      lastPastEndKey,
    };
  }

  const participantMap = getEventParticipantsForEvents(events.map((event) => event.id));

  events.forEach((event) => {
    const { startDateKey, endDateKey } = getAllDayDateKeysFromEvent(event);
    const participants = participantMap.get(event.id) ?? [];
    if (participants.length === 0) {
      return;
    }
    const friendIds = new Set(
      profileIdsToFriendIds(participants.map((participant) => participant.profileId))
        .map((friendId) => friendId.trim())
        .filter(Boolean)
    );

    const includesToday = startDateKey <= todayKey && todayKey <= endDateKey;
    const isUpcomingWindow =
      !includesToday && startDateKey > todayKey && startDateKey <= weekEndKey;
    const isPast = endDateKey < todayKey;

    friendIds.forEach((friendId) => {
      if (includesToday) {
        hasToday.add(friendId);
      }
      if (isUpcomingWindow) {
        const existing = nextUpcomingStartKey.get(friendId);
        if (!existing || compareDateKeysAsc(startDateKey, existing) < 0) {
          nextUpcomingStartKey.set(friendId, startDateKey);
        }
      }
      if (isPast) {
        const existing = lastPastEndKey.get(friendId);
        if (!existing || compareDateKeysAsc(endDateKey, existing) > 0) {
          lastPastEndKey.set(friendId, endDateKey);
        }
      }
    });
  });

  return {
    myselfId,
    todayKey,
    weekEndKey,
    hasToday,
    nextUpcomingStartKey,
    lastPastEndKey,
  };
}

/** Lexicographic compare against a freshly built context (daily snapshot rebuild). */
export function compareFriendsByDefaultOrder(
  left: Friend,
  right: Friend,
  context: FriendDefaultSortContext
): number {
  const leftToday = context.hasToday.has(left.id);
  const rightToday = context.hasToday.has(right.id);
  if (leftToday !== rightToday) {
    return leftToday ? -1 : 1;
  }

  const leftUpcoming = context.nextUpcomingStartKey.get(left.id) ?? null;
  const rightUpcoming = context.nextUpcomingStartKey.get(right.id) ?? null;
  if (leftUpcoming !== rightUpcoming) {
    if (!leftUpcoming) {
      return 1;
    }
    if (!rightUpcoming) {
      return -1;
    }
    const byUpcoming = compareDateKeysAsc(leftUpcoming, rightUpcoming);
    if (byUpcoming !== 0) {
      return byUpcoming;
    }
  }

  const leftPast = context.lastPastEndKey.get(left.id) ?? null;
  const rightPast = context.lastPastEndKey.get(right.id) ?? null;
  if (leftPast !== rightPast) {
    if (!leftPast) {
      return 1;
    }
    if (!rightPast) {
      return -1;
    }
    const byPast = compareDateKeysDesc(leftPast, rightPast);
    if (byPast !== 0) {
      return byPast;
    }
  }

  const byEpisodes = episodeCount(right) - episodeCount(left);
  if (byEpisodes !== 0) {
    return byEpisodes;
  }

  const byHabitSaying = habitSayingCount(right) - habitSayingCount(left);
  if (byHabitSaying !== 0) {
    return byHabitSaying;
  }

  const leftCompleteness = computeProfileCompleteness(left, Boolean(left.photoUri?.trim()));
  const rightCompleteness = computeProfileCompleteness(right, Boolean(right.photoUri?.trim()));
  if (leftCompleteness !== rightCompleteness) {
    return rightCompleteness - leftCompleteness;
  }

  return compareName(left.name, right.name);
}

type DailyOrderSnapshot = {
  todayKey: string;
  myselfId: string | null;
  rankById: Map<string, number>;
};

/**
 * Daily frozen order: recomputed only when the calendar day (or myself) changes.
 * Event / profile edits during the day do not rebuild this snapshot.
 */
function ensureDailyFriendOrderSnapshot(myselfId?: string | null): DailyOrderSnapshot {
  const todayKey = formatDateKey(new Date());
  const resolvedMyselfId = myselfId !== undefined ? myselfId : getMyself();
  const cachedIds = readDailyFriendOrderCache(todayKey, resolvedMyselfId);
  if (cachedIds) {
    return {
      todayKey,
      myselfId: resolvedMyselfId,
      rankById: new Map(cachedIds.map((id, index) => [id, index])),
    };
  }

  const context = buildFriendDefaultSortContext({ myselfId: resolvedMyselfId });
  const orderedIds = [...getAllFriends()]
    .sort((left, right) => {
      const leftMe = Boolean(resolvedMyselfId && left.id === resolvedMyselfId);
      const rightMe = Boolean(resolvedMyselfId && right.id === resolvedMyselfId);
      if (leftMe !== rightMe) {
        return leftMe ? -1 : 1;
      }
      return compareFriendsByDefaultOrder(left, right, context);
    })
    .map((friend) => friend.id);

  writeDailyFriendOrderCache(todayKey, resolvedMyselfId, orderedIds);
  return {
    todayKey,
    myselfId: resolvedMyselfId,
    rankById: new Map(orderedIds.map((id, index) => [id, index])),
  };
}

/** Compare using the daily frozen order. Unknown ids sort after known ones, then by name. */
export function compareFriendsByDailyOrder(
  left: Friend,
  right: Friend,
  myselfId?: string | null
): number {
  const { rankById, myselfId: snapshotMyselfId } = ensureDailyFriendOrderSnapshot(myselfId);
  const leftMe = Boolean(snapshotMyselfId && left.id === snapshotMyselfId);
  const rightMe = Boolean(snapshotMyselfId && right.id === snapshotMyselfId);
  if (leftMe !== rightMe) {
    return leftMe ? -1 : 1;
  }
  const leftRank = rankById.get(left.id);
  const rightRank = rankById.get(right.id);
  if (leftRank != null && rightRank != null && leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (leftRank != null && rightRank == null) {
    return -1;
  }
  if (leftRank == null && rightRank != null) {
    return 1;
  }
  return compareName(left.name, right.name);
}

/** Myself always first, then daily frozen ⓪–⑥ order. */
export function sortFriendsByDefaultOrder<T extends Friend>(
  friends: readonly T[],
  _context?: FriendDefaultSortContext
): T[] {
  return [...friends].sort((left, right) => compareFriendsByDailyOrder(left, right));
}

export function getAllFriendsInDefaultOrder(
  _context?: FriendDefaultSortContext
): Friend[] {
  return sortFriendsByDefaultOrder(getAllFriends());
}
