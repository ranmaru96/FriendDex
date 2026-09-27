import {
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMoneyLoanSessions,
  getMoneyLoans,
  getMyself,
  initializeDatabase,
} from '@/db';
import type { Friend, MoneyLoan, MoneyLoanSession } from '@/types';

export type LocalMoneyLoanUiState = {
  friends: Friend[];
  myselfId: string | null;
  sessions: MoneyLoanSession[];
  loans: MoneyLoan[];
  affiliationOptions: { label: string; value: string }[];
  experienceOptions: { label: string; value: string }[];
};

/** 画面の初回描画はサーバー待ちせず、SQLite の前回結果を使う。 */
export function readLocalMoneyLoanUiState(): LocalMoneyLoanUiState {
  initializeDatabase();
  return {
    friends: getAllFriends(),
    myselfId: getMyself(),
    sessions: getMoneyLoanSessions(),
    loans: getMoneyLoans(),
    affiliationOptions: getDistinctAffiliations().map((value) => ({ label: value, value })),
    experienceOptions: getDistinctExperiences().map((value) => ({ label: value, value })),
  };
}
