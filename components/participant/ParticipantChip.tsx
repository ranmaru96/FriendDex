import { useMemo } from 'react';
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getScaledHomeCardPhotoCornerRadius } from '@/utils/homeCardPhotoMetrics';
import {
  PARTICIPANT_CHIP_FITTED_BORDER_RADIUS,
  PARTICIPANT_CHIP_FITTED_PHOTO_SIZE,
  participantChipStyles as styles,
} from '@/utils/participantChipStyles';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { contentPersonTagStyle, contentTagTextStyle } from '@/utils/contentStyleHelpers';

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
  cornerRadius,
}: {
  photoUri: string;
  cornerRadius: number;
}) {
  return (
    <View style={[styles.avatarFittedOuter, { borderRadius: cornerRadius }]}>
      <Image source={{ uri: photoUri }} style={styles.avatarFittedImage} resizeMode="cover" />
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
  const content = useContentColors();
  const { width: screenWidth } = useWindowDimensions();
  const isGroup = chip.kind === 'group';
  const hasPhoto = Boolean(!isGroup && chip.photoUri?.trim());
  const isFitted = chipStyle === 'fitted';
  const fittedPhotoCornerRadius = useMemo(
    () =>
      isFitted
        ? getScaledHomeCardPhotoCornerRadius(PARTICIPANT_CHIP_FITTED_PHOTO_SIZE, screenWidth, 4)
        : 0,
    [isFitted, screenWidth]
  );
  const photoUri = chip.photoUri?.trim() || undefined;
  const fittedRadius = isFitted ? PARTICIPANT_CHIP_FITTED_BORDER_RADIUS : undefined;
  const groupIconSize = isFitted ? 14 : compact ? 14 : 16;

  return (
    <View
      style={[
        styles.chip,
        contentPersonTagStyle(content),
        compact && styles.chipCompact,
        isFitted && styles.chipFitted,
        (isGroup || !hasPhoto) && styles.chipTextOnly,
        isGroup && styles.chipGroupBorder,
        chipBackgroundColor ? { backgroundColor: chipBackgroundColor } : null,
        fittedRadius != null ? { borderRadius: fittedRadius } : null,
      ]}
    >
      <Pressable
        style={[
          styles.chipBody,
          isFitted && styles.chipBodyFitted,
          (isGroup || !hasPhoto) && styles.chipBodyTextOnly,
        ]}
        onPress={onPress}
        disabled={!onPress}
      >
        {isGroup ? (
          <Ionicons
            name="people-outline"
            size={groupIconSize}
            color={content.contentTextSecondary}
          />
        ) : null}
        {hasPhoto && photoUri ? (
          isFitted ? (
            <FittedChipAvatar photoUri={photoUri} cornerRadius={fittedPhotoCornerRadius} />
          ) : (
            <Image
              source={{ uri: photoUri }}
              style={[styles.avatar, compact && styles.avatarCompact]}
            />
          )
        ) : null}
        <Text style={[styles.name, compact && styles.nameCompact, contentTagTextStyle(content)]}>
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
          <Text style={[styles.removeButtonText, { color: content.contentTextSecondary }]}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
