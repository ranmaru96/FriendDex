import { settlementConfig } from '@/constants/settlementConfig';
import type { ISettlementRepository } from '@/repositories/remote/settlementApiClient';
import {
  createFetchSettlementApiClient,
  settlementApiRoutes,
  type ISettlementApiClient,
} from '@/repositories/remote/settlementApiClient';
import { RepositoryError } from '@/types/sync';
import type {
  CreateSettlementExpenseInput,
  CreateSettlementRoomInput,
  JoinSettlementRoomInput,
  SettlementExpense,
  SettlementMemberBalance,
  SettlementRoom,
  SettlementRoomMember,
  SettlementRoomSummary,
  SettlementTransfer,
} from '@/types/settlement';
import type { EntityId } from '@/types/sync';
import { computeMemberBalances, computeSettlementTransfers } from '@/utils/settlementEngine';

export type RemoteSettlementRepositoryOptions = {
  apiClient?: ISettlementApiClient;
  getAccessToken?: () => string | null;
};

/**
 * Phase 1: リモート精算ルーム Repository。
 * settlementConfig.remoteSettlementEnabled が true かつ baseUrl 設定時に使用。
 */
export class RemoteSettlementRepository implements ISettlementRepository {
  private readonly client: ISettlementApiClient;

  constructor(options: RemoteSettlementRepositoryOptions = {}) {
    if (options.apiClient) {
      this.client = options.apiClient;
      return;
    }
    const baseUrl = settlementConfig.settlementApiBaseUrl.trim();
    if (!baseUrl) {
      throw new RepositoryError('NOT_IMPLEMENTED', 'settlementApiBaseUrl が未設定です');
    }
    this.client = createFetchSettlementApiClient({
      baseUrl,
      getAccessToken: options.getAccessToken ?? (() => null),
    });
  }

  listRooms(): Promise<SettlementRoom[]> {
    return this.client.get<SettlementRoom[]>(settlementApiRoutes.rooms);
  }

  getRoom(roomId: EntityId): Promise<SettlementRoom | null> {
    return this.client.get<SettlementRoom | null>(settlementApiRoutes.room(roomId));
  }

  getRoomSummary(roomId: EntityId): Promise<SettlementRoomSummary | null> {
    return this.client.get<SettlementRoomSummary | null>(settlementApiRoutes.roomSummary(roomId));
  }

  createRoom(input: CreateSettlementRoomInput): Promise<SettlementRoom> {
    return this.client.post<SettlementRoom>(settlementApiRoutes.rooms, input);
  }

  joinRoom(input: JoinSettlementRoomInput): Promise<SettlementRoomMember> {
    return this.client.post<SettlementRoomMember>(settlementApiRoutes.join, input);
  }

  listMembers(roomId: EntityId): Promise<SettlementRoomMember[]> {
    return this.client.get<SettlementRoomMember[]>(settlementApiRoutes.members(roomId));
  }

  listExpenses(roomId: EntityId): Promise<SettlementExpense[]> {
    return this.client.get<SettlementExpense[]>(settlementApiRoutes.expenses(roomId));
  }

  createExpense(input: CreateSettlementExpenseInput): Promise<SettlementExpense> {
    return this.client.post<SettlementExpense>(settlementApiRoutes.expenses(input.roomId), input);
  }

  markExpenseSettled(expenseId: EntityId, isSettled: boolean): Promise<boolean> {
    return this.client
      .patch<{ ok: boolean }>(settlementApiRoutes.expenseSettled(expenseId), { isSettled })
      .then((result) => result.ok);
  }

  async getMemberBalances(roomId: EntityId): Promise<SettlementMemberBalance[]> {
    try {
      return await this.client.get<SettlementMemberBalance[]>(settlementApiRoutes.balances(roomId));
    } catch {
      const [members, expenses] = await Promise.all([
        this.listMembers(roomId),
        this.listExpenses(roomId),
      ]);
      return computeMemberBalances(members, expenses);
    }
  }

  async getSettlementTransfers(roomId: EntityId): Promise<SettlementTransfer[]> {
    try {
      return await this.client.get<SettlementTransfer[]>(settlementApiRoutes.transfers(roomId));
    } catch {
      const balances = await this.getMemberBalances(roomId);
      return computeSettlementTransfers(balances);
    }
  }

  linkMemberToLocalFriend(memberId: EntityId, localFriendId: string | null): Promise<boolean> {
    return this.client
      .patch<{ ok: boolean }>(settlementApiRoutes.memberLink(memberId), { localFriendId })
      .then((result) => result.ok);
  }
}

/** API 未接続時のスタブ（開発・テスト用） */
export class StubSettlementRepository implements ISettlementRepository {
  async listRooms(): Promise<SettlementRoom[]> {
    return [];
  }

  async getRoom(): Promise<SettlementRoom | null> {
    return null;
  }

  async getRoomSummary(): Promise<SettlementRoomSummary | null> {
    return null;
  }

  async createRoom(): Promise<SettlementRoom> {
    throw new RepositoryError('NOT_IMPLEMENTED', '精算ルーム API は未接続です');
  }

  async joinRoom(): Promise<SettlementRoomMember> {
    throw new RepositoryError('NOT_IMPLEMENTED', '精算ルーム API は未接続です');
  }

  async listMembers(): Promise<SettlementRoomMember[]> {
    return [];
  }

  async listExpenses(): Promise<SettlementExpense[]> {
    return [];
  }

  async createExpense(): Promise<SettlementExpense> {
    throw new RepositoryError('NOT_IMPLEMENTED', '精算ルーム API は未接続です');
  }

  async markExpenseSettled(): Promise<boolean> {
    throw new RepositoryError('NOT_IMPLEMENTED', '精算ルーム API は未接続です');
  }

  async getMemberBalances(): Promise<SettlementMemberBalance[]> {
    return [];
  }

  async getSettlementTransfers(): Promise<SettlementTransfer[]> {
    return [];
  }

  async linkMemberToLocalFriend(): Promise<boolean> {
    throw new RepositoryError('NOT_IMPLEMENTED', '精算ルーム API は未接続です');
  }
}

export function createRemoteSettlementRepository(
  options?: RemoteSettlementRepositoryOptions
): ISettlementRepository {
  if (!settlementConfig.remoteSettlementEnabled) {
    return new StubSettlementRepository();
  }
  try {
    return new RemoteSettlementRepository(options);
  } catch {
    return new StubSettlementRepository();
  }
}
