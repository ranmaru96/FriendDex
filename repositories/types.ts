import type {
  CreateMoneyLoansInput,
  MoneyLoan,
  MoneyLoanSession,
} from '@/types';
import type { RepositoryError } from '@/types/sync';

/** Phase 0: 既存 SQLite（お金貸し借り）へのアクセス抽象 */
export interface IMoneyLoanRepository {
  listSessions(): MoneyLoanSession[];
  getSession(sessionId: string): MoneyLoanSession | null;
  getOrCreateSessionByTitle(title: string): MoneyLoanSession | null;
  updateSessionTitle(sessionId: string, title: string): boolean;
  deleteSession(sessionId: string): boolean;
  listLoans(): MoneyLoan[];
  listLoansBySessionId(sessionId: string): MoneyLoan[];
  createLoans(input: CreateMoneyLoansInput): MoneyLoan[];
  setRepaid(loanId: string, isRepaid: boolean): boolean;
}

export type RepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepositoryError };

export function repositoryOk<T>(value: T): RepositoryResult<T> {
  return { ok: true, value };
}

export function repositoryErr<T>(error: RepositoryError): RepositoryResult<T> {
  return { ok: false, error };
}
