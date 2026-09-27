import {
  getAppSetting,
  getDefaultProfile,
  getResolvedMyselfId,
  initializeDatabase,
  setAppSetting,
  deleteIncomingSharedEpisodesByOwnerUserId,
} from '@/db';
import { getSupabaseClient } from '@/lib/supabase';
import { isNetworkReachable, ONLINE_REQUIRED_MESSAGE } from '@/lib/networkReachability';
import { asAuthUserId, getFriendLinkedAuthUserId } from '@/utils/linkedAuthUser';

export type ConnectionSyncResult = {
  skipped: boolean;
  errorMessage: string | null;
};

const offlineWriteResult = (): ConnectionSyncResult | null => {
  if (isNetworkReachable()) {
    return null;
  }
  return { skipped: true, errorMessage: ONLINE_REQUIRED_MESSAGE };
};

export type ConnectionStatus = 'pending' | 'accepted';

export type ConnectionRow = {
  userA: string;
  userB: string;
  requestedBy: string;
  status: ConnectionStatus;
  requesterDisplayName: string;
  peerUserId: string;
};

type ConnectionDbRow = {
  user_a: string;
  user_b: string;
  requested_by: string;
  status: string;
  requester_display_name: string;
};

const orderedPair = (left: string, right: string): [string, string] | null => {
  const a = asAuthUserId(left)?.toLowerCase() ?? null;
  const b = asAuthUserId(right)?.toLowerCase() ?? null;
  if (!a || !b || a === b) {
    return null;
  }
  return a < b ? [a, b] : [b, a];
};

const toConnectionRow = (row: ConnectionDbRow, myUserId: string): ConnectionRow | null => {
  const userA = asAuthUserId(row.user_a)?.toLowerCase() ?? null;
  const userB = asAuthUserId(row.user_b)?.toLowerCase() ?? null;
  const requestedBy = asAuthUserId(row.requested_by)?.toLowerCase() ?? null;
  const status = row.status === 'accepted' ? 'accepted' : row.status === 'pending' ? 'pending' : null;
  if (!userA || !userB || !requestedBy || !status) {
    return null;
  }
  const peerUserId = userA === myUserId ? userB : userA;
  return {
    userA,
    userB,
    requestedBy,
    status,
    requesterDisplayName: row.requester_display_name?.trim() || '（名前なし）',
    peerUserId,
  };
};

const ACCEPTED_PEER_CACHE_KEY = 'accepted_connection_peer_ids';

type AcceptedPeerCache = {
  ownerUserId: string;
  peerIds: string[];
};

function readAcceptedPeerCache(): AcceptedPeerCache | null {
  initializeDatabase();
  const raw = getAppSetting(ACCEPTED_PEER_CACHE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AcceptedPeerCache;
    if (!parsed || typeof parsed.ownerUserId !== 'string' || !Array.isArray(parsed.peerIds)) {
      return null;
    }
    return {
      ownerUserId: parsed.ownerUserId.trim().toLowerCase(),
      peerIds: parsed.peerIds
        .map((id) => (typeof id === 'string' ? asAuthUserId(id)?.toLowerCase() ?? '' : ''))
        .filter(Boolean),
    };
  } catch {
    return null;
  }
}

function writeAcceptedPeerCache(ownerUserId: string, peerIds: Iterable<string>): void {
  const owner = asAuthUserId(ownerUserId)?.toLowerCase() ?? '';
  if (!owner) {
    return;
  }
  const unique = [
    ...new Set(
      [...peerIds]
        .map((id) => asAuthUserId(id)?.toLowerCase() ?? '')
        .filter(Boolean)
    ),
  ];
  initializeDatabase();
  setAppSetting(
    ACCEPTED_PEER_CACHE_KEY,
    JSON.stringify({ ownerUserId: owner, peerIds: unique } satisfies AcceptedPeerCache)
  );
}

function rememberAcceptedRows(ownerUserId: string, rows: ConnectionRow[]): void {
  writeAcceptedPeerCache(
    ownerUserId,
    rows.filter((row) => row.status === 'accepted').map((row) => row.peerUserId)
  );
}

function addCachedAcceptedPeer(ownerUserId: string, peerUserId: string): void {
  const peer = asAuthUserId(peerUserId)?.toLowerCase();
  if (!peer) {
    return;
  }
  const next = new Set(getCachedAcceptedPeerIds());
  next.add(peer);
  writeAcceptedPeerCache(ownerUserId, next);
}

function dropCachedAcceptedPeer(ownerUserId: string, peerUserId: string): void {
  const peer = asAuthUserId(peerUserId)?.toLowerCase();
  if (!peer) {
    return;
  }
  const next = [...getCachedAcceptedPeerIds()].filter((id) => id !== peer);
  writeAcceptedPeerCache(ownerUserId, next);
}

export function getCachedAcceptedPeerIds(): Set<string> {
  const cached = readAcceptedPeerCache();
  return new Set(cached?.peerIds ?? []);
}

/** コネクト中の人物カードは、解除するまで削除できない。 */
export function isPersonCardLockedByAcceptedConnection(friendId: string): boolean {
  const linked = getFriendLinkedAuthUserId(friendId);
  if (!linked) {
    return false;
  }
  return getCachedAcceptedPeerIds().has(linked.toLowerCase());
}

async function requireMyUserId(): Promise<{
  myUserId: string;
  errorMessage: string | null;
  skipped: boolean;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { myUserId: '', errorMessage: null, skipped: true };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { myUserId: '', errorMessage: sessionError.message, skipped: false };
  }
  const myUserId = asAuthUserId(sessionData.session?.user.id)?.toLowerCase() ?? '';
  if (!myUserId) {
    return { myUserId: '', errorMessage: null, skipped: true };
  }
  return { myUserId, errorMessage: null, skipped: false };
}

const requesterDisplayName = (): string => {
  initializeDatabase();
  const myselfId = getResolvedMyselfId();
  const name = myselfId ? getDefaultProfile(myselfId)?.name?.trim() ?? '' : '';
  return name || '（名前なし）';
};

export async function listConnections(): Promise<{
  rows: ConnectionRow[];
  skipped: boolean;
  errorMessage: string | null;
}> {
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    return { rows: [], skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { rows: [], skipped: true, errorMessage: null };
  }
  const { data, error } = await supabase
    .from('connections')
    .select('user_a, user_b, requested_by, status, requester_display_name');
  if (error) {
    return { rows: [], skipped: false, errorMessage: error.message };
  }
  const rows = ((data ?? []) as ConnectionDbRow[])
    .map((row) => toConnectionRow(row, auth.myUserId))
    .filter((row): row is ConnectionRow => row != null);
  rememberAcceptedRows(auth.myUserId, rows);
  return { rows, skipped: false, errorMessage: null };
}

export async function getAcceptedPeerUserIds(): Promise<{
  peerIds: Set<string>;
  skipped: boolean;
  errorMessage: string | null;
}> {
  const listed = await listConnections();
  if (listed.errorMessage || listed.skipped) {
    return { peerIds: new Set(), skipped: listed.skipped, errorMessage: listed.errorMessage };
  }
  return {
    peerIds: new Set(
      listed.rows.filter((row) => row.status === 'accepted').map((row) => row.peerUserId)
    ),
    skipped: false,
    errorMessage: null,
  };
}

export async function requestConnection(peerUserId: string): Promise<ConnectionSyncResult> {
  const blocked = offlineWriteResult();
  if (blocked) {
    return blocked;
  }
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const pair = orderedPair(auth.myUserId, peerUserId);
  if (!pair) {
    return { skipped: true, errorMessage: null };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }

  const { data: existing, error: readError } = await supabase
    .from('connections')
    .select('user_a, user_b, requested_by, status, requester_display_name')
    .eq('user_a', pair[0])
    .eq('user_b', pair[1])
    .maybeSingle();
  if (readError) {
    return { skipped: false, errorMessage: readError.message };
  }
  if (existing) {
    const row = toConnectionRow(existing as ConnectionDbRow, auth.myUserId);
    if (!row) {
      return { skipped: true, errorMessage: null };
    }
    if (row.status === 'accepted') {
      addCachedAcceptedPeer(auth.myUserId, row.peerUserId);
      return { skipped: true, errorMessage: null };
    }
    if (row.requestedBy === auth.myUserId) {
      return { skipped: true, errorMessage: null };
    }
    return acceptConnection(row.peerUserId);
  }

  const { error: insertError } = await supabase.from('connections').insert({
    user_a: pair[0],
    user_b: pair[1],
    requested_by: auth.myUserId,
    status: 'pending',
    requester_display_name: requesterDisplayName(),
    updated_at: new Date().toISOString(),
  });
  if (insertError) {
    return { skipped: false, errorMessage: insertError.message };
  }
  return { skipped: false, errorMessage: null };
}

export async function acceptConnection(peerUserId: string): Promise<ConnectionSyncResult> {
  const blocked = offlineWriteResult();
  if (blocked) {
    return blocked;
  }
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const pair = orderedPair(auth.myUserId, peerUserId);
  if (!pair) {
    return { skipped: true, errorMessage: null };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }

  const { error: updateError } = await supabase
    .from('connections')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('user_a', pair[0])
    .eq('user_b', pair[1])
    .neq('requested_by', auth.myUserId);
  if (updateError) {
    return { skipped: false, errorMessage: updateError.message };
  }

  const { pushSharedMoneyLoansForPeerUserId } = await import('@/lib/sharedMoneyLoanSync');
  const { pushSharedSettlementRoomsForPeerUserId } = await import('@/lib/sharedSettlementSync');
  const loans = await pushSharedMoneyLoansForPeerUserId(peerUserId);
  if (loans.errorMessage) {
    return { skipped: false, errorMessage: loans.errorMessage };
  }
  const rooms = await pushSharedSettlementRoomsForPeerUserId(peerUserId);
  if (rooms.errorMessage) {
    return { skipped: false, errorMessage: rooms.errorMessage };
  }
  addCachedAcceptedPeer(auth.myUserId, peerUserId);
  return { skipped: false, errorMessage: null };
}

export async function rejectConnection(peerUserId: string): Promise<ConnectionSyncResult> {
  const blocked = offlineWriteResult();
  if (blocked) {
    return blocked;
  }
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const pair = orderedPair(auth.myUserId, peerUserId);
  if (!pair) {
    return { skipped: true, errorMessage: null };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('user_a', pair[0])
    .eq('user_b', pair[1])
    .eq('status', 'pending');
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  return { skipped: false, errorMessage: null };
}

export async function removeConnection(peerUserId: string): Promise<ConnectionSyncResult> {
  const blocked = offlineWriteResult();
  if (blocked) {
    return blocked;
  }
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const pair = orderedPair(auth.myUserId, peerUserId);
  if (!pair) {
    return { skipped: true, errorMessage: null };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('user_a', pair[0])
    .eq('user_b', pair[1])
    .eq('status', 'accepted');
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  dropCachedAcceptedPeer(auth.myUserId, peerUserId);
  deleteIncomingSharedEpisodesByOwnerUserId(peerUserId);
  return { skipped: false, errorMessage: null };
}

export function scheduleRequestConnection(peerUserId: string): void {
  void requestConnection(peerUserId).then((result) => {
    if (result.errorMessage) {
      console.warn('connection request failed', result.errorMessage);
    }
  });
}
