import type { MockFollowRelation, MockSettlementMember, MockSettlementRoom } from '@/types/settlementMock';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';

export const MOCK_FOLLOW_RELATION_LABELS: Record<MockFollowRelation, string> = {
  mutual: '相互フォロー',
  outgoing: 'フォロー中',
  incoming: 'フォロワー',
  none: '未フォロー',
};

/** デモ用: friendId の並びから安定したフォロー関係を割り当て */
export function getMockFollowRelation(
  friendId: string,
  orderedFriendIds: string[],
  excludeFriendId?: string | null
): MockFollowRelation {
  if (excludeFriendId && friendId === excludeFriendId) {
    return 'none';
  }
  const index = orderedFriendIds.indexOf(friendId);
  if (index < 0) {
    return 'none';
  }
  switch (index % 4) {
    case 0:
      return 'mutual';
    case 1:
      return 'outgoing';
    case 2:
      return 'incoming';
    default:
      return 'none';
  }
}

export function canSelectForSettlementGroup(relation: MockFollowRelation): boolean {
  return relation === 'mutual' || relation === 'outgoing' || relation === 'incoming';
}

/** 相手の管理台帳に自動でグループが載るか（相互フォロー） */
export function willAutoSyncLedger(relation: MockFollowRelation): boolean {
  return relation === 'mutual';
}

/** 相手の管理台帳には通知→承認が必要か（片方向フォロー） */
export function needsLedgerInvite(relation: MockFollowRelation): boolean {
  return relation === 'outgoing' || relation === 'incoming';
}

/** @deprecated willAutoSyncLedger を使用 */
export function willAutoJoinGroup(relation: MockFollowRelation): boolean {
  return willAutoSyncLedger(relation);
}

export function buildSettlementMemberChips(
  members: MockSettlementMember[],
  options?: {
    myselfId?: string | null;
    friendNameById?: Map<string, string>;
    friendPhotoById?: Map<string, string | null>;
  }
): ParticipantChipDisplay[] {
  return members.map((member) => {
    const lookupId =
      member.friendId === 'myself' ? (options?.myselfId?.trim() || null) : member.friendId;
    const label =
      options?.friendNameById != null
        ? resolveMockSettlementMemberDisplayName(member, {
            myselfId: options.myselfId ?? null,
            friendNameById: options.friendNameById,
          })
        : member.displayName;
    return {
      id: member.id,
      kind: 'individual',
      label,
      friendId: lookupId ?? undefined,
      photoUri: lookupId ? options?.friendPhotoById?.get(lookupId) ?? null : null,
    };
  });
}

/** プロフィールの現在名でメンバー表示名を解決（登録時スナップショットより優先） */
export function resolveMockSettlementMemberDisplayName(
  member: MockSettlementMember,
  options: { myselfId: string | null; friendNameById: Map<string, string> }
): string {
  const { myselfId, friendNameById } = options;
  if (member.friendId === 'myself' || (myselfId !== null && member.friendId === myselfId)) {
    if (myselfId) {
      return friendNameById.get(myselfId) ?? (member.displayName.trim() || '自分');
    }
    return member.displayName.trim() || '自分';
  }
  return friendNameById.get(member.friendId) ?? member.displayName;
}

export function withResolvedSettlementRoomNames(
  rooms: MockSettlementRoom[],
  options: { myselfId: string | null; friendNameById: Map<string, string> }
): MockSettlementRoom[] {
  return rooms.map((room) => withResolvedSettlementRoomName(room, options));
}

export function withResolvedSettlementRoomName(
  room: MockSettlementRoom,
  options: { myselfId: string | null; friendNameById: Map<string, string> }
): MockSettlementRoom {
  let changed = false;
  const members = room.members.map((member) => {
    const displayName = resolveMockSettlementMemberDisplayName(member, options);
    if (displayName === member.displayName) {
      return member;
    }
    changed = true;
    return { ...member, displayName };
  });
  return changed ? { ...room, members } : room;
}

/** @deprecated needsLedgerInvite を使用 */
export function willSendInvite(relation: MockFollowRelation): boolean {
  return needsLedgerInvite(relation);
}
