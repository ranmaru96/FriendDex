import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { ParticipantChip } from '@/components/participant/ParticipantChip';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';
import { useContentColors } from '@/utils/useContentColors';

const HEADING_PHOTO_SIZE = 28;

export const EPISODE_UNREAD_MARK_COLOR = '#E11D48';

type EpisodeBylineProps = {
  name: string;
  friendId: string;
  photoUri?: string | null;
  /** heading は共有一覧と共有詳細の左上。chip は by と名前タグ */
  variant?: 'chip' | 'heading';
  /** 見出しの名前の横。このまとまりに未読があるとき */
  unread?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function EpisodeByline({
  name,
  friendId,
  photoUri,
  variant = 'chip',
  unread = false,
  style,
}: EpisodeBylineProps) {
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const content = useContentColors();
  const label = name.trim();
  if (!label) {
    return null;
  }
  if (variant === 'heading') {
    const photo = photoUri?.trim();
    const variantId = appTheme?.variant;
    const shape = appTheme?.shape;
    const photoRadius = shape?.cardBorderRadius ?? 8;
    const offset = usesOffsetChrome(appTheme?.patternId);
    const outerBorderWidth = offset ? 0 : variantId === 'white' ? 1 : (shape?.cardBorderWidth ?? 1);
    const innerBorderWidth = offset ? 0 : 2;
    const initial = label.charAt(0) || '?';
    return (
      <View style={[styles.heading, style]}>
        <View
          style={[
            styles.headingPhotoOuter,
            {
              borderColor: variantId === 'white' ? content.contentTextSecondary : content.contentBorder,
              borderWidth: outerBorderWidth,
              borderRadius: photoRadius,
            },
          ]}
        >
          <View
            style={[
              styles.headingPhotoInner,
              {
                borderColor: content.contentPhotoInnerBorder,
                borderWidth: innerBorderWidth,
                borderRadius: Math.max(0, photoRadius - 2),
                backgroundColor: content.contentPhotoPlaceholder,
              },
            ]}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={styles.headingPhotoImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.headingPhotoInitial, { color: content.contentPhotoPlaceholderText }]}>
                {initial}
              </Text>
            )}
          </View>
        </View>
        <Text style={[styles.headingName, { color: content.contentText }]} numberOfLines={1}>
          {label}
        </Text>
        {unread ? <View accessibilityLabel="未読" style={styles.unreadDot} /> : null}
      </View>
    );
  }

  const chip: ParticipantChipDisplay = {
    id: friendId || label,
    kind: 'individual',
    label,
    friendId: friendId || undefined,
    photoUri,
  };

  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.by, { color: content.contentTextSecondary }]}>by</Text>
      <ParticipantChip
        chip={chip}
        compact
        chipStyle={kit.participantChipStyle}
        chipBackgroundColor={
          isMonochromeAppTheme(appTheme?.variant) ? undefined : kit.participantChipBackground
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  by: {
    fontSize: 13,
    fontWeight: '600',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  headingPhotoOuter: {
    width: HEADING_PHOTO_SIZE,
    height: HEADING_PHOTO_SIZE,
    overflow: 'hidden',
  },
  headingPhotoInner: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingPhotoImage: {
    width: '100%',
    height: '100%',
  },
  headingPhotoInitial: {
    fontSize: 12,
    fontWeight: '800',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: EPISODE_UNREAD_MARK_COLOR,
  },
  headingName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
  },
});
