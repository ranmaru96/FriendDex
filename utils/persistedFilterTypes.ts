import type { EpisodeParticipantDraft } from '@/components/episode/types';
import type { FriendSearchFilters, MBTIType } from '@/types';

export type HomeFilterState = {
  name: string;
  affiliation1: string;
  affiliation2: string;
  birthMonth: string;
  mbti: string;
  experience: string;
};

export const DEFAULT_HOME_FILTER: HomeFilterState = {
  name: '',
  affiliation1: '',
  affiliation2: '',
  birthMonth: '',
  mbti: '',
  experience: '',
};

export type EpisodeListFilterState = {
  title: string;
  tag: string;
  participants: EpisodeParticipantDraft[];
  /** 共有一覧の共有元。未保存の古い絞り込みには無い。 */
  authorFriendId?: string;
};

export const DEFAULT_EPISODE_LIST_FILTER: EpisodeListFilterState = {
  title: '',
  tag: '',
  participants: [],
};

export type DetailEpisodeFilterState = {
  participantIds: string[];
  title: string;
};

export const DEFAULT_DETAIL_EPISODE_FILTER: DetailEpisodeFilterState = {
  participantIds: [],
  title: '',
};

const isString = (value: unknown): value is string => typeof value === 'string';

export function isHomeFilterState(value: unknown): value is HomeFilterState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<HomeFilterState>;
  return (
    isString(candidate.name) &&
    isString(candidate.affiliation1) &&
    isString(candidate.affiliation2) &&
    isString(candidate.birthMonth) &&
    isString(candidate.mbti) &&
    isString(candidate.experience)
  );
}

function isEpisodeParticipantDraft(value: unknown): value is EpisodeParticipantDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EpisodeParticipantDraft>;
  return (
    (candidate.participantType === 'individual' || candidate.participantType === 'group') &&
    isString(candidate.value)
  );
}

export function isEpisodeListFilterState(value: unknown): value is EpisodeListFilterState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EpisodeListFilterState>;
  return (
    isString(candidate.title) &&
    isString(candidate.tag) &&
    Array.isArray(candidate.participants) &&
    candidate.participants.every(isEpisodeParticipantDraft) &&
    (candidate.authorFriendId == null || isString(candidate.authorFriendId))
  );
}

export function isDetailEpisodeFilterState(value: unknown): value is DetailEpisodeFilterState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<DetailEpisodeFilterState>;
  return (
    Array.isArray(candidate.participantIds) &&
    candidate.participantIds.every(isString) &&
    isString(candidate.title)
  );
}

export function homeFilterToSearchFilters(filter: HomeFilterState): FriendSearchFilters {
  const next: FriendSearchFilters = {};
  if (filter.name.trim()) next.name = filter.name.trim();
  if (filter.affiliation1) next.affiliation1 = filter.affiliation1;
  if (filter.affiliation2) next.affiliation2 = filter.affiliation2;
  if (filter.birthMonth) next.birthMonth = Number(filter.birthMonth);
  if (filter.mbti) next.mbti = filter.mbti as MBTIType;
  if (filter.experience) next.experience = filter.experience;
  return next;
}
