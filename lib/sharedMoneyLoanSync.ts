import { v4 as uuidv4 } from 'uuid';
import {
  applyIncomingSharedMoneyLoan,
  clearMoneyLoanSharedId,
  createMoneyLoans,
  deleteMoneyLoan,
  findFriendByScannedUserId,
  getMoneyLoan,
  getMoneyLoanSession,
  getMoneyLoans,
  getOrCreateMoneyLoanSessionByTitle,
  getMyself,
  initializeDatabase,
  setMoneyLoanRepaid,
  setMoneyLoanSharedMeta,
  updateMoneyLoan,
  updateMoneyLoanSessionTitle,
} from '@/db';
import { getSupabaseClient } from '@/lib/supabase';
import { getAcceptedPeerUserIds } from '@/lib/connectionSync';
import { asAuthUserId, getFriendLinkedAuthUserId } from '@/utils/linkedAuthUser';
import type { MoneyLoan, MoneyLoanDirection } from '@/types';
import {
  scheduleOwnedMoneyLoanDelete,
  scheduleOwnedMoneyLoanSessionSync,
  scheduleOwnedMoneyLoanSync,
} from '@/lib/ownedMoneyLoanSync';

export type SharedMoneyLoanSyncResult = {
  skipped: boolean;
  errorMessage: string | null;
};

type SharedMoneyLoanRow = {
  id: string;
  created_by: string;
  local_loan_id: string;
  lender_user_id: string;
  borrower_user_id: string;
  amount: number;
  title: string;
  memo: string;
  is_repaid: boolean;
  created_at: string;
};

async function requireMyUserId(): Promise<{
  myUserId: string;
  skipped: boolean;
  errorMessage: string | null;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { myUserId: '', skipped: true, errorMessage: 'Supabase が未設定です' };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { myUserId: '', skipped: false, errorMessage: sessionError.message };
  }
  const myUserId = sessionData.session?.user.id?.trim() ?? '';
  if (!myUserId) {
    return { myUserId: '', skipped: true, errorMessage: 'ログインしてください。' };
  }
  return { myUserId, skipped: false, errorMessage: null };
}

type SharePeerResolution =
  | { status: 'shared'; peerUserId: string; myUserId: string }
  | { status: 'local' }
  | { status: 'error'; errorMessage: string };

/** コネクト済みなら共有、それ以外は自分用。未ログインや未コネクトはエラーにしない。 */
async function resolveSharePeer(friendId: string): Promise<SharePeerResolution> {
  const linked = asAuthUserId(getFriendLinkedAuthUserId(friendId))?.toLowerCase() ?? null;
  if (!linked) {
    return { status: 'local' };
  }
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    if (auth.errorMessage && !auth.skipped) {
      return { status: 'error', errorMessage: auth.errorMessage };
    }
    return { status: 'local' };
  }
  if (linked === auth.myUserId.toLowerCase()) {
    return { status: 'local' };
  }
  const accepted = await getAcceptedPeerUserIds();
  if (accepted.errorMessage) {
    return { status: 'error', errorMessage: accepted.errorMessage };
  }
  if (accepted.skipped || !accepted.peerIds.has(linked)) {
    return { status: 'local' };
  }
  return { status: 'shared', peerUserId: linked, myUserId: auth.myUserId };
}

async function upsertSharedMoneyLoanRow(input: {
  sharedId: string;
  myUserId: string;
  peerUserId: string;
  localLoanId: string;
  direction: MoneyLoanDirection;
  amount: number;
  title: string;
  memo: string;
  isRepaid: boolean;
  createdAt: string;
}): Promise<{ errorMessage: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { errorMessage: 'Supabase が未設定です' };
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from('shared_money_loans').upsert(
    {
      id: input.sharedId,
      created_by: input.myUserId,
      local_loan_id: input.localLoanId,
      lender_user_id: input.direction === 'lent' ? input.myUserId : input.peerUserId,
      borrower_user_id: input.direction === 'lent' ? input.peerUserId : input.myUserId,
      amount: Math.floor(input.amount),
      title: input.title,
      memo: input.memo,
      is_repaid: input.isRepaid,
      created_at: input.createdAt || now,
      updated_at: now,
    },
    { onConflict: 'created_by,local_loan_id' }
  );
  return { errorMessage: error?.message ?? null };
}

async function deleteSharedMoneyLoanRow(sharedId: string): Promise<{ errorMessage: string | null }> {
  const trimmed = sharedId.trim();
  if (!trimmed) {
    return { errorMessage: null };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { errorMessage: 'Supabase が未設定です' };
  }
  const { error } = await supabase.from('shared_money_loans').delete().eq('id', trimmed);
  return { errorMessage: error?.message ?? null };
}

const cacheSharedRow = (row: SharedMoneyLoanRow, myUserId: string, acceptedPeers: Set<string>): void => {
  const peerUserId = asAuthUserId(
    row.lender_user_id === myUserId ? row.borrower_user_id : row.lender_user_id
  )?.toLowerCase();
  if (!peerUserId || !acceptedPeers.has(peerUserId)) {
    return;
  }
  const peerFriend = findFriendByScannedUserId(peerUserId);
  const peerFriendId = peerFriend?.id ?? '';
  if (!peerFriendId) {
    return;
  }
  const myselfId = getMyself();
  if (myselfId && peerFriendId === myselfId) {
    return;
  }
  applyIncomingSharedMoneyLoan({
    sharedId: row.id,
    localLoanId: row.created_by === myUserId ? row.local_loan_id : undefined,
    sessionTitle: row.title,
    friendId: peerFriendId,
    amount: row.amount,
    direction: row.lender_user_id === myUserId ? 'lent' : 'borrowed',
    isRepaid: Boolean(row.is_repaid),
    createdAt: row.created_at,
    incomingFromPeer: row.created_by !== myUserId,
  });
};

export async function createCanonicalSharedMoneyLoan(input: {
  friendId: string;
  amount: number;
  direction: MoneyLoanDirection;
  title: string;
}): Promise<{ loan: MoneyLoan | null; errorMessage: string | null }> {
  const amount = Math.floor(input.amount);
  const title = input.title.trim();
  if (!input.friendId.trim() || amount <= 0 || !title) {
    return { loan: null, errorMessage: '相手・金額・タイトルを入力してください。' };
  }
  const peer = await resolveSharePeer(input.friendId);
  if (peer.status === 'error') {
    return { loan: null, errorMessage: peer.errorMessage };
  }

  const localLoanId = uuidv4();
  const now = new Date().toISOString();
  let sharedId = '';
  if (peer.status === 'shared') {
    sharedId = uuidv4();
    const published = await upsertSharedMoneyLoanRow({
      sharedId,
      myUserId: peer.myUserId,
      peerUserId: peer.peerUserId,
      localLoanId,
      direction: input.direction,
      amount,
      title,
      memo: '',
      isRepaid: false,
      createdAt: now,
    });
    if (published.errorMessage) {
      return { loan: null, errorMessage: published.errorMessage };
    }
  }

  initializeDatabase();
  const session = getOrCreateMoneyLoanSessionByTitle(title);
  if (!session) {
    return { loan: null, errorMessage: '登録に失敗しました。' };
  }
  const created = createMoneyLoans({
    sessionId: session.id,
    loanId: localLoanId,
    sharedId,
    incomingFromPeer: false,
    createdAt: now,
    lines: [{ kind: 'friend', value: input.friendId, amount, direction: input.direction }],
  });
  const loan = created[0] ?? null;
  if (loan) {
    scheduleOwnedMoneyLoanSessionSync(session.id);
    scheduleOwnedMoneyLoanSync(loan.id);
  }
  return { loan, errorMessage: loan ? null : '端末への保存に失敗しました。' };
}

export async function updateCanonicalSharedMoneyLoan(input: {
  loanId: string;
  friendId: string;
  amount: number;
  direction: MoneyLoanDirection;
  title: string;
}): Promise<{ errorMessage: string | null }> {
  initializeDatabase();
  const loan = getMoneyLoan(input.loanId);
  if (!loan || loan.incomingFromPeer) {
    return { errorMessage: 'この貸し借りは変更できません。' };
  }
  const amount = Math.floor(input.amount);
  const title = input.title.trim();
  if (!input.friendId.trim() || amount <= 0 || !title) {
    return { errorMessage: '相手・金額・タイトルを入力してください。' };
  }
  const peer = await resolveSharePeer(input.friendId);
  if (peer.status === 'error') {
    return { errorMessage: peer.errorMessage };
  }

  const now = new Date().toISOString();
  if (peer.status === 'shared') {
    const sharedId = loan.sharedId.trim() || uuidv4();
    const published = await upsertSharedMoneyLoanRow({
      sharedId,
      myUserId: peer.myUserId,
      peerUserId: peer.peerUserId,
      localLoanId: loan.id,
      direction: input.direction,
      amount,
      title,
      memo: loan.memo ?? '',
      isRepaid: loan.isRepaid === true,
      createdAt: loan.createdAt || now,
    });
    if (published.errorMessage) {
      return { errorMessage: published.errorMessage };
    }
    setMoneyLoanSharedMeta(loan.id, sharedId, false);
  } else if (loan.sharedId.trim()) {
    const removed = await deleteSharedMoneyLoanRow(loan.sharedId);
    if (removed.errorMessage) {
      return { errorMessage: removed.errorMessage };
    }
    clearMoneyLoanSharedId(loan.id);
  }

  const titleOk = updateMoneyLoanSessionTitle(loan.sessionId, title);
  if (!titleOk) {
    return { errorMessage: 'タイトルの更新に失敗しました。' };
  }
  const ok = updateMoneyLoan(loan.id, {
    counterpartyKind: 'friend',
    counterpartyValue: input.friendId,
    amount,
    direction: input.direction,
  });
  if (!ok) {
    return { errorMessage: '更新に失敗しました。' };
  }
  scheduleOwnedMoneyLoanSync(loan.id);
  return { errorMessage: null };
}

export async function setCanonicalSharedMoneyLoanRepaid(
  loanId: string,
  isRepaid: boolean
): Promise<{ errorMessage: string | null }> {
  initializeDatabase();
  const loan = getMoneyLoan(loanId);
  if (!loan) {
    return { errorMessage: '貸し借りが見つかりません。' };
  }
  if (loan.sharedId.trim()) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { errorMessage: 'Supabase が未設定です' };
    }
    const { error } = await supabase
      .from('shared_money_loans')
      .update({ is_repaid: isRepaid, updated_at: new Date().toISOString() })
      .eq('id', loan.sharedId);
    if (error) {
      return { errorMessage: error.message };
    }
  } else if (!loan.incomingFromPeer) {
    const peer = await resolveSharePeer(
      loan.counterpartyKind === 'friend' ? loan.counterpartyValue : ''
    );
    if (peer.status === 'error') {
      return { errorMessage: peer.errorMessage };
    }
    if (peer.status === 'shared') {
      const pushed = await pushSharedMoneyLoanWithRepaid(loan, isRepaid);
      if (pushed.errorMessage) {
        return pushed;
      }
    }
  }

  const ok = setMoneyLoanRepaid(loan.id, isRepaid);
  if (!ok) {
    return { errorMessage: '更新に失敗しました。' };
  }
  scheduleOwnedMoneyLoanSync(loan.id);
  return { errorMessage: null };
}

export async function deleteCanonicalSharedMoneyLoan(
  loanId: string
): Promise<{ errorMessage: string | null }> {
  initializeDatabase();
  const loan = getMoneyLoan(loanId);
  if (!loan || loan.incomingFromPeer) {
    return { errorMessage: 'この貸し借りは削除できません。' };
  }
  if (loan.sharedId.trim()) {
    const removed = await deleteSharedMoneyLoanRow(loan.sharedId);
    if (removed.errorMessage) {
      return { errorMessage: removed.errorMessage };
    }
  }
  const ok = deleteMoneyLoan(loan.id);
  if (!ok) {
    return { errorMessage: '削除に失敗しました。' };
  }
  scheduleOwnedMoneyLoanDelete(loan.id);
  return { errorMessage: null };
}

async function pushSharedMoneyLoanWithRepaid(
  loan: MoneyLoan,
  isRepaid: boolean
): Promise<SharedMoneyLoanSyncResult> {
  if (loan.incomingFromPeer || loan.counterpartyKind !== 'friend') {
    return { skipped: true, errorMessage: null };
  }
  const peer = await resolveSharePeer(loan.counterpartyValue);
  if (peer.status === 'error') {
    return { skipped: false, errorMessage: peer.errorMessage };
  }
  if (peer.status === 'local') {
    return { skipped: true, errorMessage: null };
  }
  const session = getMoneyLoanSession(loan.sessionId);
  const rowId = loan.sharedId.trim() || uuidv4();
  const published = await upsertSharedMoneyLoanRow({
    sharedId: rowId,
    myUserId: peer.myUserId,
    peerUserId: peer.peerUserId,
    localLoanId: loan.id,
    direction: loan.direction,
    amount: loan.amount,
    title: session?.title ?? '',
    memo: loan.memo ?? '',
    isRepaid,
    createdAt: loan.createdAt,
  });
  if (published.errorMessage) {
    return { skipped: false, errorMessage: published.errorMessage };
  }
  setMoneyLoanSharedMeta(loan.id, rowId, false);
  return { skipped: false, errorMessage: null };
}

export async function pushSharedMoneyLoan(loanId: string): Promise<SharedMoneyLoanSyncResult> {
  const trimmed = loanId.trim();
  if (!trimmed) {
    return { skipped: true, errorMessage: null };
  }
  initializeDatabase();
  const loan = getMoneyLoan(trimmed);
  if (!loan) {
    return { skipped: true, errorMessage: null };
  }
  return pushSharedMoneyLoanWithRepaid(loan, loan.isRepaid === true);
}

export async function pushSharedMoneyLoanRepaid(loanId: string): Promise<SharedMoneyLoanSyncResult> {
  const result = await setCanonicalSharedMoneyLoanRepaid(
    loanId,
    getMoneyLoan(loanId)?.isRepaid === true
  );
  return { skipped: false, errorMessage: result.errorMessage };
}

export async function pullSharedMoneyLoans(): Promise<SharedMoneyLoanSyncResult> {
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
  const accepted = await getAcceptedPeerUserIds();
  if (accepted.errorMessage) {
    return { skipped: false, errorMessage: accepted.errorMessage };
  }
  const acceptedPeers = accepted.peerIds;
  const { data, error } = await supabase
    .from('shared_money_loans')
    .select(
      'id, created_by, local_loan_id, lender_user_id, borrower_user_id, amount, title, memo, is_repaid, created_at'
    )
    .or(`lender_user_id.eq.${myUserId},borrower_user_id.eq.${myUserId}`);
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }

  const rows = (data ?? []) as SharedMoneyLoanRow[];
  const serverIds = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    cacheSharedRow(row, myUserId, acceptedPeers);
  }
  getMoneyLoans().forEach((loan) => {
    if (!loan.sharedId.trim() || serverIds.has(loan.sharedId)) {
      return;
    }
    deleteMoneyLoan(loan.id);
  });
  const unpublished = getMoneyLoans().filter((loan) => {
    if (loan.incomingFromPeer || loan.sharedId.trim() || loan.counterpartyKind !== 'friend') {
      return false;
    }
    const linked = asAuthUserId(getFriendLinkedAuthUserId(loan.counterpartyValue))?.toLowerCase();
    return Boolean(linked && acceptedPeers.has(linked));
  });
  for (const loan of unpublished) {
    const pushed = await pushSharedMoneyLoan(loan.id);
    if (pushed.errorMessage) {
      return pushed;
    }
  }
  return { skipped: rows.length === 0 && unpublished.length === 0, errorMessage: null };
}

export async function pushSharedMoneyLoansForPeerUserId(
  peerUserId: string
): Promise<SharedMoneyLoanSyncResult> {
  const peer = asAuthUserId(peerUserId)?.toLowerCase();
  if (!peer) {
    return { skipped: true, errorMessage: null };
  }
  initializeDatabase();
  const loans = getMoneyLoans().filter((loan) => {
    if (loan.incomingFromPeer || loan.counterpartyKind !== 'friend') {
      return false;
    }
    const linked = asAuthUserId(getFriendLinkedAuthUserId(loan.counterpartyValue))?.toLowerCase();
    return linked === peer;
  });
  if (loans.length === 0) {
    return { skipped: true, errorMessage: null };
  }
  for (const loan of loans) {
    const result = await pushSharedMoneyLoan(loan.id);
    if (result.errorMessage) {
      return result;
    }
  }
  return { skipped: false, errorMessage: null };
}

export function schedulePushSharedMoneyLoan(loanId: string): void {
  void pushSharedMoneyLoan(loanId).then((result) => {
    if (result.errorMessage) {
      console.warn('shared money loan push failed', result.errorMessage);
    }
  });
}

export function schedulePushSharedMoneyLoanRepaid(loanId: string): void {
  void pushSharedMoneyLoanRepaid(loanId).then((result) => {
    if (result.errorMessage) {
      console.warn('shared money loan repaid push failed', result.errorMessage);
    }
  });
}
