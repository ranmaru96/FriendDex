import type { Episode, EpisodeVisibilityMode } from '@/types';
import {
  deleteIncomingSharedEpisodePhoto,
  findFriendByAuthUserId,
  getAllFriends,
  getAppSetting,
  getEpisodePhotos,
  getFriendById,
  getIncomingSharedEpisodePhotoPath,
  getIncomingSharedEpisodePhotos,
  getMyself,
  initializeDatabase,
  PENDING_SHARED_EPISODE_UNPUBLISH_KEY,
  pruneIncomingSharedEpisodesExcept,
  setAppSetting,
  upsertIncomingSharedEpisode,
  upsertIncomingSharedEpisodePhoto,
} from '@/db';
import { getAcceptedPeerUserIds, getCachedAcceptedPeerIds } from '@/lib/connectionSync';
import { getSupabaseClient } from '@/lib/supabase';
import { isNetworkReachable, ONLINE_REQUIRED_MESSAGE } from '@/lib/networkReachability';
import { asAuthUserId, getFriendLinkedAuthUserId } from '@/utils/linkedAuthUser';
import {
  downloadOwnedBucketPhoto,
  removeSharedEpisodePhotoFiles,
  SHARED_EPISODE_PHOTO_BUCKET,
  syncSharedEpisodePhotoUpload,
} from '@/lib/identityPhotoStorage';

export type SharedEpisodeSyncResult = {
  skipped: boolean;
  errorMessage: string | null;
};

type SharedEpisodeRow = {
  id: string;
  owner_id: string;
  local_episode_id: string;
  title: string;
  date: string;
  time: string | null;
  description: string;
  visibility_mode: string;
  tag: string | null;
  participant_tags: unknown;
  published_at: string;
  updated_at: string;
};

type SharedEpisodePhotoRow = {
  owner_id: string;
  local_episode_id: string;
  local_photo_id: number;
  photo_path: string;
  sort_order: number;
};

const collectOwnedEpisodes = (): Episode[] => {
  const byId = new Map<string, Episode>();
  getAllFriends().forEach((friend) => {
    (friend.episodes ?? []).forEach((episode) => {
      const id = episode?.id?.trim() ?? '';
      if (id && !byId.has(id)) {
        byId.set(id, episode);
      }
    });
  });
  return [...byId.values()];
};

const findOwnedEpisodeById = (episodeId: string): Episode | null =>
  collectOwnedEpisodes().find((episode) => episode.id === episodeId) ?? null;

const parseParticipantTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
};

const uniqueIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

const asLowerAuthUserId = (value: string | null | undefined): string =>
  asAuthUserId(value)?.toLowerCase() ?? '';

const isUniqueViolation = (error: { code?: string } | null): boolean => error?.code === '23505';

const loadPendingUnpublish = (): string[] => {
  initializeDatabase();
  const raw = getAppSetting(PENDING_SHARED_EPISODE_UNPUBLISH_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return uniqueIds(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return [];
  }
};

const savePendingUnpublish = (ids: string[]): void => {
  initializeDatabase();
  setAppSetting(PENDING_SHARED_EPISODE_UNPUBLISH_KEY, JSON.stringify(uniqueIds(ids)));
};

const enqueuePendingUnpublish = (episodeId: string): void => {
  const trimmed = episodeId.trim();
  if (!trimmed) {
    return;
  }
  savePendingUnpublish([...loadPendingUnpublish(), trimmed]);
};

const dequeuePendingUnpublish = (episodeId: string): void => {
  const trimmed = episodeId.trim();
  savePendingUnpublish(loadPendingUnpublish().filter((id) => id !== trimmed));
};

async function requireMyUserId(): Promise<{
  myUserId: string;
  skipped: boolean;
  errorMessage: string | null;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { myUserId: '', skipped: true, errorMessage: 'Supabase が未設定です' };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { myUserId: '', skipped: false, errorMessage: sessionError.message };
  }
  const myUserId = asAuthUserId(sessionData.session?.user.id) ?? '';
  if (!myUserId) {
    return { myUserId: '', skipped: true, errorMessage: 'ログインしてください。' };
  }
  return { myUserId, skipped: false, errorMessage: null };
}

const participantTagsForEpisode = (episode: Episode): string[] => {
  const labels: string[] = [];
  const seen = new Set<string>();
  (episode.participantEntries ?? []).forEach((entry) => {
    if (entry.kind !== 'individual') {
      return;
    }
    const friendId = entry.value.trim();
    if (!friendId) {
      return;
    }
    const name = getFriendById(friendId)?.name.trim() || '';
    if (!name || seen.has(name)) {
      return;
    }
    seen.add(name);
    labels.push(name);
  });
  return labels;
};

const limitedAudienceUserIds = (episode: Episode, myUserId: string): string[] => {
  const accepted = getCachedAcceptedPeerIds();
  const self = asLowerAuthUserId(myUserId);
  const ids: string[] = [];
  (episode.visibilityEntries ?? []).forEach((entry) => {
    if (entry.kind !== 'individual') {
      return;
    }
    const linked = asLowerAuthUserId(getFriendLinkedAuthUserId(entry.value));
    if (!linked || linked === self || !accepted.has(linked)) {
      return;
    }
    ids.push(linked);
  });
  return uniqueIds(ids);
};

async function writeSharedEpisodeRow(input: {
  ownerId: string;
  localEpisodeId: string;
  title: string;
  date: string;
  time: string | null;
  description: string;
  visibilityMode: 'public' | 'limited';
  tag: string | null;
  participantTags: string[];
}): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return 'Supabase が未設定です';
  }
  const content = {
    title: input.title,
    date: input.date,
    time: input.time,
    description: input.description,
    visibility_mode: input.visibilityMode,
    tag: input.tag,
    participant_tags: input.participantTags,
    updated_at: new Date().toISOString(),
  };
  const { data: existing, error: readError } = await supabase
    .from('shared_episodes')
    .select('id')
    .eq('owner_id', input.ownerId)
    .eq('local_episode_id', input.localEpisodeId)
    .maybeSingle();
  if (readError) {
    return readError.message;
  }
  if (typeof existing?.id === 'string' && existing.id.trim()) {
    const { error } = await supabase
      .from('shared_episodes')
      .update(content)
      .eq('id', existing.id.trim())
      .eq('owner_id', input.ownerId);
    return error?.message ?? null;
  }
  const { error: insertError } = await supabase.from('shared_episodes').insert({
    owner_id: input.ownerId,
    local_episode_id: input.localEpisodeId,
    ...content,
  });
  if (!insertError) {
    return null;
  }
  if (!isUniqueViolation(insertError)) {
    return insertError.message;
  }
  const { error: updateError } = await supabase
    .from('shared_episodes')
    .update(content)
    .eq('owner_id', input.ownerId)
    .eq('local_episode_id', input.localEpisodeId);
  return updateError?.message ?? null;
}

async function removeSharedPhotoFilesForEpisode(
  ownerId: string,
  localEpisodeId: string
): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }
  const { data } = await supabase
    .from('shared_episode_photos')
    .select('photo_path')
    .eq('owner_id', ownerId)
    .eq('local_episode_id', localEpisodeId);
  const paths = (data ?? [])
    .map((row) => (typeof row.photo_path === 'string' ? row.photo_path : ''))
    .filter(Boolean);
  await removeSharedEpisodePhotoFiles(supabase, paths);
}

export async function unpublishSharedEpisode(episodeId: string): Promise<SharedEpisodeSyncResult> {
  const trimmed = episodeId.trim();
  if (!trimmed) {
    return { skipped: true, errorMessage: null };
  }
  if (!isNetworkReachable()) {
    enqueuePendingUnpublish(trimmed);
    return { skipped: true, errorMessage: null };
  }
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    if (!auth.skipped) {
      enqueuePendingUnpublish(trimmed);
    }
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  await removeSharedPhotoFilesForEpisode(auth.myUserId, trimmed);
  const { error } = await supabase
    .from('shared_episodes')
    .delete()
    .eq('owner_id', auth.myUserId)
    .eq('local_episode_id', trimmed);
  if (error) {
    enqueuePendingUnpublish(trimmed);
    return { skipped: false, errorMessage: error.message };
  }
  dequeuePendingUnpublish(trimmed);
  return { skipped: false, errorMessage: null };
}

export async function publishSharedEpisode(episodeId: string): Promise<SharedEpisodeSyncResult> {
  const trimmed = episodeId.trim();
  if (!trimmed) {
    return { skipped: true, errorMessage: null };
  }
  if (!isNetworkReachable()) {
    return { skipped: true, errorMessage: ONLINE_REQUIRED_MESSAGE };
  }
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: 'Supabase が未設定です' };
  }

  const accepted = await getAcceptedPeerUserIds();
  if (accepted.errorMessage) {
    return { skipped: false, errorMessage: accepted.errorMessage };
  }
  if (accepted.skipped) {
    return { skipped: true, errorMessage: accepted.errorMessage };
  }

  initializeDatabase();
  const episode = findOwnedEpisodeById(trimmed);
  if (!episode) {
    return unpublishSharedEpisode(trimmed);
  }

  const mode: EpisodeVisibilityMode =
    episode.visibilityMode === 'limited'
      ? 'limited'
      : episode.visibilityMode === 'public'
        ? 'public'
        : 'private';
  if (mode === 'private') {
    return unpublishSharedEpisode(trimmed);
  }

  const audienceIds = mode === 'limited' ? limitedAudienceUserIds(episode, auth.myUserId) : [];
  if (mode === 'limited' && audienceIds.length === 0) {
    return unpublishSharedEpisode(trimmed);
  }

  dequeuePendingUnpublish(trimmed);

  const writeError = await writeSharedEpisodeRow({
    ownerId: auth.myUserId,
    localEpisodeId: trimmed,
    title: episode.title ?? '',
    date: episode.date ?? '',
    time: episode.time?.trim() ? episode.time : null,
    description: episode.description ?? '',
    visibilityMode: mode,
    tag: episode.tag?.trim() ? episode.tag : null,
    participantTags: participantTagsForEpisode(episode),
  });
  if (writeError) {
    return { skipped: false, errorMessage: writeError };
  }

  const { error: deleteAudienceError } = await supabase
    .from('shared_episode_audience')
    .delete()
    .eq('owner_id', auth.myUserId)
    .eq('local_episode_id', trimmed);
  if (deleteAudienceError) {
    return { skipped: false, errorMessage: deleteAudienceError.message };
  }
  if (audienceIds.length > 0) {
    const { error: insertAudienceError } = await supabase.from('shared_episode_audience').insert(
      audienceIds.map((viewerId) => ({
        owner_id: auth.myUserId,
        local_episode_id: trimmed,
        viewer_id: viewerId,
      }))
    );
    if (insertAudienceError) {
      return { skipped: false, errorMessage: insertAudienceError.message };
    }
  }

  const { data: existingPhotos } = await supabase
    .from('shared_episode_photos')
    .select('photo_path')
    .eq('owner_id', auth.myUserId)
    .eq('local_episode_id', trimmed);
  const localPhotos = getEpisodePhotos(trimmed);
  const photoRows: SharedEpisodePhotoRow[] = [];
  for (const photo of localPhotos) {
    const uploaded = await syncSharedEpisodePhotoUpload(
      supabase,
      auth.myUserId,
      trimmed,
      photo.id,
      photo.photoUri
    );
    if (uploaded.unreadable) {
      continue;
    }
    if (uploaded.errorMessage || !uploaded.path) {
      return {
        skipped: false,
        errorMessage: uploaded.errorMessage ?? '公開用写真のアップロードに失敗しました',
      };
    }
    photoRows.push({
      owner_id: auth.myUserId,
      local_episode_id: trimmed,
      local_photo_id: Number(photo.id),
      photo_path: uploaded.path,
      sort_order: Number(photo.sortOrder) || 0,
    });
  }
  const keepPaths = new Set(photoRows.map((row) => row.photo_path));
  const stalePaths = (existingPhotos ?? [])
    .map((photo) => (typeof photo.photo_path === 'string' ? photo.photo_path : ''))
    .filter((path) => path && !keepPaths.has(path));
  if (stalePaths.length > 0) {
    await removeSharedEpisodePhotoFiles(supabase, stalePaths);
  }
  const { error: deletePhotosError } = await supabase
    .from('shared_episode_photos')
    .delete()
    .eq('owner_id', auth.myUserId)
    .eq('local_episode_id', trimmed);
  if (deletePhotosError) {
    return { skipped: false, errorMessage: deletePhotosError.message };
  }
  if (photoRows.length > 0) {
    const { error: insertPhotosError } = await supabase.from('shared_episode_photos').insert(photoRows);
    if (insertPhotosError) {
      return { skipped: false, errorMessage: insertPhotosError.message };
    }
  }

  return { skipped: false, errorMessage: null };
}

export async function syncEpisodeShareAfterLocalSave(
  episodeId: string
): Promise<SharedEpisodeSyncResult> {
  const episode = findOwnedEpisodeById(episodeId);
  if (!episode) {
    return unpublishSharedEpisode(episodeId);
  }
  if (episode.visibilityMode === 'public' || episode.visibilityMode === 'limited') {
    return publishSharedEpisode(episodeId);
  }
  return unpublishSharedEpisode(episodeId);
}

export async function republishSharedEpisodeIfPublished(
  episodeId: string
): Promise<SharedEpisodeSyncResult> {
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const { data, error } = await supabase
    .from('shared_episodes')
    .select('id')
    .eq('owner_id', auth.myUserId)
    .eq('local_episode_id', episodeId.trim())
    .maybeSingle();
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  if (!data) {
    return { skipped: true, errorMessage: null };
  }
  return publishSharedEpisode(episodeId);
}

export async function flushPendingSharedEpisodeUnpublish(): Promise<void> {
  const pending = loadPendingUnpublish();
  for (const episodeId of pending) {
    const result = await unpublishSharedEpisode(episodeId);
    if (result.errorMessage) {
      console.warn('shared episode unpublish failed', result.errorMessage);
    }
  }
}

export async function pullIncomingSharedEpisodes(): Promise<SharedEpisodeSyncResult> {
  if (!isNetworkReachable()) {
    return { skipped: true, errorMessage: null };
  }
  const auth = await requireMyUserId();
  if (!auth.myUserId) {
    return { skipped: auth.skipped, errorMessage: auth.errorMessage };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const accepted = await getAcceptedPeerUserIds();
  if (accepted.errorMessage) {
    return { skipped: false, errorMessage: accepted.errorMessage };
  }
  const { data, error } = await supabase
    .from('shared_episodes')
    .select(
      'id, owner_id, local_episode_id, title, date, time, description, visibility_mode, tag, participant_tags, published_at, updated_at'
    )
    .neq('owner_id', auth.myUserId);
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }

  initializeDatabase();
  const keepIds = new Set<string>();
  const rows = (data ?? []) as SharedEpisodeRow[];
  for (const row of rows) {
    const ownerId = asLowerAuthUserId(row.owner_id);
    const sharedId = row.id?.trim() ?? '';
    if (!ownerId || !sharedId || ownerId === asLowerAuthUserId(auth.myUserId)) {
      continue;
    }
    if (!accepted.peerIds.has(ownerId)) {
      continue;
    }
    const author = findFriendByAuthUserId(ownerId);
    if (!author || author.id === getMyself()) {
      continue;
    }
    keepIds.add(sharedId);
    upsertIncomingSharedEpisode({
      sharedId,
      ownerUserId: ownerId,
      ownerLocalEpisodeId: row.local_episode_id,
      authorFriendId: author.id,
      title: row.title ?? '',
      date: row.date ?? '',
      time: row.time,
      description: row.description ?? '',
      visibilityMode: row.visibility_mode === 'limited' ? 'limited' : 'public',
      tag: row.tag,
      participantTags: parseParticipantTags(row.participant_tags),
      updatedAt: row.updated_at || row.published_at || new Date().toISOString(),
    });

    const { data: photos } = await supabase
      .from('shared_episode_photos')
      .select('owner_id, local_episode_id, local_photo_id, photo_path, sort_order')
      .eq('owner_id', ownerId)
      .eq('local_episode_id', row.local_episode_id);
    const photoRows = (photos ?? []) as SharedEpisodePhotoRow[];
    const keepPhotoIds = new Set(
      photoRows.map((photo) => Number(photo.local_photo_id)).filter((id) => Number.isFinite(id))
    );
    for (const photo of photoRows) {
      const photoId = Number(photo.local_photo_id);
      const path = photo.photo_path?.trim() ?? '';
      if (!path || !Number.isFinite(photoId)) {
        continue;
      }
      const currentPath = getIncomingSharedEpisodePhotoPath(sharedId, photoId);
      if (currentPath === path) {
        continue;
      }
      const uri = await downloadOwnedBucketPhoto(supabase, SHARED_EPISODE_PHOTO_BUCKET, path);
      if (!uri) {
        continue;
      }
      upsertIncomingSharedEpisodePhoto({
        sharedId,
        localPhotoId: photoId,
        photoPath: path,
        photoUri: uri,
        sortOrder: Number(photo.sort_order) || 0,
      });
    }
    getIncomingSharedEpisodePhotos(sharedId).forEach((photo) => {
      if (!keepPhotoIds.has(photo.id)) {
        deleteIncomingSharedEpisodePhoto(sharedId, photo.id);
      }
    });
  }

  pruneIncomingSharedEpisodesExcept(keepIds);
  return { skipped: false, errorMessage: null };
}
