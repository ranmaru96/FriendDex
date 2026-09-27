import {
  createMoneyLoans,
  deleteMoneyLoanSession,
  getMoneyLoanSession,
  getMoneyLoanSessions,
  getMoneyLoans,
  getMoneyLoansBySessionId,
  getOrCreateMoneyLoanSessionByTitle,
  setMoneyLoanRepaid,
  updateMoneyLoanSessionTitle,
} from '@/db';
import type { CreateMoneyLoansInput, MoneyLoan, MoneyLoanSession } from '@/types';
import {
  scheduleOwnedMoneyLoanSessionDelete,
  scheduleOwnedMoneyLoanSessionSync,
  scheduleOwnedMoneyLoanSync,
} from '@/lib/ownedMoneyLoanSync';
import { schedulePushSharedMoneyLoan, schedulePushSharedMoneyLoanRepaid } from '@/lib/sharedMoneyLoanSync';
import type { IMoneyLoanRepository } from '@/repositories/types';

/** Phase 0: db.ts の money_loan 系をラップするローカル実装 */
export class LocalMoneyLoanRepository implements IMoneyLoanRepository {
  listSessions(): MoneyLoanSession[] {
    return getMoneyLoanSessions();
  }

  getSession(sessionId: string): MoneyLoanSession | null {
    return getMoneyLoanSession(sessionId);
  }

  getOrCreateSessionByTitle(title: string): MoneyLoanSession | null {
    return getOrCreateMoneyLoanSessionByTitle(title);
  }

  updateSessionTitle(sessionId: string, title: string): boolean {
    const ok = updateMoneyLoanSessionTitle(sessionId, title);
    if (ok) {
      scheduleOwnedMoneyLoanSessionSync(sessionId);
    }
    return ok;
  }

  deleteSession(sessionId: string): boolean {
    const ok = deleteMoneyLoanSession(sessionId);
    if (ok) {
      scheduleOwnedMoneyLoanSessionDelete(sessionId);
    }
    return ok;
  }

  listLoans(): MoneyLoan[] {
    return getMoneyLoans();
  }

  listLoansBySessionId(sessionId: string): MoneyLoan[] {
    return getMoneyLoansBySessionId(sessionId);
  }

  createLoans(input: CreateMoneyLoansInput): MoneyLoan[] {
    const created = createMoneyLoans(input);
    if (created.length > 0) {
      scheduleOwnedMoneyLoanSessionSync(input.sessionId);
      created.forEach((loan) => {
        schedulePushSharedMoneyLoan(loan.id);
      });
    }
    return created;
  }

  setRepaid(loanId: string, isRepaid: boolean): boolean {
    const ok = setMoneyLoanRepaid(loanId, isRepaid);
    if (ok) {
      scheduleOwnedMoneyLoanSync(loanId);
      schedulePushSharedMoneyLoanRepaid(loanId);
    }
    return ok;
  }
}

export const localMoneyLoanRepository = new LocalMoneyLoanRepository();
