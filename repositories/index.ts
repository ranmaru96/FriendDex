import { settlementConfig } from '@/constants/settlementConfig';
import { localMoneyLoanRepository } from '@/repositories/local/moneyLoanRepository';
import { settlementStore } from '@/repositories/local/settlementStore';
import type { IMoneyLoanRepository } from '@/repositories/types';
import {
  createRemoteSettlementRepository,
  type RemoteSettlementRepositoryOptions,
} from '@/repositories/remote/settlementRepository';
import type { ISettlementRepository } from '@/repositories/remote/settlementApiClient';

export type Repositories = {
  /** Phase 0: 既存お金貸し借り（ローカル SQLite） */
  moneyLoan: IMoneyLoanRepository;
  /** Phase 1: 共同精算ルーム（リモート or スタブ） */
  settlement: ISettlementRepository;
};

let cached: Repositories | null = null;

export function createRepositories(options?: RemoteSettlementRepositoryOptions): Repositories {
  return {
    moneyLoan: localMoneyLoanRepository,
    settlement: createRemoteSettlementRepository(options),
  };
}

/** アプリ全体で共有する Repository インスタンス */
export function getRepositories(options?: RemoteSettlementRepositoryOptions): Repositories {
  if (!cached) {
    cached = createRepositories(options);
  }
  return cached;
}

/** テストや hot-reload 用 */
export function resetRepositoriesCache(): void {
  cached = null;
}

export function isRemoteSettlementActive(): boolean {
  return settlementConfig.remoteSettlementEnabled && settlementConfig.settlementApiBaseUrl.trim().length > 0;
}

export { settlementStore };
