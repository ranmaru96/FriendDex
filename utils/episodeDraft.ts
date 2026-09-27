import type { EpisodeParticipantDraft, EpisodeVisibilityDraft } from '@/components/episode/types';
import { deleteAppSetting, getAppSetting, initializeDatabase, setAppSetting } from '@/db';
import type { EpisodeVisibilityMode } from '@/types';
import { deletePersistedImages } from '@/utils/persistImageFile';

const NEW_DRAFT_KEY = 'draft.episode.new';
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type EpisodeDraft = {
  title: string;
  date: string;
  time: string;
  description: string;
  /** 下書きを取り始めた時点の、保存済み説明。詳細画面で説明が変わっていたら使わない。 */
  baseDescription: string;
  participants: EpisodeParticipantDraft[];
  visibilityMode: EpisodeVisibilityMode;
  visibility: EpisodeVisibilityDraft[];
  tag: string;
  eventLinkMode: 'none' | 'existing' | 'create_new';
  linkedEventId: string | null;
  newPhotoUris: string[];
  deletedPhotoIds: number[];
  editingEpisodeId: string | null;
  savedAt: number;
};

const isString = (value: unknown): value is string => typeof value === 'string';

const isParticipant = (value: unknown): value is EpisodeParticipantDraft => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EpisodeParticipantDraft>;
  return (
    (candidate.participantType === 'individual' || candidate.participantType === 'group') &&
    isString(candidate.value)
  );
};

const isVisibility = (value: unknown): value is EpisodeVisibilityDraft => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EpisodeVisibilityDraft>;
  return (candidate.kind === 'individual' || candidate.kind === 'group') && isString(candidate.value);
};

export const isEpisodeDraft = (value: unknown): value is EpisodeDraft => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<EpisodeDraft>;
  return (
    isString(candidate.title) &&
    isString(candidate.date) &&
    isString(candidate.time) &&
    isString(candidate.description) &&
    isString(candidate.baseDescription) &&
    Array.isArray(candidate.participants) &&
    candidate.participants.every(isParticipant) &&
    (candidate.visibilityMode === 'public' ||
      candidate.visibilityMode === 'limited' ||
      candidate.visibilityMode === 'private') &&
    Array.isArray(candidate.visibility) &&
    candidate.visibility.every(isVisibility) &&
    isString(candidate.tag) &&
    (candidate.eventLinkMode === 'none' ||
      candidate.eventLinkMode === 'existing' ||
      candidate.eventLinkMode === 'create_new') &&
    (candidate.linkedEventId === null || isString(candidate.linkedEventId)) &&
    Array.isArray(candidate.newPhotoUris) &&
    candidate.newPhotoUris.every(isString) &&
    Array.isArray(candidate.deletedPhotoIds) &&
    candidate.deletedPhotoIds.every((id) => typeof id === 'number' && Number.isFinite(id)) &&
    (candidate.editingEpisodeId === null || isString(candidate.editingEpisodeId)) &&
    typeof candidate.savedAt === 'number' &&
    Number.isFinite(candidate.savedAt)
  );
};

export const episodeDraftKey = (episodeId: string | null): string =>
  episodeId ? `draft.episode.${episodeId}` : NEW_DRAFT_KEY;

const dropDraftRecord = (episodeId: string | null) => {
  initializeDatabase();
  deleteAppSetting(episodeDraftKey(episodeId));
};

const dropDraftPhotos = (uris: string[]) => {
  deletePersistedImages(uris);
};

export const deleteEpisodeDraft = (episodeId: string | null, photoUris: string[] = []) => {
  dropDraftPhotos(photoUris);
  dropDraftRecord(episodeId);
};

export const forgetEpisodeDraft = (episodeId: string | null) => {
  dropDraftRecord(episodeId);
};

export const writeEpisodeDraft = (draft: EpisodeDraft) => {
  initializeDatabase();
  setAppSetting(episodeDraftKey(draft.editingEpisodeId), JSON.stringify(draft));
};

/** 壊れている、期限切れ、説明が本体と食い違っている下書きは消して null。 */
export const readUsableEpisodeDraft = (
  episodeId: string | null,
  currentDescription: string
): EpisodeDraft | null => {
  initializeDatabase();
  const stored = getAppSetting(episodeDraftKey(episodeId));
  if (stored == null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    dropDraftRecord(episodeId);
    return null;
  }
  if (!isEpisodeDraft(parsed) || parsed.editingEpisodeId !== episodeId) {
    dropDraftRecord(episodeId);
    return null;
  }
  if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
    deleteEpisodeDraft(episodeId, parsed.newPhotoUris);
    return null;
  }
  if (episodeId && parsed.baseDescription !== currentDescription) {
    deleteEpisodeDraft(episodeId, parsed.newPhotoUris);
    return null;
  }
  return parsed;
};
