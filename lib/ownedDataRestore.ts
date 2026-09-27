import { MBTI_TYPES, type EpisodeParticipant, type EpisodeVisibilityEntry, type MBTIType, type Saying } from '@/types';
import {
  deleteProfileById,
  forceSetMyselfForRestore,
  getAllEvents,
  getAllFriends,
  getDefaultProfile,
  getEvent,
  getEventParticipants,
  getFriendById,
  getResolvedMyselfId,
  initializeDatabase,
  insertEpisodePhoto,
  restoreEpisodeIfMissing,
  restoreEventIfMissing,
  restorePersonCardIfMissing,
  updateEventNotificationId,
} from '@/db';
import { getSupabaseClient } from '@/lib/supabase';
import {
  downloadIdentityPhoto,
  downloadOwnedBucketPhoto,
  OWNED_EPISODE_PHOTO_BUCKET,
  OWNED_PERSON_PHOTO_BUCKET,
} from '@/lib/identityPhotoStorage';
import { scheduleEventNotification } from '@/utils/eventNotifications';
import { toEventParticipantDisplays } from '@/utils/eventParticipantHelpers';

export type OwnedRestoreResult = {
  skipped: boolean;
  refusedBecauseLocalData: boolean;
  errorMessage: string | null;
  restoredMyself: boolean;
  people: number;
  events: number;
  episodes: number;
};

const emptyRestore = (partial: Partial<OwnedRestoreResult> = {}): OwnedRestoreResult => ({
  skipped: true,
  refusedBecauseLocalData: false,
  errorMessage: null,
  restoredMyself: false,
  people: 0,
  events: 0,
  episodes: 0,
  ...partial,
});

const isUnknownColumnError = (message: string): boolean =>
  /schema cache/i.test(message) || /could not find the/i.test(message) || /does not exist/i.test(message);

const toStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const toSayingRows = (value: unknown): Saying[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Saying => Boolean(item && typeof item.id === 'string'))
    .map((item) => ({
      id: item.id,
      text: typeof item.text === 'string' ? item.text : '',
      date: typeof item.date === 'string' ? item.date : '',
    }));
};

const toMbti = (value: unknown): MBTIType => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return (MBTI_TYPES as string[]).includes(trimmed) ? (trimmed as MBTIType) : '';
};

const toOptionalInt = (value: unknown): number | null => {
  if (value == null || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const toParticipantEntries = (value: unknown): EpisodeParticipant[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is EpisodeParticipant => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const entry = item as EpisodeParticipant;
    return (entry.kind === 'individual' || entry.kind === 'group') && typeof entry.value === 'string';
  });
};

const toVisibilityEntries = (value: unknown): EpisodeVisibilityEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is EpisodeVisibilityEntry => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const entry = item as EpisodeVisibilityEntry;
    return (entry.kind === 'individual' || entry.kind === 'group') && typeof entry.value === 'string';
  });
};

/** 本人以外のカード・予定・エピソードが無いときだけ復元してよい。 */
export function isOwnedRestoreSafeLocally(): boolean {
  initializeDatabase();
  const friends = getAllFriends();
  if (friends.length > 1) {
    return false;
  }
  if (getAllEvents().length > 0) {
    return false;
  }
  return friends.every((friend) => (friend.episodes ?? []).length === 0);
}

type IdentityRestoreRow = {
  local_friend_id?: string | null;
  display_name: string | null;
  family_name: string | null;
  given_name: string | null;
  nickname: string | null;
  birthday: string | null;
  height: number | null;
  weight: number | null;
  origin: string | null;
  residence: string | null;
  mbti: string | null;
  public_fields: unknown;
  category?: string | null;
  description?: string | null;
  affiliations?: unknown;
  personalities?: unknown;
  experiences?: unknown;
  traits?: unknown;
  notes?: unknown;
  likes?: unknown;
  dislikes?: unknown;
  sayings?: unknown;
  photo_path?: string | null;
};

type OwnedPersonRestoreRow = {
  local_friend_id: string;
  linked_user_id: string | null;
  display_name: string;
  family_name: string;
  given_name: string;
  nickname: string;
  birthday: string;
  height: number | null;
  weight: number | null;
  origin: string;
  residence: string;
  mbti: string;
  category: string;
  description: string;
  affiliations: unknown;
  personalities: unknown;
  experiences: unknown;
  traits: unknown;
  notes: unknown;
  likes: unknown;
  dislikes: unknown;
  sayings: unknown;
  photo_path: string | null;
  import_source: string;
  scanned_at: string;
};

type OwnedEventRestoreRow = {
  local_event_id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  memo: string | null;
  notify_at: string | null;
  notify_enabled: boolean;
  auto_episode_created: boolean;
  episode_tag: string | null;
  location_tag: string | null;
  google_event_id: string | null;
  created_at: string;
};

type OwnedEpisodeRestoreRow = {
  local_episode_id: string;
  author_friend_id: string;
  title: string;
  date: string;
  time: string | null;
  description: string;
  visibility_mode: string;
  participant_entries: unknown;
  visibility_entries: unknown;
  local_event_id: string | null;
  is_auto_generated: boolean;
  pending_review: boolean;
  pending_review_dismissed: boolean;
  tag: string | null;
  location_tag: string | null;
};

const IDENTITY_SELECT =
  'local_friend_id, display_name, family_name, given_name, nickname, birthday, height, weight, origin, residence, mbti, public_fields, category, description, affiliations, personalities, experiences, traits, notes, likes, dislikes, sayings, photo_path';
const IDENTITY_SELECT_FALLBACK =
  'display_name, family_name, given_name, nickname, birthday, height, weight, origin, residence, mbti, public_fields, photo_path';

async function restoreMyself(
  ownerId: string
): Promise<{ restored: boolean; errorMessage: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { restored: false, errorMessage: null };
  }
  let query = await supabase
    .from('identity_profiles')
    .select(IDENTITY_SELECT)
    .eq('id', ownerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (query.error && isUnknownColumnError(query.error.message)) {
    query = await supabase
      .from('identity_profiles')
      .select(IDENTITY_SELECT_FALLBACK)
      .eq('id', ownerId)
      .is('deleted_at', null)
      .maybeSingle();
  }
  if (query.error) {
    return { restored: false, errorMessage: query.error.message };
  }
  const row = query.data as IdentityRestoreRow | null;
  const localFriendId = row?.local_friend_id?.trim() ?? '';
  if (!row || !localFriendId) {
    return { restored: false, errorMessage: null };
  }

  const previousMyself = getResolvedMyselfId();
  let photoUri: string | null = null;
  const photoPath = typeof row.photo_path === 'string' ? row.photo_path.trim() : '';
  if (photoPath) {
    photoUri = await downloadIdentityPhoto(supabase, photoPath);
  }

  const inserted = restorePersonCardIfMissing({
    friendId: localFriendId,
    familyName: row.family_name ?? '',
    givenName: row.given_name ?? '',
    nickname: row.nickname ?? '',
    origin: row.origin ?? '',
    residence: row.residence ?? '',
    mbti: toMbti(row.mbti),
    birthday: row.birthday ?? '',
    height: toOptionalInt(row.height),
    weight: toOptionalInt(row.weight),
    category: row.category ?? '',
    description: row.description ?? '',
    photoUri,
    affiliations: toStringList(row.affiliations),
    personalities: toStringList(row.personalities),
    experiences: toStringList(row.experiences),
    traits: toStringList(row.traits),
    notes: toStringList(row.notes),
    likes: toStringList(row.likes),
    dislikes: toStringList(row.dislikes),
    sayings: toSayingRows(row.sayings),
    importSource: 'manual',
    scannedUserId: '',
    scannedAt: '',
    publicFields: toStringList(row.public_fields),
    userId: ownerId,
  });

  if (!getFriendById(localFriendId)) {
    return { restored: false, errorMessage: '本人カードを端末に戻せませんでした。' };
  }
  forceSetMyselfForRestore(localFriendId);

  if (previousMyself && previousMyself !== localFriendId) {
    const oldProfile = getDefaultProfile(previousMyself);
    if (oldProfile) {
      deleteProfileById(oldProfile.id);
    }
  }
  return { restored: inserted || previousMyself !== localFriendId, errorMessage: null };
}

async function restorePersonCards(ownerId: string): Promise<{ count: number; errorMessage: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { count: 0, errorMessage: null };
  }
  const { data, error } = await supabase
    .from('owned_person_cards')
    .select(
      'local_friend_id, linked_user_id, display_name, family_name, given_name, nickname, birthday, height, weight, origin, residence, mbti, category, description, affiliations, personalities, experiences, traits, notes, likes, dislikes, sayings, photo_path, import_source, scanned_at'
    )
    .eq('owner_id', ownerId)
    .is('deleted_at', null);
  if (error) {
    return { count: 0, errorMessage: error.message };
  }
  const myselfId = getResolvedMyselfId();
  let count = 0;
  for (const raw of (data ?? []) as OwnedPersonRestoreRow[]) {
    const friendId = raw.local_friend_id?.trim() ?? '';
    if (!friendId || (myselfId && friendId === myselfId) || getFriendById(friendId)) {
      continue;
    }
    let photoUri: string | null = null;
    const photoPath = raw.photo_path?.trim() ?? '';
    if (photoPath) {
      photoUri = await downloadOwnedBucketPhoto(supabase, OWNED_PERSON_PHOTO_BUCKET, photoPath);
    }
    const linked = raw.linked_user_id?.trim() ?? '';
    const inserted = restorePersonCardIfMissing({
      friendId,
      familyName: raw.family_name ?? '',
      givenName: raw.given_name ?? '',
      nickname: raw.nickname ?? '',
      origin: raw.origin ?? '',
      residence: raw.residence ?? '',
      mbti: toMbti(raw.mbti),
      birthday: raw.birthday ?? '',
      height: toOptionalInt(raw.height),
      weight: toOptionalInt(raw.weight),
      category: raw.category ?? '',
      description: raw.description ?? '',
      photoUri,
      affiliations: toStringList(raw.affiliations),
      personalities: toStringList(raw.personalities),
      experiences: toStringList(raw.experiences),
      traits: toStringList(raw.traits),
      notes: toStringList(raw.notes),
      likes: toStringList(raw.likes),
      dislikes: toStringList(raw.dislikes),
      sayings: toSayingRows(raw.sayings),
      importSource: raw.import_source === 'qr_scan' || linked ? 'qr_scan' : 'manual',
      scannedUserId: linked,
      scannedAt: raw.scanned_at ?? '',
    });
    if (inserted) {
      count += 1;
    }
  }
  return { count, errorMessage: null };
}

async function restoreEvents(ownerId: string): Promise<{ count: number; errorMessage: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { count: 0, errorMessage: null };
  }
  const { data: eventRows, error: eventsError } = await supabase
    .from('owned_events')
    .select(
      'local_event_id, title, start_at, end_at, all_day, memo, notify_at, notify_enabled, auto_episode_created, episode_tag, location_tag, google_event_id, created_at'
    )
    .eq('owner_id', ownerId)
    .is('deleted_at', null);
  if (eventsError) {
    return { count: 0, errorMessage: eventsError.message };
  }
  const { data: participantRows, error: participantsError } = await supabase
    .from('owned_event_participants')
    .select('local_event_id, local_friend_id')
    .eq('owner_id', ownerId);
  if (participantsError) {
    return { count: 0, errorMessage: participantsError.message };
  }
  const friendIdsByEvent = new Map<string, string[]>();
  ((participantRows ?? []) as Array<{ local_event_id: string; local_friend_id: string }>).forEach((row) => {
    const eventId = row.local_event_id?.trim() ?? '';
    const friendId = row.local_friend_id?.trim() ?? '';
    if (!eventId || !friendId) {
      return;
    }
    const list = friendIdsByEvent.get(eventId) ?? [];
    list.push(friendId);
    friendIdsByEvent.set(eventId, list);
  });

  let count = 0;
  for (const raw of (eventRows ?? []) as OwnedEventRestoreRow[]) {
    const eventId = raw.local_event_id?.trim() ?? '';
    if (!eventId) {
      continue;
    }
    const inserted = restoreEventIfMissing({
      eventId,
      title: raw.title ?? '',
      startAt: raw.start_at,
      endAt: raw.end_at,
      allDay: raw.all_day === true,
      memo: raw.memo,
      notifyAt: raw.notify_at,
      notifyEnabled: raw.notify_enabled !== false,
      autoEpisodeCreated: raw.auto_episode_created === true,
      episodeTag: raw.episode_tag,
      locationTag: raw.location_tag,
      googleEventId: raw.google_event_id,
      createdAt: raw.created_at,
      participantFriendIds: friendIdsByEvent.get(eventId) ?? [],
    });
    if (!inserted) {
      continue;
    }
    count += 1;
    const event = getEvent(eventId);
    if (!event) {
      continue;
    }
    try {
      const displays = toEventParticipantDisplays(
        getEventParticipants(eventId).map((participant) => participant.profileId)
      );
      const notificationId = await scheduleEventNotification(event, displays);
      if (notificationId) {
        updateEventNotificationId(eventId, notificationId);
      }
    } catch (error) {
      console.warn('restore event notification failed', eventId, error);
    }
  }
  return { count, errorMessage: null };
}

async function restoreEpisodes(ownerId: string): Promise<{ count: number; errorMessage: string | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { count: 0, errorMessage: null };
  }
  const { data: episodeRows, error: episodesError } = await supabase
    .from('owned_episodes')
    .select(
      'local_episode_id, author_friend_id, title, date, time, description, visibility_mode, participant_entries, visibility_entries, local_event_id, is_auto_generated, pending_review, pending_review_dismissed, tag, location_tag'
    )
    .eq('owner_id', ownerId)
    .is('deleted_at', null);
  if (episodesError) {
    return { count: 0, errorMessage: episodesError.message };
  }
  const { data: photoRows, error: photosError } = await supabase
    .from('owned_episode_photos')
    .select('local_episode_id, photo_path, sort_order')
    .eq('owner_id', ownerId);
  if (photosError) {
    return { count: 0, errorMessage: photosError.message };
  }
  const photosByEpisode = new Map<string, Array<{ photo_path: string; sort_order: number }>>();
  (
    (photoRows ?? []) as Array<{ local_episode_id: string; photo_path: string; sort_order: number }>
  ).forEach((row) => {
    const episodeId = row.local_episode_id?.trim() ?? '';
    const path = row.photo_path?.trim() ?? '';
    if (!episodeId || !path) {
      return;
    }
    const list = photosByEpisode.get(episodeId) ?? [];
    list.push({ photo_path: path, sort_order: Number(row.sort_order) || 0 });
    photosByEpisode.set(episodeId, list);
  });

  let count = 0;
  for (const raw of (episodeRows ?? []) as OwnedEpisodeRestoreRow[]) {
    const episodeId = raw.local_episode_id?.trim() ?? '';
    if (!episodeId) {
      continue;
    }
    const inserted = restoreEpisodeIfMissing({
      episodeId,
      title: raw.title ?? '',
      date: raw.date ?? '',
      time: raw.time,
      description: raw.description ?? '',
      authorFriendId: raw.author_friend_id ?? '',
      visibilityMode:
        raw.visibility_mode === 'public' || raw.visibility_mode === 'limited' || raw.visibility_mode === 'private'
          ? raw.visibility_mode
          : 'private',
      participantEntries: toParticipantEntries(raw.participant_entries),
      visibilityEntries: toVisibilityEntries(raw.visibility_entries),
      eventId: raw.local_event_id,
      isAutoGenerated: raw.is_auto_generated === true,
      pendingReview: raw.pending_review === true,
      pendingReviewDismissed: raw.pending_review_dismissed === true,
      tag: raw.tag,
      locationTag: raw.location_tag,
    });
    if (!inserted) {
      continue;
    }
    count += 1;
    const photos = (photosByEpisode.get(episodeId) ?? []).sort((left, right) => left.sort_order - right.sort_order);
    for (const photo of photos) {
      const uri = await downloadOwnedBucketPhoto(supabase, OWNED_EPISODE_PHOTO_BUCKET, photo.photo_path);
      if (!uri) {
        continue;
      }
      insertEpisodePhoto(episodeId, uri, photo.sort_order);
    }
  }
  return { count, errorMessage: null };
}

/** 端末が空相当のときだけ、人物・予定・エピソードをサーバーから書き戻す。既存 ID は触らない。 */
let restoreOwnedInFlight: Promise<OwnedRestoreResult> | null = null;

export async function restoreOwnedPersonEpisodeCalendar(): Promise<OwnedRestoreResult> {
  if (restoreOwnedInFlight) {
    return restoreOwnedInFlight;
  }
  restoreOwnedInFlight = restoreOwnedPersonEpisodeCalendarUnlocked().finally(() => {
    restoreOwnedInFlight = null;
  });
  return restoreOwnedInFlight;
}

async function restoreOwnedPersonEpisodeCalendarUnlocked(): Promise<OwnedRestoreResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return emptyRestore();
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return emptyRestore({ skipped: false, errorMessage: sessionError.message });
  }
  const ownerId = sessionData.session?.user.id?.trim() ?? '';
  if (!ownerId) {
    return emptyRestore();
  }

  initializeDatabase();
  if (!isOwnedRestoreSafeLocally()) {
    return emptyRestore({ refusedBecauseLocalData: true });
  }

  const myself = await restoreMyself(ownerId);
  if (myself.errorMessage) {
    return emptyRestore({ skipped: false, errorMessage: myself.errorMessage });
  }
  const people = await restorePersonCards(ownerId);
  if (people.errorMessage) {
    return emptyRestore({
      skipped: false,
      errorMessage: people.errorMessage,
      restoredMyself: myself.restored,
      people: people.count,
    });
  }
  const events = await restoreEvents(ownerId);
  if (events.errorMessage) {
    return emptyRestore({
      skipped: false,
      errorMessage: events.errorMessage,
      restoredMyself: myself.restored,
      people: people.count,
      events: events.count,
    });
  }
  const episodes = await restoreEpisodes(ownerId);
  if (episodes.errorMessage) {
    return emptyRestore({
      skipped: false,
      errorMessage: episodes.errorMessage,
      restoredMyself: myself.restored,
      people: people.count,
      events: events.count,
      episodes: episodes.count,
    });
  }

  return {
    skipped: false,
    refusedBecauseLocalData: false,
    errorMessage: null,
    restoredMyself: myself.restored,
    people: people.count,
    events: events.count,
    episodes: episodes.count,
  };
}
