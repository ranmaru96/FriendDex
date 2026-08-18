import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { HomeCardElevation } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { withAlpha } from '@/utils/colorHelpers';
import { useContentColors } from '@/utils/useContentColors';
import type { Friend } from '../../types';

/** Stable 既定値（シャッフル等・UiKit 未参照の箇所用） */
export const FRIEND_HOME_CARD_GAP = 10;

type FriendHomeCardProps = {
  friend: Friend;
  width?: number;
  isMyself?: boolean;
  /** 一覧で誕生月絞り込み中など、右上に月日を出す（本人マークと同型） */
  birthdayBadgeText?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: StyleProp<ViewStyle>;
};

/** YYYY-MM-DD → `M/D`。不正なら null */
export function formatFriendBirthdayBadge(birthday: string | null | undefined): string | null {
  const trimmed = typeof birthday === 'string' ? birthday.trim() : '';
  if (!trimmed) return null;
  const parts = trimmed.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const month = parts[1];
  const day = parts[2];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${month}/${day}`;
}

export function FriendHomeCard({
  friend,
  width,
  isMyself = false,
  birthdayBadgeText = null,
  onPress,
  onLongPress,
  delayLongPress,
  style,
}: FriendHomeCardProps) {
  const kit = useUiKit();
  const { shape } = useAppTheme();
  const content = useContentColors();
  const [imageError, setImageError] = useState(false);
  const cardBorderWidth = shape.cardBorderWidth;
  const photoRadius = shape.cardBorderRadius;
  const normalizedBirthdayBadge = birthdayBadgeText?.trim() ? birthdayBadgeText.trim() : null;
  const birthdayBadgeStyle = {
    backgroundColor: withAlpha(content.contentCard, 0.95),
    borderColor: content.contentBorder,
  };
  const myselfBadgeStyle = {
    backgroundColor: withAlpha(content.contentCard, 0.45),
  };
  const badgeTextStyle = { color: content.contentText };

  const inner = (
    <>
      {isMyself ? (
        <View style={[styles.myselfBadge, myselfBadgeStyle]} pointerEvents="none">
          <Text style={[styles.cornerBadgeText, badgeTextStyle]}>me</Text>
        </View>
      ) : null}
      {normalizedBirthdayBadge != null ? (
        <View style={styles.birthdayBadgeStack} pointerEvents="none">
          <View style={[styles.cornerBadge, birthdayBadgeStyle]}>
            <Text style={[styles.cornerBadgeText, badgeTextStyle]}>{normalizedBirthdayBadge}</Text>
          </View>
        </View>
      ) : null}
      <View
        style={[
          styles.photoOuterFrame,
          {
            borderColor: content.contentBorder,
            borderWidth: cardBorderWidth,
            borderRadius: photoRadius,
            marginTop: -cardBorderWidth,
            marginLeft: -cardBorderWidth,
            marginRight: -cardBorderWidth,
          },
        ]}
      >
        <View
          style={[
            styles.photoInnerFrame,
            {
              borderColor: content.contentPhotoInnerBorder,
              borderRadius: Math.max(0, photoRadius - 2),
            },
          ]}
        >
          {friend.photoUri && !imageError ? (
            <Image
              source={{ uri: friend.photoUri }}
              style={styles.cardPhoto}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View
              style={[
                styles.cardPhoto,
                styles.cardPhotoPlaceholder,
                { backgroundColor: content.contentPhotoPlaceholder },
              ]}
            >
              <Text style={[styles.cardPhotoPlaceholderText, { color: content.contentPhotoPlaceholderText }]}>
                No Image
              </Text>
            </View>
          )}
        </View>
      </View>
      <View
        style={[
          styles.cardTextBlock,
          { paddingVertical: kit.friendHomeCardNamePaddingVertical },
        ]}
      >
        <Text style={[styles.cardMainName, { color: content.contentCardName }]}>{friend.name}</Text>
      </View>
    </>
  );

  return (
    <OffsetCard
      style={[
        width != null ? { width } : null,
        shape.offsetDistance === 0 ? HomeCardElevation : null,
        style,
      ]}
      contentStyle={styles.cardOuter}
    >
      {onPress || onLongPress ? (
        <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={delayLongPress}>
          {inner}
        </Pressable>
      ) : (
        inner
      )}
    </OffsetCard>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    paddingBottom: 4,
  },
  photoOuterFrame: {
    overflow: 'hidden',
  },
  photoInnerFrame: {
    borderWidth: 2,
    overflow: 'hidden',
  },
  myselfBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
  },
  birthdayBadgeStack: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 3,
    alignItems: 'flex-end',
  },
  cornerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  cornerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardTextBlock: {
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhoto: {
    width: '100%',
    aspectRatio: 1,
  },
  cardPhotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhotoPlaceholderText: {
    fontSize: 12,
  },
  cardMainName: {
    width: '100%',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
