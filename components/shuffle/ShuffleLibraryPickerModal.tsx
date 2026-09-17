import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Radius, Typography } from '@/constants/theme';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';
import type { ShufflePool } from '../../types';

type ShuffleLibraryPickerModalProps = {
  visible: boolean;
  pools: ShufflePool[];
  onSelect: (pool: ShufflePool) => void;
  onDelete: (pool: ShufflePool) => void;
  onClose: () => void;
  buildChipsForPool: (pool: ShufflePool) => ParticipantChipDisplay[];
};

export function ShuffleLibraryPickerModal({
  visible,
  pools,
  onSelect,
  onDelete,
  onClose,
  buildChipsForPool,
}: ShuffleLibraryPickerModalProps) {
  const content = useContentColors();

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, contentSurfaceStyle(content)]}>
          <Text style={[styles.title, contentTextStyle(content)]}>履歴から引用</Text>
          <Text style={[styles.description, contentMutedTextStyle(content)]}>
            保存済みの集団を選ぶと、メンバー欄に読み込まれます。
          </Text>
          {pools.length === 0 ? (
            <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
              保存された集団はまだありません。{'\n'}シャッフル実行後に保存されます。
            </Text>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {pools.map((pool) => {
                const chips = buildChipsForPool(pool);
                return (
                  <Pressable
                    key={pool.id}
                    style={[styles.poolCard, contentSurfaceStyle(content)]}
                    onPress={() => onSelect(pool)}
                    onLongPress={() => onDelete(pool)}
                    delayLongPress={300}
                  >
                    <Text style={[styles.poolTitle, contentTextStyle(content)]} numberOfLines={1}>
                      {pool.label}
                    </Text>
                    {chips.length > 0 ? (
                      <ParticipantChipList chips={chips} compact layout="scroll" />
                    ) : null}
                    <Text style={[styles.poolMeta, contentMutedTextStyle(content)]}>
                      {pool.memberIds.length}人 · 長押しで削除
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable style={[styles.closeButton, contentSurfaceStyle(content)]} onPress={onClose}>
            <Text style={[styles.closeButtonText, contentTextStyle(content)]}>閉じる</Text>
          </Pressable>
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
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 20,
    maxHeight: '80%',
    gap: 10,
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: '700',
  },
  description: {
    fontSize: Typography.sm,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: Typography.sm,
    lineHeight: 20,
    paddingVertical: 12,
  },
  list: {
    maxHeight: 360,
  },
  poolCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  poolTitle: {
    fontSize: Typography.base,
    fontWeight: '700',
  },
  poolMeta: {
    fontSize: 11,
  },
  closeButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  closeButtonText: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
});
