import { Episode, EpisodeParticipant, EpisodeVisibilityMode } from '../types';

export type ParticipantChipDisplay = {
  id: string;
  kind: 'individual' | 'group';
  label: string;
  friendId?: string;
  photoUri?: string | null;
};

export const normalizeEpisodeTag = (value: string | null | undefined): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
};

/** HH:mm。不正・空は null */
export const normalizeEpisodeTime = (value: string | null | undefined): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const formatEpisodeDateForCard = (date: string): string => {
  if (!date.trim()) return '-';
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '-';
  return date.replace(/-/g, '/');
};

/** 詳細用: 日付＋任意時刻（カード一覧では使わない） */
export const formatEpisodeDateTimeForDetail = (
  date: string,
  time?: string | null
): string => {
  const dateLabel = formatEpisodeDateForCard(date);
  const normalizedTime = normalizeEpisodeTime(time);
  return normalizedTime ? `${dateLabel} ${normalizedTime}` : dateLabel;
};

/**
 * 一覧ソート: 日付新しい順 → 同日は時刻ありを遅い順 → 時刻なしは同日の末尾。
 */
export const compareEpisodesByEventDateTime = (a: Episode, b: Episode): number => {
  const dateCmp = b.date.localeCompare(a.date);
  if (dateCmp !== 0) {
    return dateCmp;
  }
  const aTime = normalizeEpisodeTime(a.time) ?? '';
  const bTime = normalizeEpisodeTime(b.time) ?? '';
  if (aTime && bTime) {
    return bTime.localeCompare(aTime);
  }
  if (aTime && !bTime) {
    return -1;
  }
  if (!aTime && bTime) {
    return 1;
  }
  return b.id.localeCompare(a.id);
};

/** update/delete に渡す author（公開者）の friend ID */
export function resolveEpisodeRecordOwnerId(episode: Episode, profileFriendId: string): string {
  const author = episode.authorFriendId.trim();
  return author || profileFriendId;
}

/** 編集・削除可能か（自分が公開したエピソードのみ） */
export function canManageEpisode(
  episode: Episode,
  _profileFriendId: string,
  myselfId: string | null
): boolean {
  if (myselfId === null) {
    return false;
  }
  return episode.authorFriendId.trim() === myselfId;
}

/** 予定・エピソードの対象者は「一緒にいた他者」。本人の個人エントリは含めない。 */
export function excludeSelfIndividualEntries<T extends { kind: string; value: string }>(
  entries: T[],
  myselfId: string | null | undefined
): T[] {
  const id = myselfId?.trim() ?? '';
  if (!id) {
    return entries;
  }
  return entries.filter((entry) => !(entry.kind === 'individual' && entry.value.trim() === id));
}

export function friendsExcludingSelf<T extends { id: string }>(
  friends: T[],
  myselfId: string | null | undefined
): T[] {
  const id = myselfId?.trim() ?? '';
  if (!id) {
    return friends;
  }
  return friends.filter((friend) => friend.id !== id);
}

export function mergeParticipantEntries(...lists: EpisodeParticipant[][]): EpisodeParticipant[] {
  const seen = new Set<string>();
  const merged: EpisodeParticipant[] = [];
  lists.forEach((list) => {
    list.forEach((entry) => {
      const value = entry.value.trim();
      if (!value) {
        return;
      }
      const key = `${entry.kind}:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ kind: entry.kind, value });
      }
    });
  });
  return merged;
}

/**
 * Build individual-only participant entries from friend IDs.
 * Group-name tags are deferred (see settings 今後の構想); EpisodeParticipant.kind
 * still supports 'group' in the type for a future revival.
 */
export function toIndividualParticipantEntries(friendIds: Iterable<string>): EpisodeParticipant[] {
  const seen = new Set<string>();
  const next: EpisodeParticipant[] = [];
  for (const friendId of friendIds) {
    const value = friendId.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push({ kind: 'individual', value });
  }
  return next;
}

export function getVisibilityModeLabel(mode: EpisodeVisibilityMode): string {
  switch (mode) {
    case 'public':
      return '公開';
    case 'limited':
      return '限定公開';
    case 'private':
      return '非公開';
  }
}

export function getVisibilityModeIconName(
  mode: EpisodeVisibilityMode
): 'lock-closed-outline' | 'globe-outline' | 'people-outline' {
  switch (mode) {
    case 'public':
      return 'globe-outline';
    case 'limited':
      return 'people-outline';
    case 'private':
      return 'lock-closed-outline';
  }
}

export function getVisibilityModeIconColor(mode: EpisodeVisibilityMode): string {
  switch (mode) {
    case 'public':
      return '#2a9d5a';
    case 'limited':
      return '#7c5cbf';
    case 'private':
      return '#94a3b8';
  }
}

export function buildParticipantChipDisplays(
  entries: Array<{ kind: 'individual' | 'group'; value: string }>,
  friendNameById: Map<string, string>,
  options?: {
    excludeFriendIds?: string[];
    friendPhotoById?: Map<string, string | null>;
  }
): ParticipantChipDisplay[] {
  const excluded = new Set(
    (options?.excludeFriendIds ?? []).map((id) => id.trim()).filter((id) => id.length > 0)
  );
  const unique = new Map<string, ParticipantChipDisplay>();
  entries.forEach((entry) => {
    const value = entry.value.trim();
    if (!value) {
      return;
    }
    if (entry.kind === 'individual' && excluded.has(value)) {
      return;
    }
    const key = `${entry.kind}:${value}`;
    if (unique.has(key)) {
      return;
    }
    if (entry.kind === 'group') {
      unique.set(key, { id: key, kind: 'group', label: value });
      return;
    }
    if (!friendNameById.has(value)) {
      return;
    }
    unique.set(key, {
      id: key,
      kind: 'individual',
      label: friendNameById.get(value) ?? '',
      friendId: value,
      photoUri: options?.friendPhotoById?.get(value) ?? null,
    });
  });
  return Array.from(unique.values());
}

/** db.ts の incoming: と同じ。循環参照を避けるためこちらでは文字列だけ見る。 */
const isIncomingSharedEpisodeId = (episodeId: string): boolean => {
  const trimmed = episodeId.trim();
  return trimmed.startsWith('incoming:') && trimmed.length > 'incoming:'.length;
};

/** 共有エピソードの参加者は相手の表示名。写真も頭文字も付けない。 */
function buildIncomingParticipantNameChips(
  entries: Array<{ kind: 'individual' | 'group'; value: string }>
): ParticipantChipDisplay[] {
  const unique = new Map<string, ParticipantChipDisplay>();
  entries.forEach((entry) => {
    if (entry.kind !== 'individual') {
      return;
    }
    const label = entry.value.trim();
    if (!label || unique.has(label)) {
      return;
    }
    unique.set(label, {
      id: `name:${label}`,
      kind: 'individual',
      label,
    });
  });
  return Array.from(unique.values());
}

export function buildParticipantChips(
  episode: Episode,
  friendNameById: Map<string, string>,
  options?: {
    excludeFriendIds?: string[];
    friendPhotoById?: Map<string, string | null>;
  }
): ParticipantChipDisplay[] {
  if (isIncomingSharedEpisodeId(episode.id)) {
    return buildIncomingParticipantNameChips(episode.participantEntries ?? []);
  }
  return buildParticipantChipDisplays(episode.participantEntries ?? [], friendNameById, options);
}

export function visibilityDisplayLabels(episode: Episode, friendNameById: Map<string, string>): string[] {
  const labels: string[] = [];
  (episode.visibilityEntries ?? []).forEach((entry) => {
    const value = entry.value.trim();
    if (!value) {
      return;
    }
    if (entry.kind === 'group') {
      labels.push(value);
      return;
    }
    if (!friendNameById.has(value)) {
      return;
    }
    labels.push(friendNameById.get(value) ?? '');
  });
  return labels;
}

export function visibilityModeTagStyles(mode: EpisodeVisibilityMode): {
  tag: object;
  text: object;
} {
  switch (mode) {
    case 'public':
      return {
        tag: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
        text: { color: '#166534' },
      };
    case 'limited':
      return {
        tag: { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' },
        text: { color: '#0c4a6e' },
      };
    case 'private':
      return {
        tag: { backgroundColor: '#f1f5f9', borderColor: '#94a3b8' },
        text: { color: '#475569' },
      };
  }
}
