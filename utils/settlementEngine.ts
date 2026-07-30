import type {
  SettlementExpense,
  SettlementMemberBalance,
  SettlementRoomMember,
  SettlementSplitRule,
  SettlementTransfer,
} from '@/types/settlement';

/** splitRule から各メンバーの負担額を算出 */
export function resolveSplitAmounts(
  totalAmount: number,
  splitRule: SettlementSplitRule,
  membersById: Map<string, SettlementRoomMember>
): Map<string, number> {
  const total = Math.max(0, Math.floor(totalAmount));
  const result = new Map<string, number>();

  if (splitRule.type === 'even') {
    const ids = splitRule.memberIds.filter((id) => membersById.has(id));
    if (ids.length === 0) {
      return result;
    }
    const base = Math.floor(total / ids.length);
    const remainder = total % ids.length;
    ids.forEach((id, index) => {
      result.set(id, base + (index < remainder ? 1 : 0));
    });
    return result;
  }

  if (splitRule.type === 'custom') {
    splitRule.shares.forEach(({ memberId, amount }) => {
      if (membersById.has(memberId)) {
        result.set(memberId, Math.max(0, Math.floor(amount)));
      }
    });
    return result;
  }

  const ids = splitRule.shares.filter(({ memberId }) => membersById.has(memberId));
  const weightSum = ids.reduce((sum, { weight }) => sum + Math.max(0, weight), 0);
  if (weightSum <= 0) {
    return result;
  }
  let assigned = 0;
  ids.forEach(({ memberId, weight }, index) => {
    if (index === ids.length - 1) {
      result.set(memberId, total - assigned);
      return;
    }
    const share = Math.floor((total * Math.max(0, weight)) / weightSum);
    result.set(memberId, share);
    assigned += share;
  });
  return result;
}

/**
 * 支出一覧からメンバーごとのネット残高を計算。
 * 正 = 回収できる、負 = 支払うべき。
 */
export function computeMemberBalances(
  members: SettlementRoomMember[],
  expenses: SettlementExpense[]
): SettlementMemberBalance[] {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const nets = new Map<string, number>();
  members.forEach((member) => nets.set(member.id, 0));

  expenses.forEach((expense) => {
    if (expense.isSettled) {
      return;
    }
    const payerId = expense.payerMemberId;
    if (!membersById.has(payerId)) {
      return;
    }
    const splitAmounts = resolveSplitAmounts(expense.amount, expense.splitRule, membersById);
    nets.set(payerId, (nets.get(payerId) ?? 0) + expense.amount);
    splitAmounts.forEach((share, memberId) => {
      nets.set(memberId, (nets.get(memberId) ?? 0) - share);
    });
  });

  return members.map((member) => ({
    memberId: member.id,
    displayName: member.displayName,
    netBalance: nets.get(member.id) ?? 0,
  }));
}

/**
 * 最小回数の精算案（貪欲法）。
 * 全員 netBalance が 0 になるよう Transfer を生成。
 */
export function computeSettlementTransfers(balances: SettlementMemberBalance[]): SettlementTransfer[] {
  type Node = { memberId: string; amount: number };
  const creditors: Node[] = balances
    .filter((balance) => balance.netBalance > 0)
    .map((balance) => ({ memberId: balance.memberId, amount: balance.netBalance }))
    .sort((a, b) => b.amount - a.amount);
  const debtors: Node[] = balances
    .filter((balance) => balance.netBalance < 0)
    .map((balance) => ({ memberId: balance.memberId, amount: -balance.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: SettlementTransfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].amount, debtors[di].amount);
    if (pay > 0) {
      transfers.push({
        fromMemberId: debtors[di].memberId,
        toMemberId: creditors[ci].memberId,
        amount: pay,
      });
    }
    creditors[ci].amount -= pay;
    debtors[di].amount -= pay;
    if (creditors[ci].amount === 0) ci += 1;
    if (debtors[di].amount === 0) di += 1;
  }

  return transfers;
}
