import { getEventParticipantsForEvents, getPastEvents } from '../db';
import type { Friend } from '../types';
import { profileIdsToFriendIds } from './eventParticipantHelpers';

const DEFAULT_RECENT_TOGETHER_LIMIT = 8;

/** 過去予定の同席から friendId → 最後に一緒だった start_at（ISO） */
export function buildLastTogetherAtByFriendIdFromPastEvents(
  excludeFriendId?: string | null,
  nowIso: string = new Date().toISOString()
): Map<string, string> {
  const excluded = excludeFriendId?.trim() ?? '';
  const events = getPastEvents(nowIso);
  if (events.length === 0) {
    return new Map();
  }

  const participantMap = getEventParticipantsForEvents(events.map((event) => event.id));
  const lastTogetherAtByFriendId = new Map<string, string>();

  events.forEach((event) => {
    const participants = participantMap.get(event.id) ?? [];
    if (participants.length === 0) {
      return;
    }

    const friendIds = profileIdsToFriendIds(participants.map((participant) => participant.profileId));
    const uniqueFriendIds = new Set(friendIds.map((friendId) => friendId.trim()).filter(Boolean));

    uniqueFriendIds.forEach((friendId) => {
      if (friendId === excluded) {
        return;
      }
      const existing = lastTogetherAtByFriendId.get(friendId);
      if (!existing || event.startAt.localeCompare(existing) > 0) {
        lastTogetherAtByFriendId.set(friendId, event.startAt);
      }
    });
  });

  return lastTogetherAtByFriendId;
}

export function sortFriendsByPastEventRecency(
  friends: Friend[],
  lastTogetherAtByFriendId: Map<string, string>
): Friend[] {
  return [...friends].sort((left, right) => {
    const leftTime = lastTogetherAtByFriendId.get(left.id) ?? '';
    const rightTime = lastTogetherAtByFriendId.get(right.id) ?? '';
    if (leftTime !== rightTime) {
      if (!leftTime) {
        return 1;
      }
      if (!rightTime) {
        return -1;
      }
      return rightTime.localeCompare(leftTime);
    }
    return left.name.localeCompare(right.name, 'ja');
  });
}

/** お金貸し借りの相手候補（本人除外・直近同席順） */
export function buildMoneyLoanCounterpartyFriends(
  friends: Friend[],
  myselfId: string | null,
  nowIso: string = new Date().toISOString()
): Friend[] {
  const filtered = myselfId
    ? friends.filter((friend) => friend.id !== myselfId)
    : friends;
  const lastTogetherAtByFriendId = buildLastTogetherAtByFriendIdFromPastEvents(myselfId, nowIso);
  return sortFriendsByPastEventRecency(filtered, lastTogetherAtByFriendId);
}

/** 過去予定ベースの「最近一緒にいた人」（新しい順・本人除外） */
export function getRecentTogetherFriendIdsFromPastEvents(options?: {
  limit?: number;
  validFriendIds?: Set<string>;
  excludeFriendId?: string | null;
  nowIso?: string;
}): string[] {
  const limit = options?.limit ?? DEFAULT_RECENT_TOGETHER_LIMIT;
  const validFriendIds = options?.validFriendIds;
  const excluded = options?.excludeFriendId?.trim() ?? '';
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const events = getPastEvents(nowIso);
  if (events.length === 0) {
    return [];
  }

  const participantMap = getEventParticipantsForEvents(events.map((event) => event.id));
  const seen = new Set<string>();
  const result: string[] = [];

  for (const event of events) {
    const participants = participantMap.get(event.id) ?? [];
    if (participants.length === 0) {
      continue;
    }

    const friendIds = profileIdsToFriendIds(participants.map((participant) => participant.profileId));
    for (const friendId of friendIds) {
      const normalized = friendId.trim();
      if (!normalized || normalized === excluded || seen.has(normalized)) {
        continue;
      }
      if (validFriendIds && !validFriendIds.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      result.push(normalized);
      if (result.length >= limit) {
        return result;
      }
    }
  }

  return result;
}
