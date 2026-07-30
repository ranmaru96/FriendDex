import type { MockSettlementRoom } from '@/types/settlementMock';
import type { SettlementExpense, SettlementRoomMember } from '@/types/settlement';
import {
  computeMemberBalances,
  computeSettlementTransfers,
} from '@/utils/settlementEngine';
import {
  buildSettlementTransferDisplays,
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

export function getRoomDisplayTransfers(room: MockSettlementRoom): SettlementTransferDisplay[] {
  const { members, expenses } = mockRoomToEngineMembers(room);
  if (members.length === 0 || expenses.length === 0) {
    return [];
  }
  const balances = computeMemberBalances(members, expenses);
  const transfers = computeSettlementTransfers(balances);
  if (transfers.length === 0) {
    return [];
  }
  const nameByMemberId = new Map(balances.map((balance) => [balance.memberId, balance.displayName]));
  return buildSettlementTransferDisplays(room.id, transfers, nameByMemberId);
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
