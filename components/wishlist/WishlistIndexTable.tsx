import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EpisodeTagChip } from '@/components/episode/EpisodeTagChip';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { useContentColors } from '@/utils/useContentColors';
import { contentMutedTextStyle, contentTextStyle } from '@/utils/contentStyleHelpers';

export type WishlistIndexRow = {
  key: string;
  title: string;
  count: number;
  previews: string[];
};

type WishlistIndexTableProps = {
  rows: WishlistIndexRow[];
  onPressRow: (key: string) => void;
};

export function WishlistIndexTable({ rows, onPressRow }: WishlistIndexTableProps) {
  const content = useContentColors();

  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <OffsetCard key={row.key || '__unset'}>
          <Pressable
            style={styles.card}
            onPress={() => onPressRow(row.key)}
            accessibilityRole="button"
            accessibilityLabel={`${row.title}、${row.count}店`}
          >
            <View style={styles.topRow}>
              <Text style={[styles.title, contentTextStyle(content)]} numberOfLines={1}>
                {row.title}
              </Text>
              <Text style={[styles.count, contentMutedTextStyle(content)]}>{row.count}店</Text>
              <Ionicons name="chevron-forward" size={16} color={content.contentTextSecondary} />
            </View>
            {row.previews.length > 0 ? (
              <View style={styles.previewRow}>
                {row.previews.map((label) => (
                  <EpisodeTagChip key={label} label={label} />
                ))}
              </View>
            ) : null}
          </Pressable>
        </OffsetCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  card: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  count: {
    fontSize: 13,
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
