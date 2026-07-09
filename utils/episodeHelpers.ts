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

export const formatEpisodeDateForCard = (date: string): string => {
  if (!date.trim()) return '-';
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '-';
  return date.replace(/-/g, '/');
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
    unique.set(key, {
      id: key,
      kind: 'individual',
      label: friendNameById.get(value) ?? value,
      friendId: value,
      photoUri: options?.friendPhotoById?.get(value) ?? null,
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
  return buildParticipantChipDisplays(episode.participantEntries ?? [], friendNameById, options);
}

export function visibilityDisplayLabels(episode: Episode, friendNameById: Map<string, string>): string[] {
  return (episode.visibilityEntries ?? []).map((e) =>
    e.kind === 'group' ? e.value : friendNameById.get(e.value) ?? e.value
  );
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
