import type { MockSettlementExpense, MockSettlementMember, MockSettlementRoom } from '@/types/settlementMock';
import { asAuthUserId, getFriendLinkedAuthUserId } from '@/utils/linkedAuthUser';

export const SETTLED_MONEY_LOCK_MESSAGE =
  '済の精算があるので、金額は変更できません。済を外してから編集してください。';

export function sameMemberIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

export function expenseMoneyFieldsChanged(
  before: MockSettlementExpense,
  after: Pick<MockSettlementExpense, 'amount' | 'payerMemberId' | 'splitMemberIds'>
): boolean {
  return (
    Math.floor(before.amount) !== Math.floor(after.amount) ||
    before.payerMemberId !== after.payerMemberId ||
    !sameMemberIdSet(before.splitMemberIds, after.splitMemberIds)
  );
}

export function roomHasSettledTransfer(
  room: MockSettlementRoom,
  completedKeys: ReadonlySet<string>
): boolean {
  const prefix = `${room.id}|`;
  for (const key of completedKeys) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function isMyselfMember(member: MockSettlementMember, myselfId: string | null): boolean {
  return member.friendId === 'myself' || (myselfId !== null && member.friendId === myselfId);
}

function memberLinkedUserId(
  member: MockSettlementMember,
  myselfId: string | null,
  myUserId: string
): string | null {
  if (isMyselfMember(member, myselfId)) {
    return asAuthUserId(myUserId)?.toLowerCase() ?? null;
  }
  if (member.friendId.startsWith('user:')) {
    return asAuthUserId(member.friendId.slice('user:'.length))?.toLowerCase() ?? null;
  }
  return asAuthUserId(getFriendLinkedAuthUserId(member.friendId))?.toLowerCase() ?? null;
}

/** 外せない理由。外せるときは null。 */
export function settlementMemberRemovalBlockReason(
  room: MockSettlementRoom,
  memberId: string,
  myselfId: string | null,
  myUserId: string
): string | null {
  const member = room.members.find((item) => item.id === memberId);
  if (!member) {
    return 'メンバーが見つかりません。';
  }
  if (isMyselfMember(member, myselfId)) {
    return '自分は外せません。';
  }
  const createdBy = (room.createdByUserId ?? '').trim().toLowerCase();
  if (createdBy && memberLinkedUserId(member, myselfId, myUserId) === createdBy) {
    return 'グループを作った人は外せません。';
  }
  const usedInExpense = room.expenses.some(
    (expense) => expense.payerMemberId === member.id || expense.splitMemberIds.includes(member.id)
  );
  if (usedInExpense) {
    return 'この人は支出に入っています。先にその支出を直してください。';
  }
  return null;
}
