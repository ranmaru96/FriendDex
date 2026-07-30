import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { HomeCardElevation, Radius, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { computeProfileCompleteness, getHomeCardBorderStyle } from '@/utils/profileCompleteness';
import type { Friend } from '../../types';

/** Stable 既定値（シャッフル等・UiKit 未参照の箇所用） */
export const FRIEND_HOME_CARD_GAP = 10;

type FriendHomeCardProps = {
  friend: Friend;
  width?: number;
  isMyself?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: StyleProp<ViewStyle>;
};

export function FriendHomeCard({
  friend,
  width,
  isMyself = false,
  onPress,
  onLongPress,
  delayLongPress,
  style,
}: FriendHomeCardProps) {
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const [imageError, setImageError] = useState(false);
  const hasPhoto = Boolean(friend.photoUri?.trim()) && !imageError;
  const completeness = computeProfileCompleteness(friend, hasPhoto);
  const cardBorder = getHomeCardBorderStyle(completeness);
  const cardElevation = appTheme?.colors.homeCardElevation ?? HomeCardElevation;

  const cardOuterStyle = [
    styles.cardOuter,
    {
      borderColor: cardBorder.borderColor,
      borderWidth: Theme.homeCardBorderWidth,
    },
  ];

  const inner = (
    <>
      {isMyself ? (
        <View style={styles.myselfBadge} pointerEvents="none">
          <Text style={styles.myselfBadgeText}>本人</Text>
        </View>
      ) : null}
      <View style={[styles.photoOuterFrame, { borderColor: cardBorder.borderColor }]}>
        <View style={styles.photoInnerFrame}>
          {friend.photoUri && !imageError ? (
            <Image
              source={{ uri: friend.photoUri }}
              style={styles.cardPhoto}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
              <Text style={styles.cardPhotoPlaceholderText}>No Image</Text>
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
        <Text style={styles.cardMainName}>{friend.name}</Text>
      </View>
    </>
  );

  return (
    <View style={[styles.cardShadow, cardElevation, width != null ? { width } : null, style]}>
      {onPress || onLongPress ? (
        <Pressable
          style={cardOuterStyle}
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={delayLongPress}
        >
          {inner}
        </Pressable>
      ) : (
        <View style={cardOuterStyle}>{inner}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
  },
  cardOuter: {
    borderRadius: Radius.md,
    backgroundColor: Theme.card,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  photoOuterFrame: {
    marginTop: -2,
    marginLeft: -2,
    marginRight: -2,
    borderWidth: 2,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  photoInnerFrame: {
    borderWidth: 2,
    borderColor: Theme.homeCardPhotoInnerBorder,
    borderRadius: Radius.md - 2,
    overflow: 'hidden',
  },
  myselfBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 3,
    backgroundColor: Theme.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.accent,
  },
  myselfBadgeText: {
    color: Theme.onAccent,
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
    backgroundColor: Theme.homeCardPhotoPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhotoPlaceholderText: {
    fontSize: 12,
    color: Theme.homeCardPhotoPlaceholderText,
  },
  cardMainName: {
    width: '100%',
    fontSize: 13,
    fontWeight: '800',
    color: Theme.homeCardName,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
