import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WishlistItem } from '@/types';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

type WishlistShopRowProps = {
  item: WishlistItem;
  meta?: string | null;
  onPress: () => void;
  onLongPress: () => void;
  onPressLink?: () => void;
};

export function WishlistShopRow({
  item,
  meta,
  onPress,
  onLongPress,
  onPressLink,
}: WishlistShopRowProps) {
  const content = useContentColors();

  return (
    <Pressable
      style={[styles.row, contentSurfaceStyle(content)]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`${item.name}を編集`}
    >
      <View style={styles.body}>
        <Text style={[styles.name, contentTextStyle(content)]}>{item.name}</Text>
        {meta ? (
          <Text style={[styles.meta, contentMutedTextStyle(content)]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {item.memo ? (
          <Text style={[styles.memo, contentMutedTextStyle(content)]} numberOfLines={2}>
            {item.memo}
          </Text>
        ) : null}
      </View>
      {item.link && onPressLink ? (
        <Pressable
          onPress={onPressLink}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="リンクを開く"
          style={styles.linkBtn}
        >
          <Ionicons name="open-outline" size={18} color={content.contentText} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
  },
  memo: {
    fontSize: 13,
    lineHeight: 18,
  },
  linkBtn: {
    paddingTop: 2,
  },
});
