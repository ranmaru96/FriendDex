import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing, Theme, Typography } from '@/constants/theme';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { deleteEpisode, dismissPendingReviewPrompt, getMyself, initializeDatabase } from '@/db';
import type { PendingReviewEpisodeRef } from '@/types';
import { resolveEpisodeRecordOwnerId } from '@/utils/episodeHelpers';
import { scheduleOwnedEpisodeDelete, scheduleOwnedEpisodeSync } from '@/lib/ownedEpisodeSync';

type PendingEpisodeReviewModalProps = {
  visible: boolean;
  items: PendingReviewEpisodeRef[];
  onChanged: () => void;
  onWrite: (item: PendingReviewEpisodeRef) => void;
};

export function PendingEpisodeReviewModal({
  visible,
  items,
  onChanged,
  onWrite,
}: PendingEpisodeReviewModalProps) {
  const content = useContentColors();
  const currentItem = items[0] ?? null;

  if (!visible || !currentItem) {
    return null;
  }

  const progressLabel = items.length > 1 ? `残り ${items.length} 件` : '';

  const handleLater = () => {
    initializeDatabase();
    dismissPendingReviewPrompt(currentItem.episode.id);
    scheduleOwnedEpisodeSync(currentItem.episode.id);
    onChanged();
  };

  const handleDelete = () => {
    Alert.alert('本当に削除しますか？', 'この自動生成エピソードを削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          initializeDatabase();
          const myselfId = getMyself();
          if (!myselfId) {
            Alert.alert('エラー', '本人が設定されていません。');
            return;
          }
          const ownerId = resolveEpisodeRecordOwnerId(currentItem.episode, currentItem.friendId);
          const deleted = deleteEpisode(ownerId, currentItem.episode.id);
          if (!deleted) {
            Alert.alert('エラー', 'エピソードの削除に失敗しました。');
            return;
          }
          scheduleOwnedEpisodeDelete(currentItem.episode.id);
          onChanged();
        },
      },
    ]);
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleLater}>
      <View style={styles.backdrop}>
        <View style={[styles.card, contentSurfaceStyle(content)]}>
          <Text style={[styles.heading, contentTextStyle(content)]}>
            エピソードが自動生成されました
          </Text>
          {progressLabel ? (
            <Text style={[styles.progress, contentMutedTextStyle(content)]}>{progressLabel}</Text>
          ) : null}
          <Text style={[styles.title, contentTextStyle(content)]} numberOfLines={2}>
            {currentItem.episode.title}
          </Text>
          <Text style={[styles.meta, contentMutedTextStyle(content)]}>{currentItem.episode.date}</Text>

          <View style={styles.actions}>
            <Pressable style={[styles.secondaryButton, contentInputStyle(content)]} onPress={handleLater}>
              <Text style={[styles.secondaryButtonText, contentTextStyle(content)]}>後で</Text>
            </Pressable>
            <Pressable style={styles.dangerButton} onPress={handleDelete}>
              <Text style={styles.dangerButtonText}>削除する</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, contentFilledButtonStyle(content)]}
              onPress={() => onWrite(currentItem)}
            >
              <Text style={[styles.primaryButtonText, contentFilledButtonTextStyle(content)]}>
                記載する
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    backgroundColor: Theme.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: Spacing.md,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  progress: {
    marginTop: 4,
    fontSize: Typography.sm,
    color: Theme.textSecondary,
  },
  title: {
    marginTop: Spacing.sm,
    fontSize: Typography.base,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  meta: {
    marginTop: 4,
    fontSize: Typography.sm,
    color: Theme.textSecondary,
  },
  actions: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  secondaryButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.inputBg,
  },
  secondaryButtonText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  dangerButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
  },
  dangerButtonText: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: '#fff',
  },
  primaryButton: {
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
});
