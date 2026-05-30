import { Episode, EpisodeParticipant, EpisodeVisibilityMode } from '../types';

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

export function buildParticipantChips(
  episode: Episode,
  friendNameById: Map<string, string>
): { id: string; label: string; isMain: boolean }[] {
  const entries: EpisodeParticipant[] =
    episode.participantEntries && episode.participantEntries.length > 0
      ? episode.participantEntries
      : [
          ...episode.mainParticipants.map((id) => ({ kind: 'individual' as const, value: id, isMain: true })),
          ...episode.subParticipants.map((id) => ({ kind: 'individual' as const, value: id, isMain: false })),
        ];
  const unique = new Map<string, { id: string; label: string; isMain: boolean }>();
  entries.forEach((entry) => {
    if (!entry.value.trim()) return;
    const key = `${entry.kind}:${entry.value}`;
    if (!unique.has(key)) {
      unique.set(key, {
        id: key,
        label: entry.kind === 'group' ? entry.value : friendNameById.get(entry.value) ?? entry.value,
        isMain: true,
      });
    }
  });
  return Array.from(unique.values());
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
