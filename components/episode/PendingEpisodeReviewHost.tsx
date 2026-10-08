import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { PendingEpisodeReviewModal } from '@/components/episode/PendingEpisodeReviewModal';
import { getPendingReviewEpisodes, initializeDatabase } from '@/db';
import type { PendingReviewEpisodeRef } from '@/types';

type PendingEpisodeReviewHostProps = {
  enabled: boolean;
};

export function PendingEpisodeReviewHost({ enabled }: PendingEpisodeReviewHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingReviewItems, setPendingReviewItems] = useState<PendingReviewEpisodeRef[]>([]);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const hideOnEditor = pathname.includes('episode-detail');

  const reloadPendingReviews = useCallback(() => {
    initializeDatabase();
    const pending = getPendingReviewEpisodes();
    setPendingReviewItems(pending);
    setReviewModalVisible(pending.length > 0);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setReviewModalVisible(false);
      return;
    }
    reloadPendingReviews();
  }, [enabled, pathname, reloadPendingReviews]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reloadPendingReviews();
      }
    });
    const interval = setInterval(reloadPendingReviews, 60_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [enabled, reloadPendingReviews]);

  const handleWritePendingEpisode = useCallback(
    (item: PendingReviewEpisodeRef) => {
      setReviewModalVisible(false);
      const ownerId = item.episode.authorFriendId.trim() || item.friendId;
      router.push({
        pathname: '/episode-detail',
        params: {
          episodeId: item.episode.id,
          ownerId,
          edit: '1',
        },
      });
    },
    [router]
  );

  return (
    <PendingEpisodeReviewModal
      visible={enabled && reviewModalVisible && !hideOnEditor}
      items={pendingReviewItems}
      onChanged={reloadPendingReviews}
      onWrite={handleWritePendingEpisode}
    />
  );
}
