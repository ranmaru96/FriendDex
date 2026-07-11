import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Spacing, Theme } from '@/constants/theme';

type CompactSectionHeaderProps = {
  title: string;
  /** 件数。省略時は countSuffix も表示しない */
  count?: number;
  countSuffix?: string;
  variant?: 'compact' | 'classic';
  edgeToEdge?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function CompactSectionHeader({
  title,
  count,
  countSuffix = '件',
  variant = 'compact',
  edgeToEdge = false,
  style,
}: CompactSectionHeaderProps) {
  const showCount = count != null;

  return (
    <View
      style={[
        variant === 'compact' ? styles.compactHeader : styles.classicHeader,
        edgeToEdge ? styles.edgeToEdge : null,
        style,
      ]}
    >
      <Text
        style={variant === 'compact' ? styles.compactTitle : styles.classicTitle}
        numberOfLines={1}
      >
        {title}
      </Text>
      {showCount ? (
        <Text style={styles.count}>
          {count}
          {countSuffix}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  classicHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: 2,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  edgeToEdge: {
    paddingHorizontal: Spacing.sm,
  },
  classicTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.card,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
});
