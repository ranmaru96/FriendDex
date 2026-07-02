import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Theme, Radius, Typography } from '@/constants/theme';
import { formatEpisodeEventMatchLabel, type EpisodeEventMatch } from '@/utils/eventEpisodeSync';

type EpisodeEventLinkModalProps = {
  visible: boolean;
  dateKey: string;
  candidates: EpisodeEventMatch[];
  onSelect: (eventId: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
};

export function EpisodeEventLinkModal({
  visible,
  dateKey,
  candidates,
  onSelect,
  onCreateNew,
  onCancel,
}: EpisodeEventLinkModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>紐づける予定を選択</Text>
          <Text style={styles.description}>
            同じ日付・参加者の予定が複数見つかりました。紐づける予定を選んでください。
          </Text>
          <ScrollView style={styles.options}>
            {candidates.map((candidate) => (
              <Pressable
                key={candidate.event.id}
                style={styles.option}
                onPress={() => onSelect(candidate.event.id)}
              >
                <Text style={styles.optionText}>
                  {formatEpisodeEventMatchLabel(candidate.event, dateKey)}
                </Text>
                <Text style={styles.overlapText}>参加者 {candidate.overlapCount} 人一致</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onCancel}>
              <Text style={styles.secondaryButtonText}>やめる</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onCreateNew}>
              <Text style={styles.secondaryButtonText}>新規作成</Text>
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
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.lg,
    padding: 20,
    maxHeight: '80%',
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 8,
  },
  description: {
    fontSize: Typography.sm,
    color: Theme.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  options: {
    maxHeight: 280,
    marginBottom: 12,
  },
  option: {
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 8,
  },
  optionText: {
    fontSize: Typography.base,
    color: Theme.textPrimary,
    fontWeight: '600',
  },
  overlapText: {
    marginTop: 4,
    fontSize: Typography.sm,
    color: Theme.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
  },
  secondaryButtonText: {
    fontSize: Typography.sm,
    color: Theme.textPrimary,
    fontWeight: '600',
  },
});
