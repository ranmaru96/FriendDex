import { v4 as uuidv4 } from 'uuid';
import type { ProfileMemo, ProfileMemoTag, Saying } from '@/types';

export const PROFILE_MEMO_TAG_LABEL: Record<ProfileMemoTag, string> = {
  habit: '習性',
  says: '彼曰く',
};

const isProfileMemoTag = (value: unknown): value is ProfileMemoTag =>
  value === 'habit' || value === 'says';

const sanitizeMemo = (value: ProfileMemo): ProfileMemo => {
  const tags: ProfileMemoTag[] = [];
  for (const tag of value.tags ?? []) {
    if (isProfileMemoTag(tag)) {
      tags.push(tag);
      break;
    }
  }
  return {
    id: value.id,
    text: value.text,
    date: typeof value.date === 'string' ? value.date : '',
    tags,
  };
};

const isProfileMemo = (value: unknown): value is ProfileMemo => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ProfileMemo>;
  return typeof candidate.id === 'string' && typeof candidate.text === 'string';
};

export const countHabitSayingMemos = (memos: readonly ProfileMemo[] | null | undefined): number =>
  (memos ?? []).filter((memo) => memo.tags.includes('habit') || memo.tags.includes('says')).length;

export const createProfileMemo = (input: {
  text: string;
  date?: string;
  tags?: readonly ProfileMemoTag[];
}): ProfileMemo =>
  sanitizeMemo({
    id: uuidv4(),
    text: input.text.trim(),
    date: (input.date ?? '').trim(),
    tags: [...(input.tags ?? [])],
  });

/**
 * notes 列がオブジェクトならそれを使い、文字列配列なら習性・彼曰くと合わせてメモにする。
 * オブジェクト済みの notes に残った traits / sayings は混ぜない（changed で列を空にするためだけ）。
 */
export const foldProfileMemos = (input: {
  notesRaw: string | null | undefined;
  traits: readonly string[];
  sayings: readonly Saying[];
}): { memos: ProfileMemo[]; changed: boolean } => {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(input.notesRaw ?? '[]');
  } catch {
    parsed = [];
  }

  const traitTexts = input.traits.map((item) => item.trim()).filter((item) => item.length > 0);
  const sayingRows = input.sayings
    .map((item) => ({
      id: item.id,
      text: item.text.trim(),
      date: (item.date ?? '').trim(),
    }))
    .filter((item) => item.text.length > 0);
  const hasLegacyColumns = traitTexts.length > 0 || sayingRows.length > 0;

  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isProfileMemo)) {
    return {
      memos: parsed.map((item) => sanitizeMemo(item)),
      changed: hasLegacyColumns,
    };
  }

  const texts = Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  if (texts.length === 0 && !hasLegacyColumns) {
    return { memos: [], changed: false };
  }

  return {
    memos: [
      ...texts.map((text) => createProfileMemo({ text, tags: [] })),
      ...traitTexts.map((text) => createProfileMemo({ text, tags: ['habit'] })),
      ...sayingRows.map((item) =>
        sanitizeMemo({
          id: item.id || uuidv4(),
          text: item.text,
          date: item.date,
          tags: ['says'],
        })
      ),
    ],
    changed: true,
  };
};

export const readStoredProfileMemos = (notesRaw: string | null | undefined): ProfileMemo[] =>
  foldProfileMemos({ notesRaw, traits: [], sayings: [] }).memos;
