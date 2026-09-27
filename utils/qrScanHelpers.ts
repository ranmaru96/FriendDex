import type { Friend, FriendInput, MBTIType } from '@/types';
import { resolvePersonNameParts } from '@/utils/personName';

export const QR_PUBLIC_FIELD_KEYS = [
  'name',
  'nickname',
  'birthday',
  'height',
  'weight',
  'origin',
  'residence',
  'mbti',
  'photo',
] as const;

export type QrPublicFieldKey = (typeof QR_PUBLIC_FIELD_KEYS)[number];

export type QrScanPayload = {
  userId: string;
  publicFields: string[];
  name?: string;
  familyName?: string;
  givenName?: string;
  nickname?: string;
  birthday?: string;
  height?: number | string | null;
  weight?: number | string | null;
  origin?: string;
  residence?: string;
  mbti?: string;
  photoUri?: string | null;
};

const isQrPublicFieldKey = (key: string): key is QrPublicFieldKey =>
  (QR_PUBLIC_FIELD_KEYS as readonly string[]).includes(key);

export const parseQrScanPayload = (data: string): QrScanPayload | null => {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (typeof parsed.userId !== 'string' || !Array.isArray(parsed.publicFields)) {
      return null;
    }
    const publicFields = parsed.publicFields.filter((item): item is string => typeof item === 'string');
    return {
      userId: parsed.userId.trim(),
      publicFields,
    };
  } catch {
    return null;
  }
};

const parsePayloadNumber = (value: number | string | null | undefined): number | null => {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const qrPayloadToFriendFields = (payload: QrScanPayload): Partial<FriendInput> => {
  const fields: Partial<FriendInput> = {};
  payload.publicFields.forEach((key) => {
    if (!isQrPublicFieldKey(key)) return;
    if (key === 'name' && (payload.name != null || payload.familyName != null || payload.givenName != null)) {
      const parts = resolvePersonNameParts(payload);
      fields.name = parts.name;
      fields.familyName = parts.familyName;
      fields.givenName = parts.givenName;
    }
    if (key === 'nickname' && payload.nickname != null) fields.nickname = payload.nickname;
    if (key === 'birthday' && payload.birthday != null) fields.birthday = payload.birthday;
    if (key === 'height' && payload.height != null) fields.height = parsePayloadNumber(payload.height);
    if (key === 'weight' && payload.weight != null) fields.weight = parsePayloadNumber(payload.weight);
    if (key === 'origin' && payload.origin != null) fields.origin = payload.origin;
    if (key === 'residence' && payload.residence != null) fields.residence = payload.residence;
    if (key === 'mbti' && payload.mbti != null) fields.mbti = payload.mbti as MBTIType;
    if (key === 'photo' && payload.photoUri != null) fields.photoUri = payload.photoUri;
  });
  return fields;
};

export const mergeFriendInputWithPublicFields = (
  existing: Friend,
  incoming: FriendInput,
  publicFields: string[]
): FriendInput => {
  const merged: FriendInput = {
    name: existing.name,
    familyName: existing.familyName,
    givenName: existing.givenName,
    nickname: existing.nickname,
    origin: existing.origin,
    residence: existing.residence,
    mbti: existing.mbti,
    birthday: existing.birthday,
    height: existing.height,
    weight: existing.weight,
    category: existing.category,
    description: existing.description,
    photoUri: existing.photoUri,
    affiliations: existing.affiliations,
    personalities: existing.personalities,
    experiences: existing.experiences,
    traits: existing.traits,
    notes: existing.notes,
    likes: existing.likes,
    dislikes: existing.dislikes,
    episodes: existing.episodes,
    sayings: existing.sayings,
  };

  publicFields.forEach((key) => {
    if (!isQrPublicFieldKey(key)) return;
    if (key === 'name') {
      const parts = resolvePersonNameParts(incoming);
      merged.name = parts.name;
      merged.familyName = parts.familyName;
      merged.givenName = parts.givenName;
    }
    if (key === 'nickname') merged.nickname = incoming.nickname;
    if (key === 'birthday') merged.birthday = incoming.birthday;
    if (key === 'height') merged.height = incoming.height;
    if (key === 'weight') merged.weight = incoming.weight;
    if (key === 'origin') merged.origin = incoming.origin;
    if (key === 'residence') merged.residence = incoming.residence;
    if (key === 'mbti') merged.mbti = incoming.mbti;
  });

  return merged;
};

export const QR_FIELD_LABELS: Record<QrPublicFieldKey, string> = {
  name: '名前',
  nickname: '通称・あだ名',
  birthday: '誕生日',
  height: '身長',
  weight: '体重',
  origin: '出身',
  residence: '居住地',
  mbti: 'MBTI',
  photo: '写真',
};

export const getPublicFieldLabels = (publicFields: string[]): string[] =>
  publicFields
    .filter(isQrPublicFieldKey)
    .map((key) => QR_FIELD_LABELS[key]);

/** サーバーの公開カードから、この QR が許可した項目だけ残す */
export const filterPayloadByPublicFields = (
  payload: QrScanPayload,
  allowedFields: string[]
): QrScanPayload => {
  const allowed = new Set(allowedFields.filter(isQrPublicFieldKey));
  return {
    userId: payload.userId,
    publicFields: [...allowed],
    name: allowed.has('name') ? payload.name : undefined,
    familyName: allowed.has('name') ? payload.familyName : undefined,
    givenName: allowed.has('name') ? payload.givenName : undefined,
    nickname: allowed.has('nickname') ? payload.nickname : undefined,
    birthday: allowed.has('birthday') ? payload.birthday : undefined,
    height: allowed.has('height') ? payload.height : undefined,
    weight: allowed.has('weight') ? payload.weight : undefined,
    origin: allowed.has('origin') ? payload.origin : undefined,
    residence: allowed.has('residence') ? payload.residence : undefined,
    mbti: allowed.has('mbti') ? payload.mbti : undefined,
    photoUri: allowed.has('photo') ? payload.photoUri : undefined,
  };
};

const getParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

export const qrPayloadDisplayName = (payload: QrScanPayload): string =>
  resolvePersonNameParts(payload).name;

export const qrPayloadToRouteParams = (payload: QrScanPayload): Record<string, string> => ({
  scannedUserId: payload.userId,
  publicFields: JSON.stringify(payload.publicFields),
});

export const routeParamsToQrPayload = (
  params: Record<string, string | string[] | undefined>
): QrScanPayload | null => {
  const userId = getParam(params.scannedUserId).trim();
  if (!userId) return null;
  const rawFields = getParam(params.publicFields).trim();
  if (!rawFields) {
    return { userId, publicFields: [] };
  }
  try {
    const parsed = JSON.parse(rawFields);
    const publicFields = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
    return {
      userId,
      publicFields,
    };
  } catch {
    return { userId, publicFields: [] };
  }
};

export const buildFriendInputFromQrPayload = (payload: QrScanPayload): FriendInput => {
  const fromQr = qrPayloadToFriendFields(payload);
  const nameParts = resolvePersonNameParts({
    familyName: fromQr.familyName,
    givenName: fromQr.givenName,
    name: fromQr.name,
  });
  return {
    name: nameParts.name,
    familyName: nameParts.familyName,
    givenName: nameParts.givenName,
    nickname: fromQr.nickname ?? '',
    origin: fromQr.origin ?? '',
    residence: fromQr.residence ?? '',
    mbti: (fromQr.mbti ?? '') as MBTIType,
    birthday: fromQr.birthday ?? '',
    height: fromQr.height ?? null,
    weight: fromQr.weight ?? null,
    category: '',
    description: '',
    photoUri: fromQr.photoUri ?? null,
    affiliations: [''],
    personalities: [''],
    experiences: [''],
    traits: [''],
    likes: [''],
    dislikes: [''],
    notes: [],
  };
};

export const namesLikelyMatch = (qrName: string | undefined, friendName: string): boolean => {
  const normalizedQr = (qrName ?? '').trim().toLowerCase();
  const normalizedFriend = friendName.trim().toLowerCase();
  if (!normalizedQr || !normalizedFriend) return false;
  return normalizedQr === normalizedFriend;
};

const longestCommonSubstringLength = (left: string, right: string): number => {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || !b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  let max = 0;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        const next = (dp[i - 1]?.[j - 1] ?? 0) + 1;
        const row = dp[i];
        if (row) {
          row[j] = next;
        }
        if (next > max) max = next;
      }
    }
  }
  return max;
};

const partMatchScore = (query: string, value: string): number => {
  const q = query.trim().toLowerCase();
  const v = value.trim().toLowerCase();
  if (!q || !v) return 0;
  if (q === v) return 100;
  if (v.includes(q) || q.includes(v)) return 40;
  return longestCommonSubstringLength(q, v);
};

/** 苗字・名前・通称の一致が多いほど高い。QR既存選択の並び用。 */
export const scoreFriendNameMatch = (
  query: {
    familyName?: string | null;
    givenName?: string | null;
    name?: string | null;
    nickname?: string | null;
  },
  friend: {
    familyName?: string | null;
    givenName?: string | null;
    name?: string | null;
    nickname?: string | null;
  }
): number => {
  const queryParts = resolvePersonNameParts(query);
  const friendParts = resolvePersonNameParts(friend);
  let score = 0;
  score += partMatchScore(queryParts.familyName, friendParts.familyName);
  score += partMatchScore(queryParts.givenName, friendParts.givenName);
  const queryNick = (query.nickname ?? '').trim();
  const friendNick = (friend.nickname ?? '').trim();
  score += partMatchScore(queryNick, friendNick);
  score += longestCommonSubstringLength(queryParts.name, friendParts.name);
  return score;
};

export const sortFriendsByQrNameMatch = <T extends Friend>(
  friends: readonly T[],
  query: {
    familyName?: string | null;
    givenName?: string | null;
    name?: string | null;
    nickname?: string | null;
  }
): T[] =>
  [...friends].sort((a, b) => {
    const delta = scoreFriendNameMatch(query, b) - scoreFriendNameMatch(query, a);
    if (delta !== 0) return delta;
    return a.name.localeCompare(b.name, 'ja', { sensitivity: 'base' });
  });

export const formatScannedAtLabel = (scannedAt: string): string => {
  if (!scannedAt.trim()) return '-';
  const date = new Date(scannedAt);
  if (Number.isNaN(date.getTime())) return '-';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
};
