import { Alert } from 'react-native';
import type { EpisodeVisibilityMode } from '@/types';
import { requireOnline } from '@/lib/networkReachability';
import { scheduleOwnedEpisodeSync } from '@/lib/ownedEpisodeSync';
import { syncEpisodeShareAfterLocalSave } from '@/lib/sharedEpisodeSync';

export function guardEpisodeShareOnline(mode: EpisodeVisibilityMode): boolean {
  if (mode !== 'public' && mode !== 'limited') {
    return true;
  }
  return requireOnline();
}

export async function afterEpisodeSavedLocally(episodeId: string): Promise<void> {
  const share = await syncEpisodeShareAfterLocalSave(episodeId);
  if (share.errorMessage) {
    Alert.alert('公開できませんでした', share.errorMessage);
  }
  scheduleOwnedEpisodeSync(episodeId);
}
