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
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      familyName: typeof parsed.familyName === 'string' ? parsed.familyName : undefined,
      givenName: typeof parsed.givenName === 'string' ? parsed.givenName : undefined,
      nickname: typeof parsed.nickname === 'string' ? parsed.nickname : undefined,
      birthday: typeof parsed.birthday === 'string' ? parsed.birthday : undefined,
      height:
        typeof parsed.height === 'number' || typeof parsed.height === 'string' ? parsed.height : undefined,
      weight:
        typeof parsed.weight === 'number' || typeof parsed.weight === 'string' ? parsed.weight : undefined,
      origin: typeof parsed.origin === 'string' ? parsed.origin : undefined,
      residence: typeof parsed.residence === 'string' ? parsed.residence : undefined,
      mbti: typeof parsed.mbti === 'string' ? parsed.mbti : undefined,
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
};

export const getPublicFieldLabels = (publicFields: string[]): string[] =>
  publicFields
    .filter(isQrPublicFieldKey)
    .map((key) => QR_FIELD_LABELS[key]);

const getParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

export const qrPayloadDisplayName = (payload: QrScanPayload): string =>
  resolvePersonNameParts(payload).name;

export const qrPayloadToRouteParams = (payload: QrScanPayload): Record<string, string> => ({
  scannedUserId: payload.userId,
  publicFields: JSON.stringify(payload.publicFields),
  name: payload.name ?? '',
  familyName: payload.familyName ?? '',
  givenName: payload.givenName ?? '',
  hasSplitName: payload.familyName != null || payload.givenName != null ? '1' : '0',
  nickname: payload.nickname ?? '',
  birthday: payload.birthday ?? '',
  height: payload.height?.toString() ?? '',
  weight: payload.weight?.toString() ?? '',
  origin: payload.origin ?? '',
  residence: payload.residence ?? '',
  mbti: payload.mbti ?? '',
});

export const routeParamsToQrPayload = (
  params: Record<string, string | string[] | undefined>
): QrScanPayload | null => {
  const userId = getParam(params.scannedUserId).trim();
  if (!userId) return null;
  try {
    const parsed = JSON.parse(getParam(params.publicFields));
    const publicFields = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
    return {
      userId,
      publicFields,
      name: getParam(params.name) || undefined,
      familyName: getParam(params.hasSplitName) === '1' ? getParam(params.familyName) : undefined,
      givenName: getParam(params.hasSplitName) === '1' ? getParam(params.givenName) : undefined,
      nickname: getParam(params.nickname) || undefined,
      birthday: getParam(params.birthday) || undefined,
      height: getParam(params.height) || undefined,
      weight: getParam(params.weight) || undefined,
      origin: getParam(params.origin) || undefined,
      residence: getParam(params.residence) || undefined,
      mbti: getParam(params.mbti) || undefined,
    };
  } catch {
    return null;
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
    photoUri: null,
    affiliations: [''],
    personalities: [''],
    experiences: [''],
    traits: [''],
    likes: [''],
    dislikes: [''],
  };
};

export const namesLikelyMatch = (qrName: string | undefined, friendName: string): boolean => {
  const normalizedQr = (qrName ?? '').trim().toLowerCase();
  const normalizedFriend = friendName.trim().toLowerCase();
  if (!normalizedQr || !normalizedFriend) return false;
  return normalizedQr === normalizedFriend;
};

export const formatScannedAtLabel = (scannedAt: string): string => {
  if (!scannedAt.trim()) return '-';
  const date = new Date(scannedAt);
  if (Number.isNaN(date.getTime())) return '-';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
};
