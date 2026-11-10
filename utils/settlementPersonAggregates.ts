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

/** 会ごと一覧を、自分が払う・受け取る行だけに絞る。常に自分側のセクションはそのまま残す。 */
export function retainTransfersInvolvingMe(
  sections: SettlementTransferSection[],
  myselfId: string | null,
  isSectionAlwaysMine: (sectionId: string) => boolean = () => false
): SettlementTransferSection[] {
  return sections.flatMap((section) => {
    if (isSectionAlwaysMine(section.room.id)) {
      return [section];
    }
    const myMemberId = findMyMemberId(section.room, myselfId);
    if (!myMemberId) {
      return [];
    }
    const displayTransfers = section.displayTransfers.filter(
      (transfer) => transfer.fromMemberId === myMemberId || transfer.toMemberId === myMemberId
    );
    if (displayTransfers.length === 0) {
      return [];
    }
    return [{ ...section, displayTransfers }];
  });
}

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

function pushAggregateItem(
  aggregateMap: Map<string, SettlementPersonAggregate>,
  counterpartyFriendId: string,
  displayName: string,
  signedAmount: number,
  item: SettlementPersonTransferItem
): void {
  const current = aggregateMap.get(counterpartyFriendId) ?? {
    counterpartyFriendId,
    displayName,
    netSignedAmount: 0,
    items: [],
  };
  if (current.items.some((existing) => existing.key === item.key)) {
    return;
  }
  current.netSignedAmount += signedAmount;
  current.items.push(item);
  aggregateMap.set(counterpartyFriendId, current);
}

/**
 * 全会の精算案から相手ごとに集約する。
 * includeOthers が false のときは、自分が払う・受け取る行だけ。
 */
export function buildSettlementPersonAggregates(
  sections: SettlementTransferSection[],
  myselfId: string | null,
  friendNameById: Map<string, string>,
  options?: { includeOthers?: boolean }
): SettlementPersonAggregate[] {
  const includeOthers = options?.includeOthers === true;
  const aggregateMap = new Map<string, SettlementPersonAggregate>();

  sections.forEach(({ room, displayTransfers }) => {
    const myMemberId = findMyMemberId(room, myselfId);

    displayTransfers.forEach((transfer) => {
      const iPay = Boolean(myMemberId) && transfer.fromMemberId === myMemberId;
      const iReceive = Boolean(myMemberId) && transfer.toMemberId === myMemberId;
      const itemBase = {
        key: transfer.key,
        roomId: room.id,
        roomTitle: room.title,
        amount: transfer.amount,
        lineLabel: `${transfer.fromName} → ${transfer.toName} : ${formatYen(transfer.amount)}`,
      };
      if (iPay || iReceive) {
        const counterpartyMemberId = iPay ? transfer.toMemberId : transfer.fromMemberId;
        const counterpartyFriendId = friendIdForMember(room, counterpartyMemberId);
        pushAggregateItem(
          aggregateMap,
          counterpartyFriendId,
          displayNameForFriend(counterpartyFriendId, room, counterpartyMemberId, friendNameById),
          iReceive ? transfer.amount : -transfer.amount,
          { ...itemBase, signedAmount: iReceive ? transfer.amount : -transfer.amount }
        );
        return;
      }
      if (!includeOthers) {
        return;
      }
      [transfer.fromMemberId, transfer.toMemberId].forEach((memberId) => {
        const friendId = friendIdForMember(room, memberId);
        pushAggregateItem(
          aggregateMap,
          friendId,
          displayNameForFriend(friendId, room, memberId, friendNameById),
          0,
          { ...itemBase, signedAmount: 0 }
        );
      });
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
