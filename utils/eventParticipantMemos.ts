import type { EpisodeParticipant, Friend, ProfileMemo, ProfileMemoTag } from '@/types';
import { parseDateKey } from '@/utils/eventHelpers';
import { createProfileMemo } from '@/utils/profileMemos';

export type EventMemoDateRange = {
  startDateKey: string;
  endDateKey: string;
};

/** 終了日が無い、または開始より前なら、開始日だけの予定として扱う */
export function eventMemoDateRange(startDateKey: string, endDateKey: string): EventMemoDateRange {
  const start = startDateKey.trim();
  const end = endDateKey.trim();
  if (!start) {
    return { startDateKey: '', endDateKey: '' };
  }
  if (!end || end < start) {
    return { startDateKey: start, endDateKey: start };
  }
  return { startDateKey: start, endDateKey: end };
}

export function eventMemoDateEditable(range: EventMemoDateRange): boolean {
  return range.endDateKey > range.startDateKey;
}

export function clampEventMemoDate(date: string, range: EventMemoDateRange): string {
  if (!range.startDateKey) {
    return date.trim();
  }
  const value = date.trim();
  if (!value || value < range.startDateKey) {
    return range.startDateKey;
  }
  if (value > range.endDateKey) {
    return range.endDateKey;
  }
  return value;
}

export function eventMemoDateBounds(range: EventMemoDateRange): { minimumDate: Date; maximumDate: Date } {
  const minimumDate = parseDateKey(range.startDateKey);
  const maximumDate = parseDateKey(range.endDateKey || range.startDateKey);
  maximumDate.setHours(23, 59, 59, 999);
  return { minimumDate, maximumDate };
}

const isProfileMemoTag = (value: unknown): value is ProfileMemoTag =>
  value === 'habit' || value === 'says';

export function cloneProfileMemo(memo: ProfileMemo): ProfileMemo {
  const tag = (memo.tags ?? []).find(isProfileMemoTag);
  const eventId = memo.eventId?.trim() ?? '';
  return {
    id: memo.id,
    text: memo.text ?? '',
    date: typeof memo.date === 'string' ? memo.date : '',
    tags: tag ? [tag] : [],
    ...(eventId ? { eventId } : {}),
  };
}

/** 本文もタグも無い行。予定の日付だけ入っていても、まだ書いていない欄 */
export function isBlankMemo(memo: ProfileMemo): boolean {
  return memo.text.trim().length === 0 && memo.tags.length === 0;
}

export function eventLinkedMemos(notes: readonly ProfileMemo[], eventId: string): ProfileMemo[] {
  const id = eventId.trim();
  if (!id) {
    return [];
  }
  return savedProfileMemos(notes).filter((memo) => memo.eventId === id);
}

/**
 * 下書きから、この予定のメモと、まだ人物カードに無い新規行だけを残す。
 * 人物カードの既存メモが予定の下書きに混ざっていても戻さない。
 */
export function takeDraftEventMemos(
  draftRows: readonly ProfileMemo[],
  savedNotes: readonly ProfileMemo[],
  eventId: string
): ProfileMemo[] {
  const savedIds = new Set(savedNotes.map((memo) => memo.id));
  const id = eventId.trim();
  return draftRows.filter((row) => {
    const rowEventId = row.eventId?.trim() ?? '';
    if (rowEventId) {
      return id.length > 0 && rowEventId === id;
    }
    return !savedIds.has(row.id);
  });
}

/** 本文がある行だけ残す。人物カードへ書くときの形 */
export function savedProfileMemos(memos: readonly ProfileMemo[]): ProfileMemo[] {
  return memos
    .map((memo) => {
      const cloned = cloneProfileMemo(memo);
      return {
        ...cloned,
        text: cloned.text.trim(),
        date: cloned.date.trim(),
      };
    })
    .filter((memo) => memo.text.length > 0);
}

/** 下書きに残す行。空の末尾欄は含めない */
export function draftProfileMemos(memos: readonly ProfileMemo[]): ProfileMemo[] {
  return memos.filter((memo) => !isBlankMemo(memo)).map(cloneProfileMemo);
}

/**
 * 末尾は常に空欄。本文・日付・タグのどれかを入れると、その下に次の空欄が付く。
 * すでに末尾が空欄なら、その id を維持する。途中の行は空にしても残し、入力し直せる。
 */
export function withTrailingBlank(memos: readonly ProfileMemo[], defaultDate = ''): ProfileMemo[] {
  const rows = memos.map(cloneProfileMemo);
  const last = rows[rows.length - 1];
  if (last && isBlankMemo(last)) {
    if (!last.date.trim() && defaultDate) {
      last.date = defaultDate;
    }
    return rows;
  }
  return [...rows, createProfileMemo({ text: '', date: defaultDate })];
}

export function withTrailingBlankMemos(
  record: Record<string, ProfileMemo[]>,
  defaultDate = ''
): Record<string, ProfileMemo[]> {
  const next: Record<string, ProfileMemo[]> = {};
  for (const [friendId, rows] of Object.entries(record)) {
    next[friendId] = withTrailingBlank(rows, defaultDate);
  }
  return next;
}

export function profileMemosFromFriends(
  entries: readonly EpisodeParticipant[],
  friends: readonly Pick<Friend, 'id' | 'notes'>[],
  eventId: string
): Record<string, ProfileMemo[]> {
  const notesById = new Map(friends.map((friend) => [friend.id, friend.notes ?? []]));
  const record: Record<string, ProfileMemo[]> = {};
  for (const entry of entries) {
    if (entry.kind !== 'individual') {
      continue;
    }
    const friendId = entry.value.trim();
    if (!friendId || record[friendId]) {
      continue;
    }
    record[friendId] = eventLinkedMemos(notesById.get(friendId) ?? [], eventId);
  }
  return record;
}

export function memosRecordForEntries(
  entries: readonly EpisodeParticipant[],
  source: Record<string, ProfileMemo[]>,
  pick: (memos: ProfileMemo[]) => ProfileMemo[]
): Record<string, ProfileMemo[]> {
  const record: Record<string, ProfileMemo[]> = {};
  for (const entry of entries) {
    if (entry.kind !== 'individual') {
      continue;
    }
    const friendId = entry.value.trim();
    if (!friendId || record[friendId]) {
      continue;
    }
    record[friendId] = pick(source[friendId] ?? []);
  }
  return record;
}

export function eventMemoRowsEqual(left: readonly ProfileMemo[], right: readonly ProfileMemo[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((memo, index) => {
    const other = right[index];
    return (
      memo.id === other.id &&
      memo.text === other.text &&
      memo.date === other.date &&
      (memo.tags[0] ?? '') === (other.tags[0] ?? '') &&
      (memo.eventId ?? '') === (other.eventId ?? '')
    );
  });
}

export function profileMemosEqual(left: readonly ProfileMemo[], right: readonly ProfileMemo[]): boolean {
  const a = savedProfileMemos(left);
  const b = savedProfileMemos(right);
  if (a.length !== b.length) {
    return false;
  }
  return a.every((memo, index) => {
    const other = b[index];
    return (
      memo.id === other.id &&
      memo.text === other.text &&
      memo.date === other.date &&
      memo.tags[0] === other.tags[0] &&
      (memo.eventId ?? '') === (other.eventId ?? '')
    );
  });
}

/**
 * 予定画面で触っていないメモは、開いているあいだに人物カード側で増減したものも残す。
 * baseline にあった行を予定画面から消した場合だけ、人物カードからも外す。
 */
export function mergeParticipantMemos(
  current: readonly ProfileMemo[],
  baseline: readonly ProfileMemo[],
  edited: readonly ProfileMemo[]
): ProfileMemo[] {
  const baselineById = new Map(savedProfileMemos(baseline).map((memo) => [memo.id, memo]));
  const editedSaved = savedProfileMemos(edited);
  const editedById = new Map(editedSaved.map((memo) => [memo.id, memo]));
  const removed = new Set([...baselineById.keys()].filter((id) => !editedById.has(id)));
  const next: ProfileMemo[] = [];
  const seen = new Set<string>();

  for (const memo of current) {
    if (removed.has(memo.id)) {
      continue;
    }
    const formMemo = editedById.get(memo.id);
    if (!formMemo) {
      const kept = savedProfileMemos([memo])[0];
      if (kept) {
        next.push(kept);
        seen.add(kept.id);
      }
      continue;
    }
    const base = baselineById.get(memo.id);
    const formChanged = !base || !profileMemosEqual([base], [formMemo]);
    const unchanged = savedProfileMemos([memo])[0] ?? formMemo;
    next.push(formChanged ? formMemo : unchanged);
    seen.add(memo.id);
  }

  for (const memo of editedSaved) {
    if (!seen.has(memo.id)) {
      next.push(memo);
    }
  }
  return next;
}
