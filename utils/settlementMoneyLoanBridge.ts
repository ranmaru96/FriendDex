import type { MoneyLoan, MoneyLoanSession } from '@/types';
import type { MockSettlementRoom } from '@/types/settlementMock';
import {
  formatYen,
  resolveMoneyLoanCounterpartyName,
} from '@/utils/moneyLoanHelpers';
import type {
  SettlementPersonAggregate,
  SettlementTransferSection,
} from '@/utils/settlementPersonAggregates';
import type { SettlementTransferDisplay } from '@/utils/settlementTransferHelpers';

const MONEY_LOAN_BALANCE_KEY_PREFIX = 'loan:';
export const MONEY_LOAN_SECTION_ID_PREFIX = 'money-loan-session:';

export function buildMoneyLoanBalanceKey(loanId: string): string {
  return `${MONEY_LOAN_BALANCE_KEY_PREFIX}${loanId}`;
}

export function parseMoneyLoanBalanceKey(key: string): string | null {
  if (!key.startsWith(MONEY_LOAN_BALANCE_KEY_PREFIX)) {
    return null;
  }
  const id = key.slice(MONEY_LOAN_BALANCE_KEY_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function isMoneyLoanBalanceSectionId(sectionId: string): boolean {
  return sectionId.startsWith(MONEY_LOAN_SECTION_ID_PREFIX);
}

function buildSyntheticLoanRoom(sessionId: string, title: string, createdAt: string): MockSettlementRoom {
  return {
    id: `${MONEY_LOAN_SECTION_ID_PREFIX}${sessionId}`,
    title,
    members: [],
    expenses: [],
    createdAt,
  };
}

/** 個別貸し借りを清算「会ごと」表示用セクションへ変換 */
export function buildMoneyLoanTransferSections(
  sessions: MoneyLoanSession[],
  loans: MoneyLoan[],
  friendNameById: Map<string, string>
): SettlementTransferSection[] {
  if (loans.length === 0) {
    return [];
  }

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const loansBySession = new Map<string, MoneyLoan[]>();
  loans.forEach((loan) => {
    const list = loansBySession.get(loan.sessionId) ?? [];
    list.push(loan);
    loansBySession.set(loan.sessionId, list);
  });

  return Array.from(loansBySession.entries())
    .map(([sessionId, sessionLoans]) => {
      const session = sessionById.get(sessionId);
      const title = session?.title?.trim() || '（無題）';
      const createdAt = session?.createdAt ?? sessionLoans[0]?.createdAt ?? '';
      const displayTransfers: SettlementTransferDisplay[] = [...sessionLoans]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((loan) => {
          const friendName = resolveMoneyLoanCounterpartyName(loan, friendNameById);
          const fromName = loan.direction === 'lent' ? friendName : '自分';
          const toName = loan.direction === 'lent' ? '自分' : friendName;
          return {
            fromMemberId: loan.direction === 'lent' ? loan.counterpartyValue : 'myself',
            toMemberId: loan.direction === 'lent' ? 'myself' : loan.counterpartyValue,
            amount: loan.amount,
            key: buildMoneyLoanBalanceKey(loan.id),
            fromName,
            toName,
          };
        });

      return {
        room: buildSyntheticLoanRoom(sessionId, title, createdAt),
        displayTransfers,
      };
    })
    .sort((a, b) => b.room.createdAt.localeCompare(a.room.createdAt));
}

/** グループ精算の人ごと集約に、個別貸し借りをマージ */
export function mergeMoneyLoansIntoPersonAggregates(
  aggregates: SettlementPersonAggregate[],
  loans: MoneyLoan[],
  sessionTitleById: Map<string, string>,
  friendNameById: Map<string, string>
): SettlementPersonAggregate[] {
  const aggregateMap = new Map(
    aggregates.map((aggregate) => [
      aggregate.counterpartyFriendId,
      {
        ...aggregate,
        items: [...aggregate.items],
      },
    ])
  );

  loans.forEach((loan) => {
    const counterpartyFriendId = loan.counterpartyValue;
    const displayName = resolveMoneyLoanCounterpartyName(loan, friendNameById);
    const signedAmount = loan.direction === 'lent' ? loan.amount : -loan.amount;
    const current = aggregateMap.get(counterpartyFriendId) ?? {
      counterpartyFriendId,
      displayName,
      netSignedAmount: 0,
      items: [],
    };

    current.netSignedAmount += signedAmount;
    current.items.push({
      key: buildMoneyLoanBalanceKey(loan.id),
      roomId: `${MONEY_LOAN_SECTION_ID_PREFIX}${loan.sessionId}`,
      roomTitle: sessionTitleById.get(loan.sessionId) ?? '（不明）',
      amount: loan.amount,
      signedAmount,
      lineLabel:
        loan.direction === 'lent'
          ? `貸した : ${formatYen(loan.amount)}`
          : `借りた : ${formatYen(loan.amount)}`,
    });
    aggregateMap.set(counterpartyFriendId, current);
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
