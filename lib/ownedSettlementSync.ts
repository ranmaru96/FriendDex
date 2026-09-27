import { v4 as uuidv4 } from 'uuid';
import {
  getAllMockSettlementRooms,
  getSettlementCompletedTransferKeys,
  initializeDatabase,
} from '@/db';
import { getSupabaseClient } from '@/lib/supabase';
import type { MockSettlementRoom } from '@/types/settlementMock';

export type OwnedSettlementSyncResult = {
  skipped: boolean;
  errorMessage: string | null;
};

type OwnedSettlementRoomRow = {
  id: string;
  owner_id: string;
  local_room_id: string;
  title: string;
  local_created_at: string;
  updated_at: string;
  deleted_at: null;
  sync_version: number;
};

const nextSyncVersion = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) + 1 : 1;

async function requireOwnerId(): Promise<{ ownerId: string; errorMessage: string | null; skipped: boolean }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ownerId: '', errorMessage: null, skipped: true };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { ownerId: '', errorMessage: sessionError.message, skipped: false };
  }
  const ownerId = sessionData.session?.user.id?.trim() ?? '';
  if (!ownerId) {
    return { ownerId: '', errorMessage: null, skipped: true };
  }
  return { ownerId, errorMessage: null, skipped: false };
}

const findRoom = (roomId: string): MockSettlementRoom | null => {
  const trimmed = roomId.trim();
  if (!trimmed) {
    return null;
  }
  return getAllMockSettlementRooms().find((room) => room.id === trimmed) ?? null;
};

export async function upsertOwnedSettlementRoom(roomId: string): Promise<OwnedSettlementSyncResult> {
  const trimmed = roomId.trim();
  if (!trimmed) {
    return { skipped: true, errorMessage: null };
  }
  const auth = await requireOwnerId();
  if (!auth.ownerId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }

  initializeDatabase();
  const room = findRoom(trimmed);
  if (!room) {
    return { skipped: true, errorMessage: null };
  }

  const { data: existing, error: readError } = await supabase
    .from('owned_settlement_rooms')
    .select('id, sync_version')
    .eq('owner_id', auth.ownerId)
    .eq('local_room_id', trimmed)
    .maybeSingle();
  if (readError) {
    return { skipped: false, errorMessage: readError.message };
  }

  const now = new Date().toISOString();
  const row: OwnedSettlementRoomRow = {
    id: typeof existing?.id === 'string' && existing.id.trim() ? existing.id : uuidv4(),
    owner_id: auth.ownerId,
    local_room_id: trimmed,
    title: room.title ?? '',
    local_created_at: room.createdAt ?? now,
    updated_at: now,
    deleted_at: null,
    sync_version: nextSyncVersion(existing?.sync_version),
  };
  const { error: upsertError } = await supabase
    .from('owned_settlement_rooms')
    .upsert(row, { onConflict: 'owner_id,local_room_id' });
  if (upsertError) {
    return { skipped: false, errorMessage: upsertError.message };
  }

  const { error: deleteMembersError } = await supabase
    .from('owned_settlement_members')
    .delete()
    .eq('owner_id', auth.ownerId)
    .eq('local_room_id', trimmed);
  if (deleteMembersError) {
    return { skipped: false, errorMessage: deleteMembersError.message };
  }
  if (room.members.length > 0) {
    const { error: insertMembersError } = await supabase.from('owned_settlement_members').insert(
      room.members.map((member) => ({
        owner_id: auth.ownerId,
        local_room_id: trimmed,
        local_member_id: member.id,
        local_friend_id: member.friendId ?? '',
        display_name: member.displayName ?? '',
        ledger_synced: member.ledgerSynced === true,
      }))
    );
    if (insertMembersError) {
      return { skipped: false, errorMessage: insertMembersError.message };
    }
  }

  const { error: deleteExpensesError } = await supabase
    .from('owned_settlement_expenses')
    .delete()
    .eq('owner_id', auth.ownerId)
    .eq('local_room_id', trimmed);
  if (deleteExpensesError) {
    return { skipped: false, errorMessage: deleteExpensesError.message };
  }
  if (room.expenses.length > 0) {
    const { error: insertExpensesError } = await supabase.from('owned_settlement_expenses').insert(
      room.expenses.map((expense) => ({
        id: uuidv4(),
        owner_id: auth.ownerId,
        local_expense_id: expense.id,
        local_room_id: trimmed,
        local_payer_member_id: expense.payerMemberId ?? '',
        title: expense.title ?? '',
        amount: Number.isFinite(Number(expense.amount)) ? Math.floor(Number(expense.amount)) : 0,
        split_member_ids: Array.isArray(expense.splitMemberIds) ? expense.splitMemberIds : [],
        local_created_at: expense.createdAt ?? now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
      }))
    );
    if (insertExpensesError) {
      return { skipped: false, errorMessage: insertExpensesError.message };
    }
  }

  return { skipped: false, errorMessage: null };
}

export async function syncOwnedSettlementTransferCompletions(): Promise<OwnedSettlementSyncResult> {
  const auth = await requireOwnerId();
  if (!auth.ownerId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }

  initializeDatabase();
  const keys = getSettlementCompletedTransferKeys();
  const { error: deleteError } = await supabase
    .from('owned_settlement_transfer_completions')
    .delete()
    .eq('owner_id', auth.ownerId);
  if (deleteError) {
    return { skipped: false, errorMessage: deleteError.message };
  }
  if (keys.length > 0) {
    const { error: insertError } = await supabase.from('owned_settlement_transfer_completions').insert(
      keys.map((transferKey) => ({
        owner_id: auth.ownerId,
        transfer_key: transferKey,
        completed_at: new Date().toISOString(),
      }))
    );
    if (insertError) {
      return { skipped: false, errorMessage: insertError.message };
    }
  }
  return { skipped: keys.length === 0, errorMessage: null };
}

export async function syncAllOwnedSettlementRooms(): Promise<OwnedSettlementSyncResult> {
  const auth = await requireOwnerId();
  if (!auth.ownerId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }

  initializeDatabase();
  const rooms = getAllMockSettlementRooms();
  for (const room of rooms) {
    const result = await upsertOwnedSettlementRoom(room.id);
    if (result.errorMessage) {
      return result;
    }
  }
  const completions = await syncOwnedSettlementTransferCompletions();
  if (completions.errorMessage) {
    return completions;
  }
  return { skipped: rooms.length === 0 && completions.skipped, errorMessage: null };
}

export function scheduleOwnedSettlementRoomSync(roomId: string): void {
  void upsertOwnedSettlementRoom(roomId).then((result) => {
    if (result.errorMessage) {
      console.warn('owned settlement room sync failed', result.errorMessage);
    }
  });
}

export function scheduleOwnedSettlementCompletionsSync(): void {
  void syncOwnedSettlementTransferCompletions().then((result) => {
    if (result.errorMessage) {
      console.warn('owned settlement completions sync failed', result.errorMessage);
    }
  });
}
