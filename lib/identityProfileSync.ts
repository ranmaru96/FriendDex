import type { Profile } from '@/types';
import {
  getDefaultProfile,
  getResolvedMyselfId,
  initializeDatabase,
} from '@/db';
import { getSupabaseClient } from '@/lib/supabase';
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

type IdentityProfileRow = {
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

const parsePublicFields = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
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

  const { error: upsertError } = await supabase
    .from('identity_profiles')
    .upsert(profileToRow(profile, authUserId, nextVersion), { onConflict: 'id' });
  if (upsertError) {
    return { skipped: false, errorMessage: upsertError.message };
  }
  return { skipped: false, errorMessage: null };
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
      'id, display_name, family_name, given_name, nickname, birthday, height, weight, origin, residence, mbti, public_fields'
    )
    .eq('id', trimmed)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) {
    return { payload: null, skipped: false, errorMessage: readError.message };
  }
  if (!row?.id) {
    return { payload: null, skipped: true, errorMessage: null };
  }
  return { payload: rowToQrPayload(row), skipped: false, errorMessage: null };
}
