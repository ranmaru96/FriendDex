import { useMemo } from 'react';
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { getScaledHomeCardPhotoCornerRadius } from '@/utils/homeCardPhotoMetrics';
import {
  PARTICIPANT_CHIP_FITTED_BORDER_RADIUS,
  PARTICIPANT_CHIP_FITTED_PHOTO_SIZE,
  participantChipStyles as styles,
} from '@/utils/participantChipStyles';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';

type ParticipantChipProps = {
  chip: ParticipantChipDisplay;
  compact?: boolean;
  chipBackgroundColor?: string;
  chipStyle?: 'default' | 'fitted';
  onPress?: () => void;
  onRemove?: () => void;
};

function FittedChipAvatar({
  photoUri,
  label,
  cornerRadius,
}: {
  photoUri?: string;
  label: string;
  cornerRadius: number;
}) {
  const initial = label.trim().slice(0, 1) || '?';

  return (
    <View style={[styles.avatarFittedOuter, { borderRadius: cornerRadius }]}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.avatarFittedImage} resizeMode="cover" />
      ) : (
        <View style={styles.avatarFittedPlaceholder}>
          <Text style={styles.avatarInitialCompact}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

export function ParticipantChip({
  chip,
  compact = false,
  chipBackgroundColor,
  chipStyle = 'default',
  onPress,
  onRemove,
}: ParticipantChipProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isGroup = chip.kind === 'group';
  const isFitted = chipStyle === 'fitted';
  const fittedPhotoCornerRadius = useMemo(
    () =>
      isFitted
        ? getScaledHomeCardPhotoCornerRadius(PARTICIPANT_CHIP_FITTED_PHOTO_SIZE, screenWidth, 4)
        : 0,
    [isFitted, screenWidth]
  );

  return (
    <View
      style={[
        styles.chip,
        compact && styles.chipCompact,
        isFitted && styles.chipFitted,
        isGroup && styles.chipGroup,
        chipBackgroundColor ? { backgroundColor: chipBackgroundColor } : null,
        isFitted ? { borderRadius: PARTICIPANT_CHIP_FITTED_BORDER_RADIUS } : null,
      ]}
    >
      <Pressable
        style={[styles.chipBody, isFitted && styles.chipBodyFitted, isGroup && styles.chipBodyGroup]}
        onPress={onPress}
        disabled={!onPress}
      >
        {!isGroup ? (
          isFitted ? (
            <FittedChipAvatar
              photoUri={chip.photoUri}
              label={chip.label}
              cornerRadius={fittedPhotoCornerRadius}
            />
          ) : chip.photoUri ? (
            <Image
              source={{ uri: chip.photoUri }}
              style={[styles.avatar, compact && styles.avatarCompact]}
            />
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
