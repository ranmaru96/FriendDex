import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getAllFriends, getMockSettlementRoomById, getMyself, initializeDatabase } from '@/db';
import { settlementStore } from '@/repositories/local/settlementStore';
import {
  commitSharedSettlementExpense,
  commitSharedSettlementRoom,
  pushSharedSettlementCompletion,
} from '@/lib/sharedSettlementSync';
import { getSupabaseClient } from '@/lib/supabase';
import { asAuthUserId, getFriendLinkedAuthUserId } from '@/utils/linkedAuthUser';
import type {
  CreateMockSettlementExpenseInput,
  CreateMockSettlementRoomInput,
  MockSettlementExpense,
  MockSettlementInvite,
  MockSettlementMember,
  MockSettlementRoom,
} from '@/types/settlementMock';
import { buildFriendNameById } from '@/utils/moneyLoanHelpers';
import { parseSettlementRoomIdFromTransferKey } from '@/utils/settlementTransferHelpers';
import {
  SETTLED_MONEY_LOCK_MESSAGE,
  expenseMoneyFieldsChanged,
  roomHasSettledTransfer,
  settlementMemberRemovalBlockReason,
} from '@/utils/settlementRoomEdit';

type SettlementMockContextValue = {
  rooms: MockSettlementRoom[];
  invites: MockSettlementInvite[];
  createRoom: (
    input: CreateMockSettlementRoomInput
  ) => Promise<{ room: MockSettlementRoom | null; errorMessage: string | null }>;
  updateRoomTitle: (
    roomId: string,
    title: string
  ) => Promise<{ ok: boolean; errorMessage: string | null }>;
  acceptInvite: (inviteId: string) => boolean;
  declineInvite: (inviteId: string) => boolean;
  addExpense: (
    input: CreateMockSettlementExpenseInput
  ) => Promise<{ expense: MockSettlementExpense | null; errorMessage: string | null }>;
  updateExpense: (
    roomId: string,
    expense: MockSettlementExpense
  ) => Promise<{ ok: boolean; errorMessage: string | null }>;
  deleteExpense: (
    roomId: string,
    expenseId: string
  ) => Promise<{ ok: boolean; errorMessage: string | null }>;
  addRoomMembers: (
    roomId: string,
    friendIds: string[]
  ) => Promise<{ ok: boolean; errorMessage: string | null }>;
  removeRoomMember: (
    roomId: string,
    memberId: string
  ) => Promise<{ ok: boolean; errorMessage: string | null }>;
  getRoom: (roomId: string) => MockSettlementRoom | undefined;
  completedTransferKeys: ReadonlySet<string>;
  isTransferCompleted: (key: string) => boolean;
  toggleTransferCompleted: (key: string) => Promise<{ errorMessage: string | null }>;
  loadIfNeeded: () => void;
  reloadFromStore: () => void;
};

const SettlementMockContext = createContext<SettlementMockContextValue | null>(null);

async function readMyUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return '';
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id?.trim().toLowerCase() ?? '';
}

function roomMoneyIsLocked(room: MockSettlementRoom): boolean {
  return roomHasSettledTransfer(room, settlementStore.loadCompletedTransferKeys());
}

export function SettlementMockProvider({ children }: { children: ReactNode }) {
  const loadedRef = useRef(true);
  const [rooms, setRooms] = useState<MockSettlementRoom[]>(() => settlementStore.loadRooms());
  const [invites, setInvites] = useState<MockSettlementInvite[]>([]);
  const [completedTransferKeys, setCompletedTransferKeys] = useState<Set<string>>(
    () => settlementStore.loadCompletedTransferKeys()
  );

  const loadIfNeeded = useCallback(() => {
    if (loadedRef.current) {
      return;
    }
    loadedRef.current = true;
    setRooms(settlementStore.loadRooms());
    setCompletedTransferKeys(settlementStore.loadCompletedTransferKeys());
  }, []);

  const reloadFromStore = useCallback(() => {
    loadedRef.current = true;
    setRooms(settlementStore.loadRooms());
    setCompletedTransferKeys(settlementStore.loadCompletedTransferKeys());
  }, []);

  const createRoom = useCallback(async (
    input: CreateMockSettlementRoomInput
  ): Promise<{ room: MockSettlementRoom | null; errorMessage: string | null }> => {
    initializeDatabase();
    const friends = getAllFriends();
    const myselfId = getMyself();
    const friendNameById = buildFriendNameById(friends);
    const title = input.title.trim();
    if (!title || input.memberFriendIds.length === 0) {
      return { room: null, errorMessage: 'タイトルとメンバーを入力してください。' };
    }

    const ownerMember: MockSettlementMember = {
      id: uuidv4(),
      friendId: myselfId ?? 'myself',
      displayName: myselfId ? friendNameById.get(myselfId) ?? '自分' : '自分',
      ledgerSynced: true,
    };

    const members: MockSettlementMember[] = [ownerMember];
    input.memberFriendIds.forEach((friendId) => {
      if (myselfId && friendId === myselfId) {
        return;
      }
      const displayName = friendNameById.get(friendId) ?? friendId;
      members.push({
        id: uuidv4(),
        friendId,
        displayName,
        ledgerSynced: Boolean(asAuthUserId(getFriendLinkedAuthUserId(friendId))),
      });
    });

    if (members.length <= 1) {
      return { room: null, errorMessage: 'タイトルとメンバーを入力してください。' };
    }

    const room: MockSettlementRoom = {
      id: uuidv4(),
      title,
      members,
      expenses: [],
      createdAt: new Date().toISOString(),
      createdByUserId: await readMyUserId(),
    };

    const published = await commitSharedSettlementRoom(room);
    if (published.errorMessage) {
      return { room: null, errorMessage: published.errorMessage };
    }

    settlementStore.saveRoom(room, { skipSharedPush: true });
    setRooms((prev) => [room, ...prev]);
    return { room, errorMessage: null };
  }, []);

  const updateRoomTitle = useCallback(async (
    roomId: string,
    title: string
  ): Promise<{ ok: boolean; errorMessage: string | null }> => {
    const normalizedTitle = title.trim();
    if (!roomId.trim() || !normalizedTitle) {
      return { ok: false, errorMessage: 'グループ名を入力してください。' };
    }
    const current = rooms.find((room) => room.id === roomId);
    if (!current) {
      return { ok: false, errorMessage: 'グループが見つかりません。' };
    }
    const published = await commitSharedSettlementRoom({ ...current, title: normalizedTitle });
    if (published.errorMessage) {
      return { ok: false, errorMessage: published.errorMessage };
    }
    const ok = settlementStore.updateRoomTitle(roomId, normalizedTitle, { skipSharedPush: true });
    if (!ok) {
      return { ok: false, errorMessage: 'グループ名の更新に失敗しました。' };
    }
    setRooms((prev) =>
      prev.map((room) => (room.id === roomId ? { ...room, title: normalizedTitle } : room))
    );
    return { ok: true, errorMessage: null };
  }, [rooms]);

  const acceptInvite = useCallback((inviteId: string): boolean => {
    const invite = invites.find((item) => item.id === inviteId);
    if (!invite) {
      return false;
    }

    setInvites((prev) => prev.filter((item) => item.id !== inviteId));

    if (invite.roomId === 'demo-room-pending') {
      const demoRoom: MockSettlementRoom = {
        id: uuidv4(),
        title: invite.roomTitle,
        members: [
          {
            id: uuidv4(),
            friendId: invite.fromFriendId,
            displayName: invite.fromDisplayName,
            ledgerSynced: true,
          },
          {
            id: uuidv4(),
            friendId: 'myself',
            displayName: '自分',
            ledgerSynced: true,
          },
        ],
        expenses: [
          {
            id: uuidv4(),
            payerMemberId: '',
            title: 'BBQ（デモ）',
            amount: 12000,
            splitMemberIds: [],
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: invite.createdAt,
      };
      demoRoom.expenses[0].payerMemberId = demoRoom.members[0].id;
      demoRoom.expenses[0].splitMemberIds = demoRoom.members.map((member) => member.id);
      settlementStore.saveRoom(demoRoom);
      setRooms((prev) => [demoRoom, ...prev]);
      return true;
    }

    settlementStore.setMemberLedgerSynced(invite.roomId, 'myself', true);
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== invite.roomId) {
          return room;
        }
        return {
          ...room,
          members: room.members.map((member) =>
            member.friendId === 'myself' ? { ...member, ledgerSynced: true } : member
          ),
        };
      })
    );
    return true;
  }, [invites]);

  const declineInvite = useCallback((inviteId: string): boolean => {
    setInvites((prev) => prev.filter((item) => item.id !== inviteId));
    return true;
  }, []);

  const addExpense = useCallback(
    async (
      input: CreateMockSettlementExpenseInput
    ): Promise<{ expense: MockSettlementExpense | null; errorMessage: string | null }> => {
      const amount = Math.floor(input.amount);
      const title = input.title.trim();
      const splitMemberIds = input.splitMemberIds.filter(Boolean);
      if (!title || amount <= 0 || splitMemberIds.length === 0) {
        return { expense: null, errorMessage: 'タイトルと金額を入力してください。' };
      }
      const expense: MockSettlementExpense = {
        id: uuidv4(),
        payerMemberId: input.payerMemberId,
        title,
        amount,
        splitMemberIds,
        createdAt: new Date().toISOString(),
      };

      const published = await commitSharedSettlementExpense(input.roomId, expense);
      if (published.errorMessage) {
        return { expense: null, errorMessage: published.errorMessage };
      }

      const saved = settlementStore.saveExpense(input.roomId, expense, { skipSharedPush: true });
      if (!saved) {
        return { expense: null, errorMessage: '支出の保存に失敗しました。' };
      }

      setRooms((prev) =>
        prev.map((room) =>
          room.id === input.roomId
            ? { ...room, expenses: [expense, ...room.expenses] }
            : room
        )
      );
      return { expense, errorMessage: null };
    },
    []
  );

  const updateExpense = useCallback(
    async (
      roomId: string,
      expense: MockSettlementExpense
    ): Promise<{ ok: boolean; errorMessage: string | null }> => {
      initializeDatabase();
      const room = getMockSettlementRoomById(roomId);
      if (!room) {
        return { ok: false, errorMessage: 'グループが見つかりません。' };
      }
      const current = room.expenses.find((item) => item.id === expense.id);
      if (!current) {
        return { ok: false, errorMessage: '支出が見つかりません。' };
      }
      const title = expense.title.trim();
      const amount = Math.floor(expense.amount);
      const splitMemberIds = expense.splitMemberIds.filter(Boolean);
      if (!title || amount <= 0 || splitMemberIds.length === 0 || !expense.payerMemberId.trim()) {
        return { ok: false, errorMessage: 'タイトルと金額を入力してください。' };
      }
      const nextExpense: MockSettlementExpense = {
        ...current,
        title,
        amount,
        payerMemberId: expense.payerMemberId,
        splitMemberIds,
      };
      if (expenseMoneyFieldsChanged(current, nextExpense) && roomMoneyIsLocked(room)) {
        return { ok: false, errorMessage: SETTLED_MONEY_LOCK_MESSAGE };
      }
      const nextRoom: MockSettlementRoom = {
        ...room,
        expenses: room.expenses.map((item) => (item.id === nextExpense.id ? nextExpense : item)),
      };
      const published = await commitSharedSettlementRoom(nextRoom);
      if (published.errorMessage) {
        return { ok: false, errorMessage: published.errorMessage };
      }
      const ok = settlementStore.updateExpense(roomId, nextExpense, { skipSharedPush: true });
      if (!ok) {
        return { ok: false, errorMessage: '支出の更新に失敗しました。' };
      }
      setRooms((prev) =>
        prev.map((item) => (item.id === roomId ? { ...item, expenses: nextRoom.expenses } : item))
      );
      return { ok: true, errorMessage: null };
    },
    []
  );

  const deleteExpense = useCallback(
    async (roomId: string, expenseId: string): Promise<{ ok: boolean; errorMessage: string | null }> => {
      initializeDatabase();
      const room = getMockSettlementRoomById(roomId);
      if (!room) {
        return { ok: false, errorMessage: 'グループが見つかりません。' };
      }
      if (!room.expenses.some((expense) => expense.id === expenseId)) {
        return { ok: false, errorMessage: '支出が見つかりません。' };
      }
      if (roomMoneyIsLocked(room)) {
        return { ok: false, errorMessage: SETTLED_MONEY_LOCK_MESSAGE };
      }
      const nextRoom: MockSettlementRoom = {
        ...room,
        expenses: room.expenses.filter((expense) => expense.id !== expenseId),
      };
      const published = await commitSharedSettlementRoom(nextRoom);
      if (published.errorMessage) {
        return { ok: false, errorMessage: published.errorMessage };
      }
      const ok = settlementStore.deleteExpense(roomId, expenseId, { skipSharedPush: true });
      if (!ok) {
        return { ok: false, errorMessage: '支出の削除に失敗しました。' };
      }
      setRooms((prev) =>
        prev.map((item) => (item.id === roomId ? { ...item, expenses: nextRoom.expenses } : item))
      );
      return { ok: true, errorMessage: null };
    },
    []
  );

  const addRoomMembers = useCallback(
    async (roomId: string, friendIds: string[]): Promise<{ ok: boolean; errorMessage: string | null }> => {
      initializeDatabase();
      const room = getMockSettlementRoomById(roomId);
      if (!room) {
        return { ok: false, errorMessage: 'グループが見つかりません。' };
      }
      const friends = getAllFriends();
      const myselfId = getMyself();
      const friendNameById = buildFriendNameById(friends);
      const existingFriendIds = new Set(room.members.map((member) => member.friendId));
      const additions: MockSettlementMember[] = [];
      friendIds.forEach((friendId) => {
        const normalized = friendId.trim();
        if (!normalized || (myselfId && normalized === myselfId) || existingFriendIds.has(normalized)) {
          return;
        }
        existingFriendIds.add(normalized);
        additions.push({
          id: uuidv4(),
          friendId: normalized,
          displayName: friendNameById.get(normalized) ?? normalized,
          ledgerSynced: Boolean(asAuthUserId(getFriendLinkedAuthUserId(normalized))),
        });
      });
      if (additions.length === 0) {
        return { ok: false, errorMessage: '追加するメンバーを選んでください。' };
      }
      const nextRoom: MockSettlementRoom = { ...room, members: [...room.members, ...additions] };
      const published = await commitSharedSettlementRoom(nextRoom);
      if (published.errorMessage) {
        return { ok: false, errorMessage: published.errorMessage };
      }
      for (const member of additions) {
        const saved = settlementStore.addMember(roomId, member, { skipSharedPush: true });
        if (!saved) {
          return { ok: false, errorMessage: 'メンバーの保存に失敗しました。' };
        }
      }
      setRooms((prev) =>
        prev.map((item) => (item.id === roomId ? { ...item, members: nextRoom.members } : item))
      );
      return { ok: true, errorMessage: null };
    },
    []
  );

  const removeRoomMember = useCallback(
    async (roomId: string, memberId: string): Promise<{ ok: boolean; errorMessage: string | null }> => {
      initializeDatabase();
      const room = getMockSettlementRoomById(roomId);
      if (!room) {
        return { ok: false, errorMessage: 'グループが見つかりません。' };
      }
      const reason = settlementMemberRemovalBlockReason(room, memberId, getMyself(), await readMyUserId());
      if (reason) {
        return { ok: false, errorMessage: reason };
      }
      const nextRoom: MockSettlementRoom = {
        ...room,
        members: room.members.filter((member) => member.id !== memberId),
      };
      const published = await commitSharedSettlementRoom(nextRoom);
      if (published.errorMessage) {
        return { ok: false, errorMessage: published.errorMessage };
      }
      const ok = settlementStore.deleteMember(roomId, memberId, { skipSharedPush: true });
      if (!ok) {
        return { ok: false, errorMessage: 'メンバーの削除に失敗しました。' };
      }
      setRooms((prev) =>
        prev.map((item) => (item.id === roomId ? { ...item, members: nextRoom.members } : item))
      );
      return { ok: true, errorMessage: null };
    },
    []
  );

  const getRoom = useCallback(
    (roomId: string) => rooms.find((room) => room.id === roomId),
    [rooms]
  );

  const isTransferCompleted = useCallback(
    (key: string) => completedTransferKeys.has(key),
    [completedTransferKeys]
  );

  const toggleTransferCompleted = useCallback(async (key: string): Promise<{ errorMessage: string | null }> => {
    const willComplete = !completedTransferKeys.has(key);
    const roomId = parseSettlementRoomIdFromTransferKey(key);
    if (!roomId) {
      return { errorMessage: '清算項目が見つかりません。' };
    }
    const published = await pushSharedSettlementCompletion(roomId, key, willComplete);
    if (published.errorMessage) {
      return { errorMessage: published.errorMessage };
    }
    settlementStore.setTransferCompleted(key, willComplete, { skipSharedPush: true });
    setCompletedTransferKeys((prev) => {
      const next = new Set(prev);
      if (willComplete) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
    return { errorMessage: null };
  }, [completedTransferKeys]);

  const value = useMemo(
    () => ({
      rooms,
      invites,
      createRoom,
      updateRoomTitle,
      acceptInvite,
      declineInvite,
      addExpense,
      updateExpense,
      deleteExpense,
      addRoomMembers,
      removeRoomMember,
      getRoom,
      completedTransferKeys,
      isTransferCompleted,
      toggleTransferCompleted,
      loadIfNeeded,
      reloadFromStore,
    }),
    [
      rooms,
      invites,
      createRoom,
      updateRoomTitle,
      acceptInvite,
      declineInvite,
      addExpense,
      updateExpense,
      deleteExpense,
      addRoomMembers,
      removeRoomMember,
      getRoom,
      completedTransferKeys,
      isTransferCompleted,
      toggleTransferCompleted,
      loadIfNeeded,
      reloadFromStore,
    ]
  );

  return (
    <SettlementMockContext.Provider value={value}>{children}</SettlementMockContext.Provider>
  );
}

export function useSettlementMock(): SettlementMockContextValue {
  const ctx = useContext(SettlementMockContext);
  if (!ctx) {
    throw new Error('useSettlementMock must be used within SettlementMockProvider');
  }
  useEffect(() => {
    ctx.loadIfNeeded();
  }, [ctx]);
  return ctx;
}
