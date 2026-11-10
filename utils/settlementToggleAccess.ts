import { getCachedAcceptedPeerIds } from '@/lib/connectionSync';
import type { MockSettlementRoom } from '@/types/settlementMock';
import { asAuthUserId, getFriendLinkedAuthUserId } from '@/utils/linkedAuthUser';

export function findMySettlementMemberId(
  room: Pick<MockSettlementRoom, 'members'>,
  myselfId: string | null
): string | null {
  const member = room.members.find(
    (item) => item.friendId === 'myself' || (myselfId !== null && item.friendId === myselfId)
  );
  return member?.id ?? null;
}

/** 自分以外で、コネクト済み（承認済み）のメンバー */
function otherMemberIsConnected(
  member: { friendId: string },
  myselfId: string | null
): boolean {
  if (member.friendId === 'myself' || (myselfId !== null && member.friendId === myselfId)) {
    return false;
  }
  const userId = member.friendId.startsWith('user:')
    ? asAuthUserId(member.friendId.slice('user:'.length))
    : getFriendLinkedAuthUserId(member.friendId);
  if (!userId) {
    return false;
  }
  return getCachedAcceptedPeerIds().has(userId.toLowerCase());
}

/** 自分以外で、コネクトしていないメンバー */
function memberIsUnlinkedPerson(
  member: { friendId: string },
  myselfId: string | null
): boolean {
  if (member.friendId === 'myself' || (myselfId !== null && member.friendId === myselfId)) {
    return false;
  }
  return !otherMemberIsConnected(member, myselfId);
}

/** 払う側と受け取る側がどちらもコネクトしていない人物 */
export function transferIsBetweenUnlinkedMembers(
  room: Pick<MockSettlementRoom, 'members'>,
  transfer: { fromMemberId: string; toMemberId: string },
  myselfId: string | null
): boolean {
  const from = room.members.find((member) => member.id === transfer.fromMemberId);
  const to = room.members.find((member) => member.id === transfer.toMemberId);
  if (!from || !to) {
    return false;
  }
  return memberIsUnlinkedPerson(from, myselfId) && memberIsUnlinkedPerson(to, myselfId);
}

/**
 * グループの済は、その送金の当事者か、
 * 両端がコネクトしていないときにグループを見ている人が押せる。
 */
export function canToggleGroupTransfer(
  room: Pick<MockSettlementRoom, 'members'>,
  transfer: { fromMemberId: string; toMemberId: string },
  myselfId: string | null
): boolean {
  const myMemberId = findMySettlementMemberId(room, myselfId);
  if (myMemberId && (transfer.fromMemberId === myMemberId || transfer.toMemberId === myMemberId)) {
    return true;
  }
  return transferIsBetweenUnlinkedMembers(room, transfer, myselfId);
}

/** 自分以外に、コネクト済みのメンバーがいる */
export function settlementRoomHasLinkablePeer(
  room: Pick<MockSettlementRoom, 'members'>,
  myselfId: string | null
): boolean {
  return room.members.some((member) => otherMemberIsConnected(member, myselfId));
}
