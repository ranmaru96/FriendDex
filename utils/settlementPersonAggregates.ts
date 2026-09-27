import type { MockSettlementRoom } from '@/types/settlementMock';
import { formatYen } from '@/utils/moneyLoanHelpers';
import type { SettlementTransferDisplay } from '@/utils/settlementTransferHelpers';

export type SettlementPersonTransferItem = {
  key: string;
  roomId: string;
  roomTitle: string;
  amount: number;
  /** 正 = 自分が受け取る、負 = 自分が支払う */
  signedAmount: number;
  lineLabel: string;
  incomingFromPeer?: boolean;
};

export type SettlementPersonAggregate = {
  counterpartyFriendId: string;
  displayName: string;
  /** 正 = 相手から net 受取、負 = 相手へ net 支払 */
  netSignedAmount: number;
  items: SettlementPersonTransferItem[];
};

export type SettlementTransferSection = {
  room: MockSettlementRoom;
  displayTransfers: SettlementTransferDisplay[];
};

const findMyMemberId = (room: MockSettlementRoom, myselfId: string | null): string | null => {
  const member = room.members.find(
    (item) => item.friendId === 'myself' || (myselfId !== null && item.friendId === myselfId)
  );
  return member?.id ?? null;
};

const friendIdForMember = (room: MockSettlementRoom, memberId: string): string => {
  return room.members.find((member) => member.id === memberId)?.friendId ?? memberId;
};

const displayNameForFriend = (
  friendId: string,
  room: MockSettlementRoom,
  memberId: string,
  friendNameById: Map<string, string>
): string => {
  if (friendId === 'myself') {
    return '自分';
  }
  const fromMap = friendNameById.get(friendId);
  if (fromMap) {
    return fromMap;
  }
  return room.members.find((member) => member.id === memberId)?.displayName ?? friendId;
};

export function formatSettlementNetSignedAmount(netSignedAmount: number): string {
  if (netSignedAmount > 0) {
    return `${formatYen(netSignedAmount)} 受け取り`;
  }
  if (netSignedAmount < 0) {
    return `${formatYen(-netSignedAmount)} 支払い`;
  }
  return formatYen(0);
}

/** 全会の精算案から、自分視点で相手ごとに集約する */
export function buildSettlementPersonAggregates(
  sections: SettlementTransferSection[],
  myselfId: string | null,
  friendNameById: Map<string, string>
): SettlementPersonAggregate[] {
  const aggregateMap = new Map<string, SettlementPersonAggregate>();

  sections.forEach(({ room, displayTransfers }) => {
    const myMemberId = findMyMemberId(room, myselfId);
    if (!myMemberId) {
      return;
    }

    displayTransfers.forEach((transfer) => {
      const iPay = transfer.fromMemberId === myMemberId;
      const iReceive = transfer.toMemberId === myMemberId;
      if (!iPay && !iReceive) {
        return;
      }

      const counterpartyMemberId = iPay ? transfer.toMemberId : transfer.fromMemberId;
      const counterpartyFriendId = friendIdForMember(room, counterpartyMemberId);
      const signedAmount = iReceive ? transfer.amount : -transfer.amount;
      const displayName = displayNameForFriend(
        counterpartyFriendId,
        room,
        counterpartyMemberId,
        friendNameById
      );

      const current = aggregateMap.get(counterpartyFriendId) ?? {
        counterpartyFriendId,
        displayName,
        netSignedAmount: 0,
        items: [],
      };

      current.netSignedAmount += signedAmount;
      current.items.push({
        key: transfer.key,
        roomId: room.id,
        roomTitle: room.title,
        amount: transfer.amount,
        signedAmount,
        lineLabel: `${transfer.fromName} → ${transfer.toName} : ${formatYen(transfer.amount)}`,
      });
      aggregateMap.set(counterpartyFriendId, current);
    });
  });

  return Array.from(aggregateMap.values())
    .map((aggregate) => ({
      ...aggregate,
      items: [...aggregate.items].sort((a, b) => a.roomTitle.localeCompare(b.roomTitle, 'ja')),
    }))
    .sort((a, b) => {
      const absDiff = Math.abs(b.netSignedAmount) - Math.abs(a.netSignedAmount);
      if (absDiff !== 0) {
        return absDiff;
      }
      return a.displayName.localeCompare(b.displayName, 'ja');
    });
}
