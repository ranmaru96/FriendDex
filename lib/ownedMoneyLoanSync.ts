import { v4 as uuidv4 } from 'uuid';
import {
  getMoneyLoan,
  getMoneyLoanSession,
  getMoneyLoanSessions,
  getMoneyLoans,
  getMoneyLoansBySessionId,
  initializeDatabase,
} from '@/db';
import { getSupabaseClient } from '@/lib/supabase';

export type OwnedMoneyLoanSyncResult = {
  skipped: boolean;
  errorMessage: string | null;
};

type OwnedMoneyLoanSessionRow = {
  id: string;
  owner_id: string;
  local_session_id: string;
  title: string;
  local_created_at: string;
  updated_at: string;
  deleted_at: null;
  sync_version: number;
};

type OwnedMoneyLoanRow = {
  id: string;
  owner_id: string;
  local_loan_id: string;
  local_session_id: string;
  local_group_id: string;
  counterparty_kind: string;
  counterparty_value: string;
  amount: number;
  direction: string;
  memo: string;
  is_repaid: boolean;
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

export async function upsertOwnedMoneyLoanSession(sessionId: string): Promise<OwnedMoneyLoanSyncResult> {
  const trimmed = sessionId.trim();
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
  const session = getMoneyLoanSession(trimmed);
  if (!session) {
    return { skipped: true, errorMessage: null };
  }

  const { data: existing, error: readError } = await supabase
    .from('owned_money_loan_sessions')
    .select('id, sync_version')
    .eq('owner_id', auth.ownerId)
    .eq('local_session_id', trimmed)
    .maybeSingle();
  if (readError) {
    return { skipped: false, errorMessage: readError.message };
  }

  const now = new Date().toISOString();
  const row: OwnedMoneyLoanSessionRow = {
    id: typeof existing?.id === 'string' && existing.id.trim() ? existing.id : uuidv4(),
    owner_id: auth.ownerId,
    local_session_id: trimmed,
    title: session.title ?? '',
    local_created_at: session.createdAt ?? now,
    updated_at: now,
    deleted_at: null,
    sync_version: nextSyncVersion(existing?.sync_version),
  };
  const { error } = await supabase
    .from('owned_money_loan_sessions')
    .upsert(row, { onConflict: 'owner_id,local_session_id' });
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  return { skipped: false, errorMessage: null };
}

export async function upsertOwnedMoneyLoan(
  loanId: string,
  options?: { includeSession?: boolean }
): Promise<OwnedMoneyLoanSyncResult> {
  const trimmed = loanId.trim();
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
  const loan = getMoneyLoan(trimmed);
  if (!loan) {
    return { skipped: true, errorMessage: null };
  }

  if (options?.includeSession !== false) {
    const sessionResult = await upsertOwnedMoneyLoanSession(loan.sessionId);
    if (sessionResult.errorMessage) {
      return sessionResult;
    }
  }

  const { data: existing, error: readError } = await supabase
    .from('owned_money_loans')
    .select('id, sync_version')
    .eq('owner_id', auth.ownerId)
    .eq('local_loan_id', trimmed)
    .maybeSingle();
  if (readError) {
    return { skipped: false, errorMessage: readError.message };
  }

  const now = new Date().toISOString();
  const row: OwnedMoneyLoanRow = {
    id: typeof existing?.id === 'string' && existing.id.trim() ? existing.id : uuidv4(),
    owner_id: auth.ownerId,
    local_loan_id: trimmed,
    local_session_id: loan.sessionId ?? '',
    local_group_id: loan.groupId ?? '',
    counterparty_kind: loan.counterpartyKind ?? 'friend',
    counterparty_value: loan.counterpartyValue ?? '',
    amount: Number.isFinite(Number(loan.amount)) ? Math.floor(Number(loan.amount)) : 0,
    direction: loan.direction === 'borrowed' ? 'borrowed' : 'lent',
    memo: loan.memo ?? '',
    is_repaid: loan.isRepaid === true,
    local_created_at: loan.createdAt ?? now,
    updated_at: now,
    deleted_at: null,
    sync_version: nextSyncVersion(existing?.sync_version),
  };
  const { error } = await supabase.from('owned_money_loans').upsert(row, { onConflict: 'owner_id,local_loan_id' });
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  return { skipped: false, errorMessage: null };
}

export async function syncOwnedMoneyLoanSession(sessionId: string): Promise<OwnedMoneyLoanSyncResult> {
  const sessionResult = await upsertOwnedMoneyLoanSession(sessionId);
  if (sessionResult.errorMessage) {
    return sessionResult;
  }
  initializeDatabase();
  const loans = getMoneyLoansBySessionId(sessionId);
  for (const loan of loans) {
    const result = await upsertOwnedMoneyLoan(loan.id, { includeSession: false });
    if (result.errorMessage) {
      return result;
    }
  }
  return { skipped: false, errorMessage: null };
}

export async function markOwnedMoneyLoanDeleted(loanId: string): Promise<OwnedMoneyLoanSyncResult> {
  const trimmed = loanId.trim();
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
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('owned_money_loans')
    .update({ deleted_at: now, updated_at: now })
    .eq('owner_id', auth.ownerId)
    .eq('local_loan_id', trimmed);
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  return { skipped: false, errorMessage: null };
}

export async function markOwnedMoneyLoanSessionDeleted(sessionId: string): Promise<OwnedMoneyLoanSyncResult> {
  const trimmed = sessionId.trim();
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
  const now = new Date().toISOString();
  const { error: loanError } = await supabase
    .from('owned_money_loans')
    .update({ deleted_at: now, updated_at: now })
    .eq('owner_id', auth.ownerId)
    .eq('local_session_id', trimmed);
  if (loanError) {
    return { skipped: false, errorMessage: loanError.message };
  }
  const { error } = await supabase
    .from('owned_money_loan_sessions')
    .update({ deleted_at: now, updated_at: now })
    .eq('owner_id', auth.ownerId)
    .eq('local_session_id', trimmed);
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  return { skipped: false, errorMessage: null };
}

export async function syncAllOwnedMoneyLoans(): Promise<OwnedMoneyLoanSyncResult> {
  const auth = await requireOwnerId();
  if (!auth.ownerId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }

  initializeDatabase();
  const sessions = getMoneyLoanSessions();
  for (const session of sessions) {
    const result = await upsertOwnedMoneyLoanSession(session.id);
    if (result.errorMessage) {
      return result;
    }
  }
  const loans = getMoneyLoans();
  for (const loan of loans) {
    const result = await upsertOwnedMoneyLoan(loan.id, { includeSession: false });
    if (result.errorMessage) {
      return result;
    }
  }
  return { skipped: sessions.length === 0 && loans.length === 0, errorMessage: null };
}

export function scheduleOwnedMoneyLoanSync(loanId: string): void {
  void upsertOwnedMoneyLoan(loanId).then((result) => {
    if (result.errorMessage) {
      console.warn('owned money loan sync failed', result.errorMessage);
    }
  });
}

export function scheduleOwnedMoneyLoanSessionSync(sessionId: string): void {
  void syncOwnedMoneyLoanSession(sessionId).then((result) => {
    if (result.errorMessage) {
      console.warn('owned money loan session sync failed', result.errorMessage);
    }
  });
}

export function scheduleOwnedMoneyLoanDelete(loanId: string): void {
  void markOwnedMoneyLoanDeleted(loanId);
}

export function scheduleOwnedMoneyLoanSessionDelete(sessionId: string): void {
  void markOwnedMoneyLoanSessionDeleted(sessionId);
}
