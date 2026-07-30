/**
 * 既存 MoneyLoan（1対1・自分視点）と Settlement（ルーム・立替者モデル）の概念対応。
 * Phase 1 移行時のマッピング参考。現時点では自動変換しない。
 */
import type { MoneyLoan, MoneyLoanSession } from '@/types';
import type { SettlementExpense, SettlementRoom } from '@/types/settlement';

/** ローカル MoneyLoanSession → 将来の SettlementRoom タイトル互換 */
export function moneyLoanSessionToRoomTitle(session: MoneyLoanSession): string {
  return session.title;
}

/** 割り勘登録 1 バッチ ≒ payer=自分 の even split expense（複数友人分は個別 loan に分解済み） */
export type LegacySplitBatchHint = {
  sessionId: string;
  groupId: string;
  friendLoans: MoneyLoan[];
  inferredTotalAmount: number;
};

export function groupLegacySplitBatch(friendLoans: MoneyLoan[]): LegacySplitBatchHint | null {
  if (friendLoans.length === 0) {
    return null;
  }
  const sessionId = friendLoans[0].sessionId;
  const groupId = friendLoans[0].groupId;
  const sameBatch = friendLoans.every(
    (loan) => loan.sessionId === sessionId && loan.groupId === groupId && loan.direction === 'lent'
  );
  if (!sameBatch) {
    return null;
  }
  const friendCount = friendLoans.length;
  const perFriend = friendLoans[0].amount;
  const allSame = friendLoans.every((loan) => loan.amount === perFriend);
  if (!allSame) {
    return null;
  }
  return {
    sessionId,
    groupId,
    friendLoans,
    inferredTotalAmount: perFriend * (friendCount + 1),
  };
}

/** 将来: LegacySplitBatchHint → SettlementExpense（payer=owner member） */
export function legacySplitBatchToExpenseDraft(
  hint: LegacySplitBatchHint,
  room: SettlementRoom,
  payerMemberId: string,
  memberIdByFriendId: Map<string, string>
): Omit<SettlementExpense, 'id' | 'createdAt' | 'updatedAt'> | null {
  const memberIds = hint.friendLoans
    .map((loan) => memberIdByFriendId.get(loan.counterpartyValue))
    .filter((id): id is string => Boolean(id));
  if (memberIds.length !== hint.friendLoans.length) {
    return null;
  }
  return {
    roomId: room.id,
    payerMemberId,
    title: '（移行）割り勘',
    amount: hint.inferredTotalAmount,
    splitRule: { type: 'even', memberIds: [...memberIds, payerMemberId] },
    memo: hint.groupId,
    isSettled: hint.friendLoans.every((loan) => loan.isRepaid),
  };
}
