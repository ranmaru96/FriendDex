import { useCallback, useEffect, useState } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { detailHref } from '@/utils/detailPaths';
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
  /** 画面切り替えの途中では出さない。詳細にいるあいだは false のままにする。 */
  const [canPresentReview, setCanPresentReview] = useState(false);
  const onEpisodeDetail = pathname.includes('episode-detail');
  if (onEpisodeDetail && canPresentReview) {
    setCanPresentReview(false);
  }

  const reloadPendingReviews = useCallback(() => {
    initializeDatabase();
    const pending = getPendingReviewEpisodes();
    setPendingReviewItems(pending);
    setReviewModalVisible(pending.length > 0);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setReviewModalVisible(false);
      setCanPresentReview(false);
      return;
    }
    if (onEpisodeDetail) {
      setCanPresentReview(false);
      reloadPendingReviews();
      return;
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        return;
      }
      reloadPendingReviews();
      setCanPresentReview(true);
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [enabled, onEpisodeDetail, pathname, reloadPendingReviews]);

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
      router.push(
        detailHref('episode', 'episode', {
          episodeId: item.episode.id,
          ownerId,
          edit: '1',
        })
      );
    },
    [router]
  );

  return (
    <PendingEpisodeReviewModal
      visible={enabled && reviewModalVisible && canPresentReview && !onEpisodeDetail}
      items={pendingReviewItems}
      onChanged={reloadPendingReviews}
      onWrite={handleWritePendingEpisode}
    />
  );
}
