import {
  addMockSettlementMember,
  deleteMockSettlementExpense,
  deleteMockSettlementMember,
  getAllMockSettlementRooms,
  getSettlementCompletedTransferKeys,
  insertMockSettlementExpense,
  insertMockSettlementRoom,
  initializeDatabase,
  setMockSettlementMemberLedgerSynced,
  setSettlementTransferCompleted,
  updateMockSettlementExpense,
  updateMockSettlementRoomTitle,
} from '@/db';
import {
  scheduleOwnedSettlementCompletionsSync,
  scheduleOwnedSettlementRoomSync,
} from '@/lib/ownedSettlementSync';
import {
  schedulePushSharedSettlementCompletion,
  schedulePushSharedSettlementRoom,
} from '@/lib/sharedSettlementSync';
import type {
  MockSettlementExpense,
  MockSettlementRoom,
} from '@/types/settlementMock';
import { asAuthUserId } from '@/utils/linkedAuthUser';
import { parseSettlementRoomIdFromTransferKey } from '@/utils/settlementTransferHelpers';

type SettlementPersistOptions = {
  skipSharedPush?: boolean;
};

/** Phase 0.5: 精算モック UI 用のローカル SQLite 永続化 */
export const settlementStore = {
  loadRooms(): MockSettlementRoom[] {
    initializeDatabase();
    return getAllMockSettlementRooms();
  },

  loadCompletedTransferKeys(): Set<string> {
    initializeDatabase();
    return new Set(getSettlementCompletedTransferKeys());
  },

  saveRoom(room: MockSettlementRoom, options?: SettlementPersistOptions): void {
    initializeDatabase();
    insertMockSettlementRoom(room);
    scheduleOwnedSettlementRoomSync(room.id);
    if (!options?.skipSharedPush) {
      schedulePushSharedSettlementRoom(room.id);
    }
  },

  updateRoomTitle(roomId: string, title: string, options?: SettlementPersistOptions): boolean {
    initializeDatabase();
    const ok = updateMockSettlementRoomTitle(roomId, title);
    if (ok) {
      scheduleOwnedSettlementRoomSync(roomId);
      if (!options?.skipSharedPush) {
        schedulePushSharedSettlementRoom(roomId);
      }
    }
    return ok;
  },

  saveExpense(
    roomId: string,
    expense: MockSettlementExpense,
    options?: SettlementPersistOptions
  ): MockSettlementExpense | null {
    initializeDatabase();
    const saved = insertMockSettlementExpense(roomId, expense);
    if (saved) {
      scheduleOwnedSettlementRoomSync(roomId);
      if (!options?.skipSharedPush) {
        schedulePushSharedSettlementRoom(roomId);
      }
    }
    return saved;
  },

  updateExpense(
    roomId: string,
    expense: MockSettlementExpense,
    options?: SettlementPersistOptions
  ): boolean {
    initializeDatabase();
    const ok = updateMockSettlementExpense(roomId, expense);
    if (ok) {
      scheduleOwnedSettlementRoomSync(roomId);
      if (!options?.skipSharedPush) {
        schedulePushSharedSettlementRoom(roomId);
      }
    }
    return ok;
  },

  deleteExpense(roomId: string, expenseId: string, options?: SettlementPersistOptions): boolean {
    initializeDatabase();
    const ok = deleteMockSettlementExpense(roomId, expenseId);
    if (ok) {
      scheduleOwnedSettlementRoomSync(roomId);
      if (!options?.skipSharedPush) {
        schedulePushSharedSettlementRoom(roomId);
      }
    }
    return ok;
  },

  deleteMember(roomId: string, memberId: string, options?: SettlementPersistOptions): boolean {
    initializeDatabase();
    const ok = deleteMockSettlementMember(roomId, memberId);
    if (ok) {
      scheduleOwnedSettlementRoomSync(roomId);
      if (!options?.skipSharedPush) {
        schedulePushSharedSettlementRoom(roomId);
      }
    }
    return ok;
  },

  addMember(
    roomId: string,
    member: MockSettlementRoom['members'][number],
    options?: SettlementPersistOptions
  ): boolean {
    initializeDatabase();
    const ok = addMockSettlementMember(roomId, member);
    if (ok) {
      scheduleOwnedSettlementRoomSync(roomId);
      if (!options?.skipSharedPush) {
        schedulePushSharedSettlementRoom(roomId);
      }
    }
    return ok;
  },

  setMemberLedgerSynced(roomId: string, friendId: string, ledgerSynced: boolean): boolean {
    initializeDatabase();
    const ok = setMockSettlementMemberLedgerSynced(roomId, friendId, ledgerSynced);
    if (ok) {
      scheduleOwnedSettlementRoomSync(roomId);
      schedulePushSharedSettlementRoom(roomId);
    }
    return ok;
  },

  setTransferCompleted(
    transferKey: string,
    completed: boolean,
    options?: SettlementPersistOptions
  ): void {
    initializeDatabase();
    setSettlementTransferCompleted(transferKey, completed);
    scheduleOwnedSettlementCompletionsSync();
    const roomId = parseSettlementRoomIdFromTransferKey(transferKey);
    if (!options?.skipSharedPush && roomId && asAuthUserId(roomId)) {
      schedulePushSharedSettlementCompletion(roomId, transferKey, completed);
    }
  },
};
