import type { EpisodeVisibilityMode } from '@/types';

export type Option = { label: string; value: string };

export type EpisodeParticipantDraft = {
  participantType: 'individual' | 'group';
  value: string;
};

export type EpisodeVisibilityDraft = {
  kind: 'individual' | 'group';
  value: string;
};

export const VISIBILITY_MODE_OPTIONS: Option[] = [
  { label: '公開', value: 'public' },
  { label: '限定公開', value: 'limited' },
  { label: '非公開', value: 'private' },
];

export const formatEpisodeDateToYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseEpisodeDateString = (s: string): Date => {
  const parts = s.split('-').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
};

export function isEpisodeVisibilityMode(value: string): value is EpisodeVisibilityMode {
  return value === 'public' || value === 'limited' || value === 'private';
}
