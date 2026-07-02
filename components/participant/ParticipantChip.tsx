import { Image, Pressable, Text, View } from 'react-native';
import { participantChipStyles as styles } from '@/utils/participantChipStyles';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';

type ParticipantChipProps = {
  chip: ParticipantChipDisplay;
  compact?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
};

export function ParticipantChip({ chip, compact = false, onPress, onRemove }: ParticipantChipProps) {
  const isGroup = chip.kind === 'group';

  return (
    <View style={[styles.chip, compact && styles.chipCompact, isGroup && styles.chipGroup]}>
      <Pressable
        style={[styles.chipBody, isGroup && styles.chipBodyGroup]}
        onPress={onPress}
        disabled={!onPress}
      >
        {!isGroup ? (
          chip.photoUri ? (
            <Image source={{ uri: chip.photoUri }} style={[styles.avatar, compact && styles.avatarCompact]} />
          ) : (
            <View style={[styles.avatarPlaceholder, compact && styles.avatarCompact]}>
              <Text style={[styles.avatarInitial, compact && styles.avatarInitialCompact]}>
                {chip.label.trim().slice(0, 1) || '?'}
              </Text>
            </View>
          )
        ) : null}
        <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1}>
          {chip.label}
        </Text>
      </Pressable>
      {onRemove ? (
        <Pressable
          style={styles.removeButton}
          onPress={onRemove}
          accessibilityLabel={`${chip.label}を解除`}
          hitSlop={6}
        >
          <Text style={styles.removeButtonText}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
