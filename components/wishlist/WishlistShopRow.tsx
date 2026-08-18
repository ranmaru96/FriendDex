import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EpisodeTagChip } from '@/components/episode/EpisodeTagChip';
import { OffsetCard } from '@/components/ui/OffsetCard';
import type { WishlistItem } from '@/types';
import { getHashedEpisodeTagColor } from '@/utils/calendarEventColors';
import { useContentColors } from '@/utils/useContentColors';
import { contentMutedTextStyle, contentTextStyle } from '@/utils/contentStyleHelpers';

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
  const quoteColor = getHashedEpisodeTagColor(item.cuisine || item.name);

  return (
    <OffsetCard>
      <Pressable
        style={styles.card}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={`${item.name}を編集`}
      >
        <View style={styles.header}>
          <Text style={[styles.name, contentTextStyle(content)]} numberOfLines={1}>
            {item.name}
          </Text>
          {meta ? <EpisodeTagChip label={meta} /> : null}
          {item.link && onPressLink ? (
            <Pressable
              onPress={onPressLink}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel="リンクを開く"
            >
              <Ionicons name="open-outline" size={16} color={content.contentText} />
            </Pressable>
          ) : null}
        </View>
        {item.memo ? (
          <View style={[styles.quote, { borderLeftColor: quoteColor }]}>
            <Text style={[styles.quoteText, contentMutedTextStyle(content)]} numberOfLines={1}>
              {item.memo}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </OffsetCard>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: 8,
  },
  quoteText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
