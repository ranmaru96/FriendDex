import type { Friend, MoneyLoan, MoneyLoanDirection, MoneyLoanSession } from '../types';
import { getEpisodeParticipantFriendIds } from '../db';

export type MoneyLoanParticipantDraft = {
  participantType: 'individual';
  value: string;
};

/** 割り勘の人数（選択した参加者＋本人） */
export function getMoneyLoanSplitCount(selectedFriendCount: number): number {
  return selectedFriendCount + 1;
}

/** 合計金額を人数で割り勘（端数は先頭から1円ずつ配分） */
export function splitAmountEvenly(totalYen: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }
  const total = Math.max(0, Math.floor(totalYen));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export const getMoneyLoanDirectionLabel = (direction: MoneyLoanDirection): string =>
  direction === 'lent' ? '貸した' : '借りた';

export function resolveMoneyLoanCounterpartyName(
  loan: Pick<MoneyLoan, 'counterpartyKind' | 'counterpartyValue'>,
  friendNameById: Map<string, string>
): string {
  if (loan.counterpartyKind === 'friend') {
    return friendNameById.get(loan.counterpartyValue) ?? loan.counterpartyValue;
  }
  return loan.counterpartyValue;
}

export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

export function buildFriendNameById(friends: Friend[]): Map<string, string> {
  return new Map(friends.map((friend) => [friend.id, friend.name]));
}

export function buildSessionTitleById(sessions: MoneyLoanSession[]): Map<string, string> {
  return new Map(sessions.map((session) => [session.id, session.title]));
}

export function counterpartyKey(
  loan: Pick<MoneyLoan, 'counterpartyKind' | 'counterpartyValue'>
): string {
  return `${loan.counterpartyKind}:${loan.counterpartyValue}`;
}

export type MoneyLoanBatch = {
  groupId: string;
  loans: MoneyLoan[];
  createdAt: string;
  direction: MoneyLoanDirection;
  memo: string;
  totalAmount: number;
  unpaidCount: number;
  unpaidAmount: number;
};

export function groupMoneyLoansByBatch(loans: MoneyLoan[]): MoneyLoanBatch[] {
  const batchMap = new Map<string, MoneyLoan[]>();
  loans.forEach((loan) => {
    const current = batchMap.get(loan.groupId) ?? [];
    current.push(loan);
    batchMap.set(loan.groupId, current);
  });

  return Array.from(batchMap.entries())
    .map(([groupId, batchLoans]) => {
      const sortedLoans = [...batchLoans].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const first = sortedLoans[0];
      const unpaidLoans = sortedLoans.filter((loan) => !loan.isRepaid);
      return {
        groupId,
        loans: sortedLoans,
        createdAt: first.createdAt,
        direction: first.direction,
        memo: first.memo,
        totalAmount: sortedLoans.reduce((sum, loan) => sum + loan.amount, 0),
        unpaidCount: unpaidLoans.length,
        unpaidAmount: unpaidLoans.reduce((sum, loan) => sum + loan.amount, 0),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type MoneyLoanSessionSummary = {
  session: MoneyLoanSession;
  batchCount: number;
  loanCount: number;
  unpaidLoanCount: number;
  unpaidAmount: number;
};

export function buildMoneyLoanSessionSummaries(
  sessions: MoneyLoanSession[],
  loans: MoneyLoan[]
): MoneyLoanSessionSummary[] {
  const loansBySession = new Map<string, MoneyLoan[]>();
  loans.forEach((loan) => {
    const current = loansBySession.get(loan.sessionId) ?? [];
    current.push(loan);
    loansBySession.set(loan.sessionId, current);
  });

  return sessions.map((session) => {
    const sessionLoans = loansBySession.get(session.id) ?? [];
    const batches = groupMoneyLoansByBatch(sessionLoans);
    const unpaidLoans = sessionLoans.filter((loan) => !loan.isRepaid);
    return {
      session,
      batchCount: batches.length,
      loanCount: sessionLoans.length,
      unpaidLoanCount: unpaidLoans.length,
      unpaidAmount: unpaidLoans.reduce((sum, loan) => sum + loan.amount, 0),
    };
  });
}

export function buildActiveMoneyLoanSessionSummaries(
  sessions: MoneyLoanSession[],
  loans: MoneyLoan[]
): MoneyLoanSessionSummary[] {
  return buildMoneyLoanSessionSummaries(sessions, loans)
    .filter((summary) => summary.unpaidLoanCount > 0)
    .sort((a, b) => b.session.createdAt.localeCompare(a.session.createdAt));
}

export type MoneyLoanPersonAggregateItem = {
  loanId: string;
  amount: number;
  sessionId: string;
  sessionTitle: string;
  createdAt: string;
};

export type MoneyLoanPersonAggregate = {
  counterpartyKey: string;
  counterpartyKind: MoneyLoan['counterpartyKind'];
  counterpartyValue: string;
  displayName: string;
  totalAmount: number;
  items: MoneyLoanPersonAggregateItem[];
};

export function buildMoneyLoanPersonAggregates(
  loans: MoneyLoan[],
  direction: MoneyLoanDirection,
  sessionTitleById: Map<string, string>,
  friendNameById: Map<string, string>
): MoneyLoanPersonAggregate[] {
  const aggregateMap = new Map<string, MoneyLoanPersonAggregate>();

  loans
    .filter((loan) => !loan.isRepaid && loan.direction === direction)
    .forEach((loan) => {
      const key = counterpartyKey(loan);
      const current = aggregateMap.get(key) ?? {
        counterpartyKey: key,
        counterpartyKind: loan.counterpartyKind,
        counterpartyValue: loan.counterpartyValue,
        displayName: resolveMoneyLoanCounterpartyName(loan, friendNameById),
        totalAmount: 0,
        items: [],
      };
      current.totalAmount += loan.amount;
      current.items.push({
        loanId: loan.id,
        amount: loan.amount,
        sessionId: loan.sessionId,
        sessionTitle: sessionTitleById.get(loan.sessionId) ?? '（不明）',
        createdAt: loan.createdAt,
      });
      aggregateMap.set(key, current);
    });

  return Array.from(aggregateMap.values())
    .map((aggregate) => ({
      ...aggregate,
      items: [...aggregate.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
    .sort((a, b) => {
      if (b.totalAmount !== a.totalAmount) {
        return b.totalAmount - a.totalAmount;
      }
      return a.displayName.localeCompare(b.displayName, 'ja');
    });
}

export function formatMoneyLoanDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return formatLocalDateAsMoneyLoanTitle(date);
}

/** お金貸し借りセッションのデフォルトタイトル（例: 2026/6/14） */
export function formatLocalDateAsMoneyLoanTitle(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}/${month}/${day}`;
}

export function resolveMoneyLoanSessionTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : formatLocalDateAsMoneyLoanTitle();
}

const DEFAULT_RECENT_COUNTERPARTY_LIMIT = 8;

/** 貸し借り履歴から、最近登録した相手（friendId）を新しい順に返す */
export function getRecentMoneyLoanCounterpartyFriendIds(
  loans: MoneyLoan[],
  options?: { limit?: number; validFriendIds?: Set<string> }
): string[] {
  const limit = options?.limit ?? DEFAULT_RECENT_COUNTERPARTY_LIMIT;
  const validFriendIds = options?.validFriendIds;
  const seen = new Set<string>();
  const result: string[] = [];
  const sorted = [...loans]
    .filter((loan) => loan.counterpartyKind === 'friend')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const loan of sorted) {
    const friendId = loan.counterpartyValue;
    if (seen.has(friendId)) {
      continue;
    }
    if (validFriendIds && !validFriendIds.has(friendId)) {
      continue;
    }
    seen.add(friendId);
    result.push(friendId);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

/** モーダル確定時: 個人＋所属選択を個人IDのみに展開（所属エントリは保持しない） */
export function buildMoneyLoanParticipantsFromSelectorPicks(
  selectedIndividualIds: Iterable<string>,
  selectedGroupValues: Iterable<string>
): MoneyLoanParticipantDraft[] {
  const participantEntries = [
    ...Array.from(selectedIndividualIds, (value) => ({ kind: 'individual' as const, value })),
    ...Array.from(selectedGroupValues, (value) => ({ kind: 'group' as const, value })),
  ];
  return getEpisodeParticipantFriendIds({ participantEntries }).map((value) => ({
    participantType: 'individual' as const,
    value,
  }));
}

export function removeMoneyLoanParticipantByFriendId(
  participants: MoneyLoanParticipantDraft[],
  friendId: string
): MoneyLoanParticipantDraft[] {
  return participants.filter((participant) => participant.value !== friendId);
}

export type MoneyLoanIndividualLineDraft = {
  friendId: string;
  amountText: string;
  direction: MoneyLoanDirection;
};

export function buildParticipantDraftsFromFriendLoans(loans: MoneyLoan[]) {
  return loans
    .filter((loan) => !loan.isRepaid && loan.counterpartyKind === 'friend')
    .map((loan) => ({
      participantType: 'individual' as const,
      value: loan.counterpartyValue,
    }));
}

export function buildIndividualLinesFromLoans(loans: MoneyLoan[]): MoneyLoanIndividualLineDraft[] {
  return loans
    .filter((loan) => !loan.isRepaid && loan.counterpartyKind === 'friend')
    .map((loan) => ({
      friendId: loan.counterpartyValue,
      amountText: String(loan.amount),
      direction: loan.direction,
    }));
}

export function inferBatchRegisterMode(loans: MoneyLoan[]): 'split' | 'individual' {
  const unpaidFriends = loans.filter((loan) => !loan.isRepaid && loan.counterpartyKind === 'friend');
  if (unpaidFriends.length === 0) {
    return 'individual';
  }
  const firstAmount = unpaidFriends[0].amount;
  const allLent = unpaidFriends.every((loan) => loan.direction === 'lent');
  const allSameAmount = unpaidFriends.every((loan) => loan.amount === firstAmount);
  return allLent && allSameAmount ? 'split' : 'individual';
}

export function estimateSplitTotalAmount(friendCount: number, perFriendAmount: number): number {
  return perFriendAmount * getMoneyLoanSplitCount(friendCount);
}

export function getUnpaidBatchesForSession(loans: MoneyLoan[], sessionId: string): MoneyLoanBatch[] {
  const sessionLoans = loans.filter((loan) => loan.sessionId === sessionId);
  return groupMoneyLoansByBatch(sessionLoans).filter((batch) => batch.unpaidCount > 0);
}
