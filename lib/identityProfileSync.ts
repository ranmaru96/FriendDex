import type { Profile, Saying } from '@/types';
import {
  getDefaultProfile,
  getResolvedMyselfId,
  initializeDatabase,
} from '@/db';
import { getSupabaseClient } from '@/lib/supabase';
import { downloadIdentityPhoto, syncIdentityPhotoUpload } from '@/lib/identityPhotoStorage';
import { upsertOwnedPersonCard } from '@/lib/ownedPersonCardSync';
import type { QrScanPayload } from '@/utils/qrScanHelpers';

export type IdentityProfileUpsertResult = {
  skipped: boolean;
  errorMessage: string | null;
};

export type ClaimIdentityProfileResult = {
  payload: QrScanPayload | null;
  skipped: boolean;
  errorMessage: string | null;
};

const AUTH_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IdentitySayingRow = {
  id: string;
  text: string;
  date: string;
};

type IdentityProfilePublicRow = {
  id: string;
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
  public_fields: string[];
  updated_at: string;
  deleted_at: null;
  sync_version: number;
};

type IdentityProfileRow = IdentityProfilePublicRow & {
  category: string;
  description: string;
  affiliations: string[];
  personalities: string[];
  experiences: string[];
  traits: string[];
  notes: string[];
  likes: string[];
  dislikes: string[];
  sayings: IdentitySayingRow[];
  local_friend_id: string;
};

const toStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toSayingRows = (value: Saying[] | undefined): IdentitySayingRow[] => {
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

const toPublicRow = (row: IdentityProfileRow): IdentityProfilePublicRow => ({
  id: row.id,
  display_name: row.display_name,
  family_name: row.family_name,
  given_name: row.given_name,
  nickname: row.nickname,
  birthday: row.birthday,
  height: row.height,
  weight: row.weight,
  origin: row.origin,
  residence: row.residence,
  mbti: row.mbti,
  public_fields: row.public_fields,
  updated_at: row.updated_at,
  deleted_at: row.deleted_at,
  sync_version: row.sync_version,
});

const isUnknownColumnError = (message: string): boolean =>
  /schema cache/i.test(message) || /could not find the/i.test(message) || /does not exist/i.test(message);

const parsePublicFields = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string') {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // postgres text[] の {name,photo} 形式
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((part) => part.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  return [];
};

const readPhotoPath = (row: Record<string, unknown>): string => {
  const value = row.photo_path;
  return typeof value === 'string' ? value.trim() : '';
};

const rowToQrPayload = (row: {
  id: string;
  display_name: string | null;
  family_name: string | null;
  given_name: string | null;
  nickname: string | null;
  birthday: string | null;
  height: number | null;
  weight: number | null;
  origin: string | null;
  residence: string | null;
  mbti: string | null;
  public_fields: unknown;
  photoUri?: string | null;
}): QrScanPayload => ({
  userId: row.id,
  publicFields: parsePublicFields(row.public_fields),
  name: row.display_name?.trim() || undefined,
  familyName: row.family_name?.trim() || undefined,
  givenName: row.given_name?.trim() || undefined,
  nickname: row.nickname?.trim() || undefined,
  birthday: row.birthday?.trim() || undefined,
  height: row.height,
  weight: row.weight,
  origin: row.origin?.trim() || undefined,
  residence: row.residence?.trim() || undefined,
  mbti: row.mbti?.trim() || undefined,
  photoUri: row.photoUri?.trim() || undefined,
});

const toOptionalInt = (value: number | null | undefined): number | null => {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
};

const profileToRow = (profile: Profile, authUserId: string, syncVersion: number): IdentityProfileRow => ({
  id: authUserId,
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
  public_fields: Array.isArray(profile.publicFields) ? profile.publicFields : [],
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
  local_friend_id: profile.friendId,
  updated_at: new Date().toISOString(),
  deleted_at: null,
  sync_version: syncVersion,
});

/** ログイン中なら本人カードを identity_profiles に upsert。失敗しても例外は投げない */
export async function upsertMyselfIdentityProfile(): Promise<IdentityProfileUpsertResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { skipped: false, errorMessage: sessionError.message };
  }
  const authUserId = sessionData.session?.user.id?.trim() ?? '';
  if (!authUserId) {
    return { skipped: true, errorMessage: null };
  }

  initializeDatabase();
  const myselfId = getResolvedMyselfId();
  if (!myselfId) {
    return { skipped: true, errorMessage: null };
  }
  const profile = getDefaultProfile(myselfId);
  if (!profile) {
    return { skipped: true, errorMessage: null };
  }

  const { data: existing, error: readError } = await supabase
    .from('identity_profiles')
    .select('sync_version')
    .eq('id', authUserId)
    .maybeSingle();
  if (readError) {
    return { skipped: false, errorMessage: readError.message };
  }
  const nextVersion =
    typeof existing?.sync_version === 'number' && Number.isFinite(existing.sync_version)
      ? Math.floor(existing.sync_version) + 1
      : 1;

  const row = profileToRow(profile, authUserId, nextVersion);
  const { error: upsertError } = await supabase
    .from('identity_profiles')
    .upsert(row, { onConflict: 'id' });
  if (upsertError) {
    if (!isUnknownColumnError(upsertError.message)) {
      return { skipped: false, errorMessage: upsertError.message };
    }
    const { error: fallbackError } = await supabase
      .from('identity_profiles')
      .upsert(toPublicRow(row), { onConflict: 'id' });
    if (fallbackError) {
      return { skipped: false, errorMessage: fallbackError.message };
    }
  }

  const photoPath = await syncIdentityPhotoUpload(
    supabase,
    authUserId,
    profile.photoUri
  );
  const { error: photoUpdateError } = await supabase
    .from('identity_profiles')
    .update({ photo_path: photoPath })
    .eq('id', authUserId);
  if (photoUpdateError) {
    // 列未作成や Storage 失敗でも文字項目は載っている
    return { skipped: false, errorMessage: null };
  }
  return { skipped: false, errorMessage: null };
}

/** 対象が本人カードのときだけサーバーへ送る。他人のカードでは何もしない */
export async function syncMyselfIdentityProfileIfNeeded(
  friendId?: string | null
): Promise<IdentityProfileUpsertResult> {
  initializeDatabase();
  const myselfId = getResolvedMyselfId();
  if (!myselfId) {
    return { skipped: true, errorMessage: null };
  }
  const trimmed = friendId?.trim() ?? '';
  if (trimmed && trimmed !== myselfId) {
    return { skipped: true, errorMessage: null };
  }
  return upsertMyselfIdentityProfile();
}

/** 本人なら identity_profiles、他人なら owned_person_cards */
export async function syncFriendProfileToServer(
  friendId: string
): Promise<IdentityProfileUpsertResult> {
  initializeDatabase();
  const trimmed = friendId.trim();
  if (!trimmed) {
    return { skipped: true, errorMessage: null };
  }
  const myselfId = getResolvedMyselfId();
  if (myselfId && trimmed === myselfId) {
    return upsertMyselfIdentityProfile();
  }
  return upsertOwnedPersonCard(trimmed);
}

export function scheduleFriendProfileSync(friendId: string): void {
  void syncFriendProfileToServer(friendId).then((result) => {
    if (result.errorMessage) {
      console.warn('friend profile sync failed', result.errorMessage);
    }
  });
}

/** ログイン中なら grant を作り、相手の公開カードを取る。失敗時は payload null（呼び出し側が QR 埋め込み値へ戻す） */
export async function claimAndFetchIdentityProfile(
  targetUserId: string
): Promise<ClaimIdentityProfileResult> {
  const trimmed = targetUserId.trim();
  if (!trimmed || !AUTH_USER_ID_RE.test(trimmed)) {
    return { payload: null, skipped: true, errorMessage: null };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { payload: null, skipped: true, errorMessage: null };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { payload: null, skipped: false, errorMessage: sessionError.message };
  }
  const authUserId = sessionData.session?.user.id?.trim() ?? '';
  if (!authUserId) {
    return { payload: null, skipped: true, errorMessage: null };
  }
  if (authUserId === trimmed) {
    return { payload: null, skipped: true, errorMessage: null };
  }

  const { error: claimError } = await supabase.rpc('claim_identity_profile', {
    target_id: trimmed,
  });
  if (claimError) {
    return { payload: null, skipped: false, errorMessage: claimError.message };
  }

  const { data: row, error: readError } = await supabase
    .from('identity_profiles')
    .select(
      'id, display_name, family_name, given_name, nickname, birthday, height, weight, origin, residence, mbti, public_fields, photo_path'
    )
    .eq('id', trimmed)
    .is('deleted_at', null)
    .maybeSingle();
  const fallback = readError
    ? await supabase
        .from('identity_profiles')
        .select(
          'id, display_name, family_name, given_name, nickname, birthday, height, weight, origin, residence, mbti, public_fields'
        )
        .eq('id', trimmed)
        .is('deleted_at', null)
        .maybeSingle()
    : null;
  const resolved = readError ? fallback : { data: row, error: readError };
  if (!resolved || resolved.error) {
    return { payload: null, skipped: false, errorMessage: resolved?.error?.message ?? readError.message };
  }
  if (!resolved.data?.id) {
    return { payload: null, skipped: true, errorMessage: null };
  }
  const publicFields = parsePublicFields(resolved.data.public_fields);
  let photoUri: string | undefined;
  const photoPath = readPhotoPath(resolved.data as Record<string, unknown>);
  if (publicFields.includes('photo') && photoPath) {
    photoUri = (await downloadIdentityPhoto(supabase, photoPath)) ?? undefined;
  }
  return {
    payload: rowToQrPayload({ ...resolved.data, photoUri }),
    skipped: false,
    errorMessage: null,
  };
}
