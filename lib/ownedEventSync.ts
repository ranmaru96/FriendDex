import { v4 as uuidv4 } from 'uuid';
import {
  getAllEvents,
  getEvent,
  getEventParticipants,
  getProfileById,
  initializeDatabase,
} from '@/db';
import {
  dequeuePendingOwnedDelete,
  enqueuePendingOwnedDelete,
} from '@/lib/pendingOwnedDeletes';
import { getSupabaseClient } from '@/lib/supabase';

export type OwnedEventSyncResult = {
  skipped: boolean;
  errorMessage: string | null;
};

type OwnedEventRow = {
  id: string;
  owner_id: string;
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
  updated_at: string;
  deleted_at: null;
  sync_version: number;
};

const participantFriendIds = (eventId: string): string[] => {
  const seen = new Set<string>();
  getEventParticipants(eventId).forEach((participant) => {
    const profile = getProfileById(participant.profileId);
    const friendId = profile?.friendId?.trim() ?? '';
    if (friendId) {
      seen.add(friendId);
    }
  });
  return [...seen];
};

export async function upsertOwnedEvent(eventId: string): Promise<OwnedEventSyncResult> {
  const trimmed = eventId.trim();
  if (!trimmed) {
    return { skipped: true, errorMessage: null };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { skipped: false, errorMessage: sessionError.message };
  }
  const ownerId = sessionData.session?.user.id?.trim() ?? '';
  if (!ownerId) {
    return { skipped: true, errorMessage: null };
  }

  initializeDatabase();
  const event = getEvent(trimmed);
  if (!event) {
    return { skipped: true, errorMessage: null };
  }

  const { data: existing, error: readError } = await supabase
    .from('owned_events')
    .select('id, sync_version')
    .eq('owner_id', ownerId)
    .eq('local_event_id', trimmed)
    .maybeSingle();
  if (readError) {
    return { skipped: false, errorMessage: readError.message };
  }
  const nextVersion =
    typeof existing?.sync_version === 'number' && Number.isFinite(existing.sync_version)
      ? Math.floor(existing.sync_version) + 1
      : 1;
  const rowId = typeof existing?.id === 'string' && existing.id.trim() ? existing.id : uuidv4();
  const now = new Date().toISOString();
  const row: OwnedEventRow = {
    id: rowId,
    owner_id: ownerId,
    local_event_id: trimmed,
    title: event.title,
    start_at: event.startAt,
    end_at: event.endAt,
    all_day: event.allDay,
    memo: event.memo,
    notify_at: event.notifyAt,
    notify_enabled: event.notifyEnabled,
    auto_episode_created: event.autoEpisodeCreated,
    episode_tag: event.episodeTag,
    location_tag: event.locationTag,
    google_event_id: event.googleEventId,
    created_at: event.createdAt || now,
    updated_at: now,
    deleted_at: null,
    sync_version: nextVersion,
  };

  const { error: upsertError } = await supabase
    .from('owned_events')
    .upsert(row, { onConflict: 'owner_id,local_event_id' });
  if (upsertError) {
    return { skipped: false, errorMessage: upsertError.message };
  }

  const { error: deleteParticipantsError } = await supabase
    .from('owned_event_participants')
    .delete()
    .eq('owner_id', ownerId)
    .eq('local_event_id', trimmed);
  if (deleteParticipantsError) {
    return { skipped: false, errorMessage: deleteParticipantsError.message };
  }

  const friendIds = participantFriendIds(trimmed);
  if (friendIds.length > 0) {
    const { error: insertError } = await supabase.from('owned_event_participants').insert(
      friendIds.map((localFriendId) => ({
        owner_id: ownerId,
        local_event_id: trimmed,
        local_friend_id: localFriendId,
      }))
    );
    if (insertError) {
      return { skipped: false, errorMessage: insertError.message };
    }
  }

  return { skipped: false, errorMessage: null };
}

export async function markOwnedEventDeleted(eventId: string): Promise<OwnedEventSyncResult> {
  const trimmed = eventId.trim();
  if (!trimmed) {
    return { skipped: true, errorMessage: null };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { skipped: false, errorMessage: sessionError.message };
  }
  const ownerId = sessionData.session?.user.id?.trim() ?? '';
  if (!ownerId) {
    return { skipped: true, errorMessage: null };
  }

  const now = new Date().toISOString();
  const { error: participantError } = await supabase
    .from('owned_event_participants')
    .delete()
    .eq('owner_id', ownerId)
    .eq('local_event_id', trimmed);
  if (participantError) {
    return { skipped: false, errorMessage: participantError.message };
  }
  const { error } = await supabase
    .from('owned_events')
    .update({ deleted_at: now, updated_at: now })
    .eq('owner_id', ownerId)
    .eq('local_event_id', trimmed);
  if (error) {
    return { skipped: false, errorMessage: error.message };
  }
  return { skipped: false, errorMessage: null };
}

export async function syncAllOwnedEvents(): Promise<OwnedEventSyncResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { skipped: true, errorMessage: null };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { skipped: false, errorMessage: sessionError.message };
  }
  if (!sessionData.session?.user.id) {
    return { skipped: true, errorMessage: null };
  }

  initializeDatabase();
  const events = getAllEvents();
  for (const event of events) {
    const result = await upsertOwnedEvent(event.id);
    if (result.errorMessage) {
      return result;
    }
  }
  return { skipped: events.length === 0, errorMessage: null };
}

export function scheduleOwnedEventSync(eventId: string): void {
  void upsertOwnedEvent(eventId);
}

export function scheduleOwnedEventDelete(eventId: string): void {
  enqueuePendingOwnedDelete('event', eventId);
  void markOwnedEventDeleted(eventId).then((result) => {
    if (!result.errorMessage && !result.skipped) {
      dequeuePendingOwnedDelete('event', eventId);
    }
  });
}
