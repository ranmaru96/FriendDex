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
    return updateMoneyLoanSessionTitle(sessionId, title);
  }

  deleteSession(sessionId: string): boolean {
    return deleteMoneyLoanSession(sessionId);
  }

  listLoans(): MoneyLoan[] {
    return getMoneyLoans();
  }

  listLoansBySessionId(sessionId: string): MoneyLoan[] {
    return getMoneyLoansBySessionId(sessionId);
  }

  createLoans(input: CreateMoneyLoansInput): MoneyLoan[] {
    return createMoneyLoans(input);
  }

  setRepaid(loanId: string, isRepaid: boolean): boolean {
    return setMoneyLoanRepaid(loanId, isRepaid);
  }
}

export const localMoneyLoanRepository = new LocalMoneyLoanRepository();
