import type { MockSettlementRoom } from '@/types/settlementMock';

export function findMySettlementMemberId(
  room: Pick<MockSettlementRoom, 'members'>,
  myselfId: string | null
): string | null {
  const member = room.members.find(
    (item) => item.friendId === 'myself' || (myselfId !== null && item.friendId === myselfId)
  );
  return member?.id ?? null;
}

/** グループの済は、払う側だけが押せる */
export function canToggleGroupTransfer(
  room: Pick<MockSettlementRoom, 'members'>,
  fromMemberId: string,
  myselfId: string | null
): boolean {
  const myMemberId = findMySettlementMemberId(room, myselfId);
  return Boolean(myMemberId && fromMemberId === myMemberId);
}
