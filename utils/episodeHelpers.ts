import { Episode, EpisodeParticipant } from '../types';

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
    if (!unique.has(key) || entry.isMain) {
      unique.set(key, {
        id: key,
        label: entry.kind === 'group' ? entry.value : friendNameById.get(entry.value) ?? entry.value,
        isMain: entry.isMain,
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
