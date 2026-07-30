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

/** Phase 1: 精算ルーム API の契約（サーバ実装側もこの形に合わせる） */
export interface ISettlementRepository {
  listRooms(): Promise<SettlementRoom[]>;
  getRoom(roomId: EntityId): Promise<SettlementRoom | null>;
  getRoomSummary(roomId: EntityId): Promise<SettlementRoomSummary | null>;
  createRoom(input: CreateSettlementRoomInput): Promise<SettlementRoom>;
  joinRoom(input: JoinSettlementRoomInput): Promise<SettlementRoomMember>;
  listMembers(roomId: EntityId): Promise<SettlementRoomMember[]>;
  listExpenses(roomId: EntityId): Promise<SettlementExpense[]>;
  createExpense(input: CreateSettlementExpenseInput): Promise<SettlementExpense>;
  markExpenseSettled(expenseId: EntityId, isSettled: boolean): Promise<boolean>;
  /** サーバ側計算 or クライアント計算のどちらでも可 */
  getMemberBalances(roomId: EntityId): Promise<SettlementMemberBalance[]>;
  getSettlementTransfers(roomId: EntityId): Promise<SettlementTransfer[]>;
  linkMemberToLocalFriend(memberId: EntityId, localFriendId: string | null): Promise<boolean>;
}

/** Phase 1 REST エンドポイント定義（実装時の参照用） */
export const settlementApiRoutes = {
  rooms: '/api/v1/settlement/rooms',
  room: (roomId: EntityId) => `/api/v1/settlement/rooms/${roomId}`,
  roomSummary: (roomId: EntityId) => `/api/v1/settlement/rooms/${roomId}/summary`,
  join: '/api/v1/settlement/rooms/join',
  members: (roomId: EntityId) => `/api/v1/settlement/rooms/${roomId}/members`,
  memberLink: (memberId: EntityId) => `/api/v1/settlement/members/${memberId}/local-friend`,
  expenses: (roomId: EntityId) => `/api/v1/settlement/rooms/${roomId}/expenses`,
  expenseSettled: (expenseId: EntityId) => `/api/v1/settlement/expenses/${expenseId}/settled`,
  balances: (roomId: EntityId) => `/api/v1/settlement/rooms/${roomId}/balances`,
  transfers: (roomId: EntityId) => `/api/v1/settlement/rooms/${roomId}/transfers`,
} as const;

export type SettlementApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => string | null;
};

/** HTTP クライアントの最小インターフェース（fetch ラッパー差し替え用） */
export interface ISettlementApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  delete(path: string): Promise<void>;
}

export function createFetchSettlementApiClient(options: SettlementApiClientOptions): ISettlementApiClient {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const token = options.getAccessToken();
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${options.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Settlement API ${method} ${path} failed (${response.status}): ${text}`);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  };

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path).then(() => undefined),
  };
}
