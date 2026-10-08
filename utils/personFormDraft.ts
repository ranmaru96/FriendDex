import { deleteFormDraft, readFormDraftRecord } from '@/utils/formDraftStore';
import type { Friend, FriendInput, ProfileMemo } from '@/types';

const NEW_KEY = 'draft.person.new';

export type PersonFormDraft = {
  name: string;
  familyName: string;
  givenName: string;
  nickname: string;
  origin: string;
  residence: string;
  mbti: string;
  birthday: string;
  height: number | null;
  weight: number | null;
  category: string;
  description: string;
  photoUri: string | null;
  affiliations: string[];
  personalities: string[];
  experiences: string[];
  traits: string[];
  notes: ProfileMemo[];
  likes: string[];
  dislikes: string[];
};

export function personDraftKey(friendId: string | null): string {
  return friendId ? `draft.person.${friendId}` : NEW_KEY;
}

export function personFieldsFromInput(form: FriendInput): PersonFormDraft {
  return {
    name: form.name ?? '',
    familyName: form.familyName ?? '',
    givenName: form.givenName ?? '',
    nickname: form.nickname ?? '',
    origin: form.origin ?? '',
    residence: form.residence ?? '',
    mbti: form.mbti ?? '',
    birthday: form.birthday ?? '',
    height: form.height ?? null,
    weight: form.weight ?? null,
    category: form.category ?? '',
    description: form.description ?? '',
    photoUri: form.photoUri ?? null,
    affiliations: form.affiliations ?? [],
    personalities: form.personalities ?? [],
    experiences: form.experiences ?? [],
    traits: form.traits ?? [],
    notes: form.notes ?? [],
    likes: form.likes ?? [],
    dislikes: form.dislikes ?? [],
  };
}

export function serializePersonForm(form: FriendInput): string {
  return JSON.stringify(personFieldsFromInput(form));
}

export function serializePersonFriend(friend: Friend): string {
  return serializePersonForm({
    name: friend.name,
    familyName: friend.familyName,
    givenName: friend.givenName,
    nickname: friend.nickname,
    origin: friend.origin,
    residence: friend.residence,
    mbti: friend.mbti,
    birthday: friend.birthday,
    height: friend.height,
    weight: friend.weight,
    category: friend.category,
    description: friend.description,
    photoUri: friend.photoUri,
    affiliations: friend.affiliations,
    personalities: friend.personalities,
    experiences: friend.experiences,
    traits: friend.traits,
    notes: friend.notes ?? [],
    likes: friend.likes,
    dislikes: friend.dislikes,
  });
}

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isNotes = (value: unknown): value is ProfileMemo[] =>
  Array.isArray(value) &&
  value.every((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const note = item as Partial<ProfileMemo>;
    return typeof note.id === 'string' && typeof note.text === 'string' && typeof note.date === 'string' && isStrings(note.tags);
  });

export function parsePersonFormDraft(raw: string): PersonFormDraft | null {
  try {
    const value = JSON.parse(raw) as Partial<PersonFormDraft>;
    if (
      typeof value.name !== 'string' ||
      typeof value.familyName !== 'string' ||
      typeof value.givenName !== 'string' ||
      typeof value.nickname !== 'string' ||
      typeof value.origin !== 'string' ||
      typeof value.residence !== 'string' ||
      typeof value.mbti !== 'string' ||
      typeof value.birthday !== 'string' ||
      (value.height !== null && typeof value.height !== 'number') ||
      (value.weight !== null && typeof value.weight !== 'number') ||
      typeof value.category !== 'string' ||
      typeof value.description !== 'string' ||
      (value.photoUri !== null && typeof value.photoUri !== 'string') ||
      !isStrings(value.affiliations) ||
      !isStrings(value.personalities) ||
      !isStrings(value.experiences) ||
      !isStrings(value.traits) ||
      !isNotes(value.notes) ||
      !isStrings(value.likes) ||
      !isStrings(value.dislikes)
    ) {
      return null;
    }
    return personFieldsFromInput(value as FriendInput);
  } catch {
    return null;
  }
}

export function readPersonFormDraft(friendId: string | null): { base: string; fields: PersonFormDraft } | null {
  const record = readFormDraftRecord(personDraftKey(friendId));
  if (!record) {
    return null;
  }
  const fields = parsePersonFormDraft(record.fields);
  if (!fields) {
    deleteFormDraft(personDraftKey(friendId));
    return null;
  }
  return { base: record.base, fields };
}

export function deletePersonFormDraft(friendId: string | null): void {
  deleteFormDraft(personDraftKey(friendId));
}
