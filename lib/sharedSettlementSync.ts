import {
  findFriendByScannedUserId,
  getAllMockSettlementRooms,
  getMockSettlementRoomById,
  getMyself,
  getSettlementCompletedTransferKeys,
  initializeDatabase,
  mergeSharedSettlementRoomLocally,
  setSettlementTransferCompleted,
} from '@/db';
import { getAcceptedPeerUserIds } from '@/lib/connectionSync';
import { getSupabaseClient } from '@/lib/supabase';
import type { MockSettlementMember, MockSettlementRoom } from '@/types/settlementMock';
import { asAuthUserId, getFriendLinkedAuthUserId } from '@/utils/linkedAuthUser';

export const SHARED_SETTLEMENT_PEER_REQUIRED_MESSAGE =
  'コネクト済みの相手を1人以上入れてください。';

export type SharedSettlementSyncResult = {
  skipped: boolean;
  errorMessage: string | null;
};

/** 済トグル直後の pull が、まだ古いサーバー値で手元を戻さないようにする。 */
const pendingCompletionByKey = new Map<string, boolean>();

type SharedRoomRow = {
  id: string;
  created_by: string;
  title: string;
  created_at: string;
};

type SharedMemberRow = {
  room_id: string;
  member_id: string;
  user_id: string | null;
  display_name: string;
};

type SharedExpenseRow = {
  id: string;
  room_id: string;
  payer_member_id: string;
  title: string;
  amount: number;
  split_member_ids: string[];
  created_at: string;
};

type SharedCompletionRow = {
  room_id: string;
  transfer_key: string;
};

const memberUserId = (
  member: MockSettlementMember,
  myselfId: string | null,
  myUserId: string,
  acceptedPeerIds: Set<string>
): string | null => {
  if (member.friendId === 'myself' || (myselfId && member.friendId === myselfId)) {
    return myUserId;
  }
  let linked: string | null = null;
  if (member.friendId.startsWith('user:')) {
    linked = asAuthUserId(member.friendId.slice('user:'.length));
  } else {
    linked = getFriendLinkedAuthUserId(member.friendId);
  }
  const normalized = asAuthUserId(linked)?.toLowerCase() ?? null;
  if (!normalized || normalized === myUserId.toLowerCase()) {
    return normalized === myUserId.toLowerCase() ? myUserId : null;
  }
  return acceptedPeerIds.has(normalized) ? normalized : null;
};

export async function commitSharedSettlementRoom(
  room: MockSettlementRoom,
  options?: { requireLinkedPeer?: boolean }
): Promise<SharedSettlementSyncResult> {
  const trimmed = room.id.trim();
  if (!asAuthUserId(trimmed)) {
    return { skipped: true, errorMessage: 'グループをサーバーへ送れませんでした。' };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: 'Supabase が未設定です' };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { skipped: false, errorMessage: sessionError.message };
  }
  const myUserId = sessionData.session?.user.id?.trim() ?? '';
  if (!myUserId) {
    return { skipped: true, errorMessage: 'ログインしてください。' };
  }

  initializeDatabase();
  const accepted = await getAcceptedPeerUserIds();
  if (accepted.errorMessage) {
    return { skipped: false, errorMessage: accepted.errorMessage };
  }
  const myselfId = getMyself();
  const members = room.members.map((member) => ({
    room_id: trimmed,
    member_id: member.id,
    user_id: memberUserId(member, myselfId, myUserId, accepted.peerIds),
    display_name: member.displayName,
  }));
  const linkedCount = members.filter((member) => member.user_id && member.user_id !== myUserId).length;

  const { data: existingRoom } = await supabase
    .from('shared_settlement_rooms')
    .select('id, created_by')
    .eq('id', trimmed)
    .maybeSingle();
  if (linkedCount === 0 && !existingRoom?.id) {
    return {
      skipped: true,
      errorMessage: options?.requireLinkedPeer ? SHARED_SETTLEMENT_PEER_REQUIRED_MESSAGE : null,
    };
  }
  const now = new Date().toISOString();
  if (existingRoom?.id) {
    const { error: roomError } = await supabase
      .from('shared_settlement_rooms')
      .update({ title: room.title, updated_at: now })
      .eq('id', trimmed);
    if (roomError) {
      return { skipped: false, errorMessage: roomError.message };
    }
  } else {
    const { error: roomError } = await supabase.from('shared_settlement_rooms').insert({
      id: trimmed,
      created_by: myUserId,
      title: room.title,
      created_at: room.createdAt,
      updated_at: now,
    });
    if (roomError) {
      return { skipped: false, errorMessage: roomError.message };
    }
  }

  const canReplaceMembers = !existingRoom?.created_by || existingRoom.created_by === myUserId;
  if (canReplaceMembers) {
    await supabase.from('shared_settlement_members').delete().eq('room_id', trimmed);
    const { error: memberError } = await supabase.from('shared_settlement_members').insert(members);
    if (memberError) {
      return { skipped: false, errorMessage: memberError.message };
    }
  }

  for (const expense of room.expenses) {
    const { error: expenseError } = await supabase.from('shared_settlement_expenses').upsert({
      id: expense.id,
      room_id: trimmed,
      payer_member_id: expense.payerMemberId,
      title: expense.title,
      amount: Math.floor(expense.amount),
      split_member_ids: expense.splitMemberIds,
      created_at: expense.createdAt,
    });
    if (expenseError) {
      return { skipped: false, errorMessage: expenseError.message };
    }
  }
  return { skipped: false, errorMessage: null };
}

export async function pushSharedSettlementRoom(roomId: string): Promise<SharedSettlementSyncResult> {
  const trimmed = roomId.trim();
  if (!asAuthUserId(trimmed)) {
    return { skipped: true, errorMessage: null };
  }
  initializeDatabase();
  const room = getMockSettlementRoomById(trimmed);
  if (!room) {
    return { skipped: true, errorMessage: null };
  }
  return commitSharedSettlementRoom(room);
}

export async function commitSharedSettlementExpense(
  roomId: string,
  expense: { id: string; payerMemberId: string; title: string; amount: number; splitMemberIds: string[]; createdAt: string }
): Promise<SharedSettlementSyncResult> {
  initializeDatabase();
  const room = getMockSettlementRoomById(roomId);
  if (!room) {
    return { skipped: true, errorMessage: 'グループが見つかりません。' };
  }
  const roomResult = await commitSharedSettlementRoom(
    {
      ...room,
      expenses: room.expenses.some((item) => item.id === expense.id)
        ? room.expenses
        : [expense, ...room.expenses],
    },
    { requireLinkedPeer: true }
  );
  if (roomResult.errorMessage) {
    return roomResult;
  }
  if (roomResult.skipped) {
    return { skipped: true, errorMessage: SHARED_SETTLEMENT_PEER_REQUIRED_MESSAGE };
  }
  return { skipped: false, errorMessage: null };
}

export async function pushSharedSettlementCompletion(
  roomId: string,
  transferKey: string,
  completed: boolean
): Promise<SharedSettlementSyncResult> {
  const trimmedRoom = roomId.trim();
  const key = transferKey.trim();
  if (!asAuthUserId(trimmedRoom) || !key) {
    return { skipped: true, errorMessage: null };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const myUserId = sessionData.session?.user.id?.trim() ?? '';
  if (!myUserId) {
    return { skipped: true, errorMessage: null };
  }

  if (!completed) {
    const { error } = await supabase
      .from('shared_settlement_completions')
      .delete()
      .eq('room_id', trimmedRoom)
      .eq('transfer_key', key);
    if (error) {
      return { skipped: false, errorMessage: error.message };
    }
    return { skipped: false, errorMessage: null };
  }

  const { error } = await supabase.from('shared_settlement_completions').upsert({
    room_id: trimmedRoom,
    transfer_key: key,
    completed_by: myUserId,
    completed_at: new Date().toISOString(),
  });
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  return { skipped: false, errorMessage: null };
}

export async function pullSharedSettlementRooms(): Promise<SharedSettlementSyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { skipped: false, errorMessage: sessionError.message };
  }
  const myUserId = sessionData.session?.user.id?.trim() ?? '';
  if (!myUserId) {
    return { skipped: true, errorMessage: null };
  }

  initializeDatabase();
  const myselfId = getMyself();
  const { data: rooms, error: roomsError } = await supabase
    .from('shared_settlement_rooms')
    .select('id, created_by, title, created_at');
  if (roomsError) {
    return { skipped: false, errorMessage: roomsError.message };
  }
  const roomRows = (rooms ?? []) as SharedRoomRow[];
  if (roomRows.length === 0) {
    return { skipped: true, errorMessage: null };
  }

  const { data: memberRows, error: membersError } = await supabase
    .from('shared_settlement_members')
    .select('room_id, member_id, user_id, display_name');
  if (membersError) {
    return { skipped: false, errorMessage: membersError.message };
  }
  const { data: expenseRows, error: expensesError } = await supabase
    .from('shared_settlement_expenses')
    .select('id, room_id, payer_member_id, title, amount, split_member_ids, created_at');
  if (expensesError) {
    return { skipped: false, errorMessage: expensesError.message };
  }
  const { data: completionRows, error: completionsError } = await supabase
    .from('shared_settlement_completions')
    .select('room_id, transfer_key');
  if (completionsError) {
    return { skipped: false, errorMessage: completionsError.message };
  }

  const membersByRoom = new Map<string, SharedMemberRow[]>();
  ((memberRows ?? []) as SharedMemberRow[]).forEach((member) => {
    const list = membersByRoom.get(member.room_id) ?? [];
    list.push(member);
    membersByRoom.set(member.room_id, list);
  });
  const expensesByRoom = new Map<string, SharedExpenseRow[]>();
  ((expenseRows ?? []) as SharedExpenseRow[]).forEach((expense) => {
    const list = expensesByRoom.get(expense.room_id) ?? [];
    list.push({
      ...expense,
      split_member_ids: Array.isArray(expense.split_member_ids) ? expense.split_member_ids : [],
    });
    expensesByRoom.set(expense.room_id, list);
  });

  for (const roomRow of roomRows) {
    const sharedMembers = membersByRoom.get(roomRow.id) ?? [];
    const localMembers: MockSettlementMember[] = sharedMembers.map((member) => {
      const userId = asAuthUserId(member.user_id);
      if (userId && userId === myUserId) {
        return {
          id: member.member_id,
          friendId: myselfId ?? 'myself',
          displayName: member.display_name || '自分',
          ledgerSynced: true,
        };
      }
      const friend = userId ? findFriendByScannedUserId(userId) : null;
      return {
        id: member.member_id,
        friendId: friend?.id ?? (userId ? `user:${userId}` : member.member_id),
        displayName: friend?.name ?? member.display_name,
        ledgerSynced: true,
      };
    });
    const localRoom: MockSettlementRoom = {
      id: roomRow.id,
      title: roomRow.title,
      createdAt: roomRow.created_at,
      members: localMembers,
      expenses: (expensesByRoom.get(roomRow.id) ?? []).map((expense) => ({
        id: expense.id,
        payerMemberId: expense.payer_member_id,
        title: expense.title,
        amount: expense.amount,
        splitMemberIds: expense.split_member_ids,
        createdAt: expense.created_at,
      })),
    };
    mergeSharedSettlementRoomLocally(localRoom);

    const serverKeys = new Set(
      ((completionRows ?? []) as SharedCompletionRow[])
        .filter((row) => row.room_id === roomRow.id)
        .map((row) => row.transfer_key)
    );
    const prefix = `${roomRow.id}|`;
    getSettlementCompletedTransferKeys()
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => {
        if (pendingCompletionByKey.has(key)) {
          return;
        }
        if (!serverKeys.has(key)) {
          setSettlementTransferCompleted(key, false);
        }
      });
    serverKeys.forEach((key) => {
      if (pendingCompletionByKey.has(key)) {
        return;
      }
      setSettlementTransferCompleted(key, true);
    });
  }

  return { skipped: false, errorMessage: null };
}

export async function pushSharedSettlementRoomsForPeerUserId(
  peerUserId: string
): Promise<SharedSettlementSyncResult> {
  const peer = asAuthUserId(peerUserId)?.toLowerCase();
  if (!peer) {
    return { skipped: true, errorMessage: null };
  }
  initializeDatabase();
  const myselfId = getMyself();
  const rooms = getAllMockSettlementRooms().filter((room) =>
    room.members.some((member) => {
      if (member.friendId === 'myself' || (myselfId && member.friendId === myselfId)) {
        return false;
      }
      const linked = member.friendId.startsWith('user:')
        ? asAuthUserId(member.friendId.slice('user:'.length))
        : getFriendLinkedAuthUserId(member.friendId);
      return asAuthUserId(linked)?.toLowerCase() === peer;
    })
  );
  if (rooms.length === 0) {
    return { skipped: true, errorMessage: null };
  }
  for (const room of rooms) {
    const result = await pushSharedSettlementRoom(room.id);
    if (result.errorMessage) {
      return result;
    }
  }
  return { skipped: false, errorMessage: null };
}

export function schedulePushSharedSettlementRoom(roomId: string): void {
  void pushSharedSettlementRoom(roomId).then((result) => {
    if (result.errorMessage) {
      console.warn('shared settlement room push failed', result.errorMessage);
    }
  });
}

export function schedulePushSharedSettlementCompletion(
  roomId: string,
  transferKey: string,
  completed: boolean
): void {
  const key = transferKey.trim();
  if (key) {
    pendingCompletionByKey.set(key, completed);
  }
  void pushSharedSettlementCompletion(roomId, transferKey, completed)
    .then((result) => {
      if (result.errorMessage) {
        console.warn('shared settlement completion push failed', result.errorMessage);
      }
    })
    .finally(() => {
      if (key) {
        pendingCompletionByKey.delete(key);
      }
    });
}
