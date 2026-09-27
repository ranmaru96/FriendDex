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
import { getAllFriends, getMyself, initializeDatabase } from '@/db';
import { settlementStore } from '@/repositories/local/settlementStore';
import {
  commitSharedSettlementExpense,
  commitSharedSettlementRoom,
  pushSharedSettlementCompletion,
  SHARED_SETTLEMENT_PEER_REQUIRED_MESSAGE,
} from '@/lib/sharedSettlementSync';
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
  getRoom: (roomId: string) => MockSettlementRoom | undefined;
  isTransferCompleted: (key: string) => boolean;
  toggleTransferCompleted: (key: string) => Promise<{ errorMessage: string | null }>;
  loadIfNeeded: () => void;
  reloadFromStore: () => void;
};

const SettlementMockContext = createContext<SettlementMockContextValue | null>(null);

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
    };

    const published = await commitSharedSettlementRoom(room, { requireLinkedPeer: true });
    if (published.errorMessage) {
      return { room: null, errorMessage: published.errorMessage };
    }
    if (published.skipped) {
      return { room: null, errorMessage: SHARED_SETTLEMENT_PEER_REQUIRED_MESSAGE };
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
    const published = await commitSharedSettlementRoom(
      { ...current, title: normalizedTitle },
      { requireLinkedPeer: true }
    );
    if (published.errorMessage) {
      return { ok: false, errorMessage: published.errorMessage };
    }
    if (published.skipped) {
      return { ok: false, errorMessage: SHARED_SETTLEMENT_PEER_REQUIRED_MESSAGE };
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
      if (published.skipped) {
        return { expense: null, errorMessage: SHARED_SETTLEMENT_PEER_REQUIRED_MESSAGE };
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
    if (published.skipped) {
      return { errorMessage: SHARED_SETTLEMENT_PEER_REQUIRED_MESSAGE };
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
      getRoom,
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
      getRoom,
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
