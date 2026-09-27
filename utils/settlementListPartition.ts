import type { MockSettlementRoom } from '@/types/settlementMock';
import type { SettlementExpense, SettlementRoomMember } from '@/types/settlement';
import {
  computeMemberBalances,
  computeSettlementTransfers,
} from '@/utils/settlementEngine';
import type { SettlementMemberBalance, SettlementTransfer } from '@/types/settlement';
import {
  allocateSettlementTransferKey,
  buildSettlementTransferDisplays,
  buildSettlementTransferKey,
  parseSettlementTransferKey,
  type SettlementTransferDisplay,
} from '@/utils/settlementTransferHelpers';
import type {
  SettlementPersonAggregate,
  SettlementTransferSection,
} from '@/utils/settlementPersonAggregates';

function mockRoomToEngineMembers(room: MockSettlementRoom): {
  members: SettlementRoomMember[];
  expenses: SettlementExpense[];
} {
  const members: SettlementRoomMember[] = room.members.map((member) => ({
    id: member.id,
    roomId: room.id,
    userId: null,
    displayName: member.displayName,
    localFriendId: member.friendId,
    role: member.friendId === 'myself' ? 'owner' : 'member',
    joinedAt: room.createdAt,
  }));
  const expenses: SettlementExpense[] = room.expenses.map((expense) => ({
    id: expense.id,
    roomId: room.id,
    payerMemberId: expense.payerMemberId,
    title: expense.title,
    amount: expense.amount,
    splitRule: { type: 'even', memberIds: expense.splitMemberIds },
    memo: '',
    isSettled: false,
    createdAt: expense.createdAt,
    updatedAt: expense.createdAt,
  }));
  return { members, expenses };
}

function roomCompletionKeys(roomId: string, completedKeys: ReadonlySet<string>): string[] {
  const prefix = `${roomId}|`;
  const keys: string[] = [];
  completedKeys.forEach((key) => {
    if (!key.startsWith(prefix)) {
      return;
    }
    const parsed = parseSettlementTransferKey(key);
    if (parsed && parsed.roomId === roomId) {
      keys.push(key);
    }
  });
  return keys;
}

function toTransferDisplay(
  transfer: SettlementTransfer,
  key: string,
  nameByMemberId: Map<string, string>
): SettlementTransferDisplay {
  return {
    ...transfer,
    key,
    fromName: nameByMemberId.get(transfer.fromMemberId) ?? '?',
    toName: nameByMemberId.get(transfer.toMemberId) ?? '?',
  };
}

/** 済にした送金を残高から外し、残りの未済分だけを再計算する。 */
function balancesAfterSettledTransfers(
  balances: SettlementMemberBalance[],
  settled: SettlementTransfer[]
): SettlementMemberBalance[] {
  const nets = new Map(balances.map((balance) => [balance.memberId, balance.netBalance]));
  settled.forEach((transfer) => {
    nets.set(transfer.fromMemberId, (nets.get(transfer.fromMemberId) ?? 0) + transfer.amount);
    nets.set(transfer.toMemberId, (nets.get(transfer.toMemberId) ?? 0) - transfer.amount);
  });
  return balances.map((balance) => ({
    ...balance,
    netBalance: nets.get(balance.memberId) ?? 0,
  }));
}

export function getRoomDisplayTransfers(
  room: MockSettlementRoom,
  completedKeys?: ReadonlySet<string>
): SettlementTransferDisplay[] {
  const { members, expenses } = mockRoomToEngineMembers(room);
  if (members.length === 0 || expenses.length === 0) {
    return [];
  }
  const balances = computeMemberBalances(members, expenses);
  const transfers = computeSettlementTransfers(balances);
  const nameByMemberId = new Map(balances.map((balance) => [balance.memberId, balance.displayName]));
  const settledKeys = completedKeys ? roomCompletionKeys(room.id, completedKeys) : [];
  if (transfers.length === 0 && settledKeys.length === 0) {
    return [];
  }
  const engineKeys = new Set(transfers.map((transfer) => buildSettlementTransferKey(room.id, transfer)));
  if (settledKeys.length === 0 || settledKeys.every((key) => engineKeys.has(key))) {
    return buildSettlementTransferDisplays(room.id, transfers, nameByMemberId);
  }

  const settledTransfers = settledKeys.flatMap((key) => {
    const parsed = parseSettlementTransferKey(key);
    if (!parsed) {
      return [];
    }
    return [
      {
        fromMemberId: parsed.fromMemberId,
        toMemberId: parsed.toMemberId,
        amount: parsed.amount,
        key,
      },
    ];
  });
  const residual = computeSettlementTransfers(
    balancesAfterSettledTransfers(balances, settledTransfers)
  );
  const usedKeys = new Set(settledKeys);
  const openDisplays = residual.map((transfer) =>
    toTransferDisplay(transfer, allocateSettlementTransferKey(room.id, transfer, usedKeys), nameByMemberId)
  );
  const settledDisplays = settledTransfers.map((transfer) =>
    toTransferDisplay(transfer, transfer.key, nameByMemberId)
  );
  return [...openDisplays, ...settledDisplays];
}

/** 支出があり、未完了の精算行がない → 清算済み */
export function isSettlementRoomSettled(
  room: MockSettlementRoom,
  isTransferCompleted: (key: string) => boolean
): boolean {
  if (room.expenses.length === 0) {
    return false;
  }
  const transfers = getRoomDisplayTransfers(room);
  if (transfers.length === 0) {
    return true;
  }
  return transfers.every((transfer) => isTransferCompleted(transfer.key));
}

export function partitionSettlementRooms(
  rooms: MockSettlementRoom[],
  isTransferCompleted: (key: string) => boolean
): { active: MockSettlementRoom[]; settled: MockSettlementRoom[] } {
  const active: MockSettlementRoom[] = [];
  const settled: MockSettlementRoom[] = [];
  rooms.forEach((room) => {
    if (isSettlementRoomSettled(room, isTransferCompleted)) {
      settled.push(room);
    } else {
      active.push(room);
    }
  });
  const byCreatedDesc = (a: MockSettlementRoom, b: MockSettlementRoom) =>
    b.createdAt.localeCompare(a.createdAt);
  return {
    active: [...active].sort(byCreatedDesc),
    settled: [...settled].sort(byCreatedDesc),
  };
}

export function isTransferSectionSettled(
  section: SettlementTransferSection,
  isTransferCompleted: (key: string) => boolean
): boolean {
  if (section.displayTransfers.length === 0) {
    return true;
  }
  return section.displayTransfers.every((transfer) => isTransferCompleted(transfer.key));
}

export function sortTransfersIncompleteFirst(
  transfers: SettlementTransferDisplay[],
  isTransferCompleted: (key: string) => boolean
): SettlementTransferDisplay[] {
  return [...transfers].sort((a, b) => {
    const aDone = isTransferCompleted(a.key);
    const bDone = isTransferCompleted(b.key);
    if (aDone !== bDone) {
      return aDone ? 1 : -1;
    }
    return 0;
  });
}

export function partitionTransferSections(
  sections: SettlementTransferSection[],
  isTransferCompleted: (key: string) => boolean
): { active: SettlementTransferSection[]; settled: SettlementTransferSection[] } {
  const active: SettlementTransferSection[] = [];
  const settled: SettlementTransferSection[] = [];
  sections.forEach((section) => {
    const displayTransfers = sortTransfersIncompleteFirst(
      section.displayTransfers,
      isTransferCompleted
    );
    const next = { ...section, displayTransfers };
    if (isTransferSectionSettled(next, isTransferCompleted)) {
      settled.push(next);
    } else {
      active.push(next);
    }
  });
  return { active, settled };
}

export function isPersonAggregateSettled(
  aggregate: SettlementPersonAggregate,
  isTransferCompleted: (key: string) => boolean
): boolean {
  if (aggregate.items.length === 0) {
    return true;
  }
  return aggregate.items.every((item) => isTransferCompleted(item.key));
}

export function partitionPersonAggregates(
  aggregates: SettlementPersonAggregate[],
  isTransferCompleted: (key: string) => boolean
): { active: SettlementPersonAggregate[]; settled: SettlementPersonAggregate[] } {
  const active: SettlementPersonAggregate[] = [];
  const settled: SettlementPersonAggregate[] = [];
  aggregates.forEach((aggregate) => {
    const items = [...aggregate.items].sort((a, b) => {
      const aDone = isTransferCompleted(a.key);
      const bDone = isTransferCompleted(b.key);
      if (aDone !== bDone) {
        return aDone ? 1 : -1;
      }
      return a.roomTitle.localeCompare(b.roomTitle, 'ja');
    });
    const next = { ...aggregate, items };
    if (isPersonAggregateSettled(next, isTransferCompleted)) {
      settled.push(next);
    } else {
      active.push(next);
    }
  });
  return { active, settled };
}
