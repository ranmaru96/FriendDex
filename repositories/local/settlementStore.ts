import {
  getAllMockSettlementRooms,
  getSettlementCompletedTransferKeys,
  insertMockSettlementExpense,
  insertMockSettlementRoom,
  initializeDatabase,
  setMockSettlementMemberLedgerSynced,
  setSettlementTransferCompleted,
  updateMockSettlementRoomTitle,
} from '@/db';
import type {
  MockSettlementExpense,
  MockSettlementRoom,
} from '@/types/settlementMock';

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

  saveRoom(room: MockSettlementRoom): void {
    initializeDatabase();
    insertMockSettlementRoom(room);
  },

  updateRoomTitle(roomId: string, title: string): boolean {
    initializeDatabase();
    return updateMockSettlementRoomTitle(roomId, title);
  },

  saveExpense(roomId: string, expense: MockSettlementExpense): MockSettlementExpense | null {
    initializeDatabase();
    return insertMockSettlementExpense(roomId, expense);
  },

  setMemberLedgerSynced(roomId: string, friendId: string, ledgerSynced: boolean): boolean {
    initializeDatabase();
    return setMockSettlementMemberLedgerSynced(roomId, friendId, ledgerSynced);
  },

  setTransferCompleted(transferKey: string, completed: boolean): void {
    initializeDatabase();
    setSettlementTransferCompleted(transferKey, completed);
  },
};
