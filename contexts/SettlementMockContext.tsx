import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getAllFriends, getMyself, initializeDatabase } from '@/db';
import { settlementStore } from '@/repositories/local/settlementStore';
import type {
  CreateMockSettlementExpenseInput,
  CreateMockSettlementRoomInput,
  MockSettlementExpense,
  MockSettlementInvite,
  MockSettlementMember,
  MockSettlementRoom,
} from '@/types/settlementMock';
import {
  getMockFollowRelation,
  willAutoSyncLedger,
} from '@/utils/settlementMockHelpers';
import { buildFriendNameById } from '@/utils/moneyLoanHelpers';

type SettlementMockContextValue = {
  rooms: MockSettlementRoom[];
  invites: MockSettlementInvite[];
  createRoom: (input: CreateMockSettlementRoomInput) => MockSettlementRoom | null;
  updateRoomTitle: (roomId: string, title: string) => boolean;
  acceptInvite: (inviteId: string) => boolean;
  declineInvite: (inviteId: string) => boolean;
  addExpense: (input: CreateMockSettlementExpenseInput) => MockSettlementExpense | null;
  getRoom: (roomId: string) => MockSettlementRoom | undefined;
  isTransferCompleted: (key: string) => boolean;
  toggleTransferCompleted: (key: string) => void;
};

const SettlementMockContext = createContext<SettlementMockContextValue | null>(null);

function buildInitialInvite(): MockSettlementInvite {
  return {
    id: uuidv4(),
    roomId: 'demo-room-pending',
    roomTitle: '春キャンプ（デモ招待）',
    fromFriendId: 'demo-friend',
    fromDisplayName: 'デモユーザー',
    createdAt: new Date().toISOString(),
  };
}

export function SettlementMockProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<MockSettlementRoom[]>(() => settlementStore.loadRooms());
  const [invites, setInvites] = useState<MockSettlementInvite[]>([buildInitialInvite()]);
  const [completedTransferKeys, setCompletedTransferKeys] = useState<Set<string>>(() =>
    settlementStore.loadCompletedTransferKeys()
  );

  useEffect(() => {
    setRooms(settlementStore.loadRooms());
    setCompletedTransferKeys(settlementStore.loadCompletedTransferKeys());
  }, []);

  const createRoom = useCallback((input: CreateMockSettlementRoomInput): MockSettlementRoom | null => {
    initializeDatabase();
    const friends = getAllFriends();
    const myselfId = getMyself();
    const friendNameById = buildFriendNameById(friends);
    const orderedIds = friends.map((friend) => friend.id);
    const title = input.title.trim();
    if (!title || input.memberFriendIds.length === 0) {
      return null;
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
      const relation = getMockFollowRelation(friendId, orderedIds, myselfId);
      const displayName = friendNameById.get(friendId) ?? friendId;
      members.push({
        id: uuidv4(),
        friendId,
        displayName,
        ledgerSynced: willAutoSyncLedger(relation),
      });
    });

    if (members.length <= 1) {
      return null;
    }

    const room: MockSettlementRoom = {
      id: uuidv4(),
      title,
      members,
      expenses: [],
      createdAt: new Date().toISOString(),
    };

    settlementStore.saveRoom(room);
    setRooms((prev) => [room, ...prev]);
    return room;
  }, []);

  const updateRoomTitle = useCallback((roomId: string, title: string): boolean => {
    const normalizedTitle = title.trim();
    if (!roomId.trim() || !normalizedTitle) {
      return false;
    }
    const ok = settlementStore.updateRoomTitle(roomId, normalizedTitle);
    if (!ok) {
      return false;
    }
    setRooms((prev) =>
      prev.map((room) => (room.id === roomId ? { ...room, title: normalizedTitle } : room))
    );
    return true;
  }, []);

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
    (input: CreateMockSettlementExpenseInput): MockSettlementExpense | null => {
      const amount = Math.floor(input.amount);
      const title = input.title.trim();
      const splitMemberIds = input.splitMemberIds.filter(Boolean);
      if (!title || amount <= 0 || splitMemberIds.length === 0) {
        return null;
      }

      const expense: MockSettlementExpense = {
        id: uuidv4(),
        payerMemberId: input.payerMemberId,
        title,
        amount,
        splitMemberIds,
        createdAt: new Date().toISOString(),
      };

      const saved = settlementStore.saveExpense(input.roomId, expense);
      if (!saved) {
        return null;
      }

      setRooms((prev) =>
        prev.map((room) =>
          room.id === input.roomId
            ? { ...room, expenses: [expense, ...room.expenses] }
            : room
        )
      );
      return expense;
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

  const toggleTransferCompleted = useCallback((key: string) => {
    setCompletedTransferKeys((prev) => {
      const next = new Set(prev);
      const willComplete = !next.has(key);
      if (willComplete) {
        next.add(key);
      } else {
        next.delete(key);
      }
      settlementStore.setTransferCompleted(key, willComplete);
      return next;
    });
  }, []);

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
  return ctx;
}
