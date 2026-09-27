import { v4 as uuidv4 } from 'uuid';
import type { Profile, Saying } from '@/types';
import {
  getAllFriends,
  getDefaultProfile,
  getResolvedMyselfId,
  initializeDatabase,
} from '@/db';
import { getSupabaseClient } from '@/lib/supabase';
import { syncOwnedPersonPhotoUpload } from '@/lib/identityPhotoStorage';

export type OwnedPersonCardSyncResult = {
  skipped: boolean;
  errorMessage: string | null;
};

const AUTH_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OwnedSayingRow = {
  id: string;
  text: string;
  date: string;
};

type OwnedPersonCardRow = {
  id: string;
  owner_id: string;
  local_friend_id: string;
  linked_user_id: string | null;
  display_name: string;
  family_name: string;
  given_name: string;
  nickname: string;
  birthday: string;
  height: number | null;
  weight: number | null;
  origin: string;
  residence: string;
  mbti: string;
  category: string;
  description: string;
  affiliations: string[];
  personalities: string[];
  experiences: string[];
  traits: string[];
  notes: string[];
  likes: string[];
  dislikes: string[];
  sayings: OwnedSayingRow[];
  import_source: string;
  scanned_at: string;
  updated_at: string;
  deleted_at: null;
  sync_version: number;
};

const toStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toSayingRows = (value: Saying[] | undefined): OwnedSayingRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Saying => Boolean(item && typeof item.id === 'string'))
    .map((item) => ({
      id: item.id,
      text: typeof item.text === 'string' ? item.text : '',
      date: typeof item.date === 'string' ? item.date : '',
    }));
};

const toOptionalInt = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
};

const linkedUserIdOf = (profile: Profile): string | null => {
  const scanned = profile.scannedUserId?.trim() ?? '';
  if (!AUTH_USER_ID_RE.test(scanned)) {
    return null;
  }
  return scanned;
};

const profileToRow = (
  profile: Profile,
  ownerId: string,
  rowId: string,
  syncVersion: number
): OwnedPersonCardRow => ({
  id: rowId,
  owner_id: ownerId,
  local_friend_id: profile.friendId,
  linked_user_id: linkedUserIdOf(profile),
  display_name: profile.name ?? '',
  family_name: profile.familyName ?? '',
  given_name: profile.givenName ?? '',
  nickname: profile.nickname ?? '',
  birthday: profile.birthday ?? '',
  height: toOptionalInt(profile.height),
  weight: toOptionalInt(profile.weight),
  origin: profile.origin ?? '',
  residence: profile.residence ?? '',
  mbti: profile.mbti ?? '',
  category: profile.category ?? '',
  description: profile.description ?? '',
  affiliations: toStringList(profile.affiliations),
  personalities: toStringList(profile.personalities),
  experiences: toStringList(profile.experiences),
  traits: toStringList(profile.traits),
  notes: toStringList(profile.notes),
  likes: toStringList(profile.likes),
  dislikes: toStringList(profile.dislikes),
  sayings: toSayingRows(profile.sayings),
  import_source: profile.importSource === 'qr_scan' ? 'qr_scan' : 'manual',
  scanned_at: profile.scannedAt ?? '',
  updated_at: new Date().toISOString(),
  deleted_at: null,
  sync_version: syncVersion,
});

export async function upsertOwnedPersonCard(friendId: string): Promise<OwnedPersonCardSyncResult> {
  const trimmed = friendId.trim();
  if (!trimmed) {
    return { skipped: true, errorMessage: null };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { skipped: false, errorMessage: sessionError.message };
  }
  const ownerId = sessionData.session?.user.id?.trim() ?? '';
  if (!ownerId) {
    return { skipped: true, errorMessage: null };
  }

  initializeDatabase();
  const myselfId = getResolvedMyselfId();
  if (myselfId && trimmed === myselfId) {
    return { skipped: true, errorMessage: null };
  }
  const profile = getDefaultProfile(trimmed);
  if (!profile) {
    return { skipped: true, errorMessage: null };
  }

  const { data: existing, error: readError } = await supabase
    .from('owned_person_cards')
    .select('id, sync_version')
    .eq('owner_id', ownerId)
    .eq('local_friend_id', trimmed)
    .maybeSingle();
  if (readError) {
    return { skipped: false, errorMessage: readError.message };
  }
  const nextVersion =
    typeof existing?.sync_version === 'number' && Number.isFinite(existing.sync_version)
      ? Math.floor(existing.sync_version) + 1
      : 1;
  const rowId =
    typeof existing?.id === 'string' && existing.id.trim() ? existing.id : uuidv4();
  const row = profileToRow(profile, ownerId, rowId, nextVersion);

  const { error: upsertError } = await supabase
    .from('owned_person_cards')
    .upsert(row, { onConflict: 'owner_id,local_friend_id' });
  if (upsertError) {
    return { skipped: false, errorMessage: upsertError.message };
  }

  const photoPath = await syncOwnedPersonPhotoUpload(supabase, ownerId, trimmed, profile.photoUri);
  const { error: photoUpdateError } = await supabase
    .from('owned_person_cards')
    .update({ photo_path: photoPath })
    .eq('owner_id', ownerId)
    .eq('local_friend_id', trimmed);
  if (photoUpdateError) {
    return { skipped: false, errorMessage: null };
  }
  return { skipped: false, errorMessage: null };
}

export async function syncOwnedPersonCardIfNeeded(
  friendId?: string | null
): Promise<OwnedPersonCardSyncResult> {
  initializeDatabase();
  const myselfId = getResolvedMyselfId();
  const trimmed = friendId?.trim() ?? '';
  if (!trimmed || (myselfId && trimmed === myselfId)) {
    return { skipped: true, errorMessage: null };
  }
  return upsertOwnedPersonCard(trimmed);
}

export async function syncAllOwnedPersonCards(): Promise<OwnedPersonCardSyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { skipped: false, errorMessage: sessionError.message };
  }
  if (!sessionData.session?.user.id) {
    return { skipped: true, errorMessage: null };
  }

  initializeDatabase();
  const myselfId = getResolvedMyselfId();
  const friends = getAllFriends().filter((friend) => friend.id !== myselfId);
  for (const friend of friends) {
    const result = await upsertOwnedPersonCard(friend.id);
    if (result.errorMessage) {
      return result;
    }
  }
  return { skipped: friends.length === 0, errorMessage: null };
}
