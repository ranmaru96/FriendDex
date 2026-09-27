import { upsertMyselfIdentityProfile } from '@/lib/identityProfileSync';
import { markOwnedEpisodeDeleted, syncAllOwnedEpisodes } from '@/lib/ownedEpisodeSync';
import { markOwnedEventDeleted, syncAllOwnedEvents } from '@/lib/ownedEventSync';
import {
  flushPendingSharedEpisodeUnpublish,
  pullIncomingSharedEpisodes,
} from '@/lib/sharedEpisodeSync';
import { syncAllOwnedPersonCards } from '@/lib/ownedPersonCardSync';
import {
  dequeuePendingOwnedDelete,
  loadPendingOwnedDeletes,
} from '@/lib/pendingOwnedDeletes';

const logIfFailed = (label: string, errorMessage: string | null): void => {
  if (errorMessage) {
    console.warn(label, errorMessage);
  }
};

export async function flushPendingOwnedDeletes(): Promise<void> {
  const pending = loadPendingOwnedDeletes();
  for (const eventId of pending.events) {
    const result = await markOwnedEventDeleted(eventId);
    if (!result.errorMessage && !result.skipped) {
      dequeuePendingOwnedDelete('event', eventId);
    }
  }
  for (const episodeId of pending.episodes) {
    const result = await markOwnedEpisodeDeleted(episodeId);
    if (!result.errorMessage && !result.skipped) {
      dequeuePendingOwnedDelete('episode', episodeId);
    }
  }
}

/** 回線復帰時。人物・予定・エピソードだけ送る（貸し借りはオンライン専用のまま）。 */
export async function flushOwnedPersonEpisodeCalendar(): Promise<void> {
  await flushPendingOwnedDeletes();
  const identity = await upsertMyselfIdentityProfile();
  logIfFailed('owned identity flush failed', identity.errorMessage);
  const people = await syncAllOwnedPersonCards();
  logIfFailed('owned person flush failed', people.errorMessage);
  const events = await syncAllOwnedEvents();
  logIfFailed('owned event flush failed', events.errorMessage);
  const episodes = await syncAllOwnedEpisodes();
  logIfFailed('owned episode flush failed', episodes.errorMessage);
  await flushPendingSharedEpisodeUnpublish();
  const incoming = await pullIncomingSharedEpisodes();
  logIfFailed('incoming shared episode pull failed', incoming.errorMessage);
}
