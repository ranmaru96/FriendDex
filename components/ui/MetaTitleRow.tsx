import { StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing, Theme } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';

export type MetaTitleRowLayout = 'plain' | 'column' | 'badge' | 'stacked';

type MetaTitleRowProps = {
  meta: string;
  title: string;
  layout: MetaTitleRowLayout;
  emptyTitle?: string;
};

export function MetaTitleRow({
  meta,
  title,
  layout,
  emptyTitle = '（無題）',
}: MetaTitleRowProps) {
  const content = useContentColors();
  const displayTitle = title || emptyTitle;
  const titleColor = { color: content.contentText };
  const dividerColor = { backgroundColor: content.contentTextSecondary };

  if (layout === 'stacked') {
    return (
      <>
        <View style={styles.metaBadge}>
          <Text style={styles.metaBadgeText}>{meta}</Text>
        </View>
        <Text style={[styles.stackedTitle, titleColor]}>{displayTitle}</Text>
      </>
    );
  }

  if (layout === 'plain') {
    return (
      <View style={styles.row}>
        <Text style={styles.metaPlain} numberOfLines={2}>
          {meta}
        </Text>
        <Text style={[styles.inlineTitle, titleColor]} numberOfLines={2}>
          {displayTitle}
        </Text>
      </View>
    );
  }

  if (layout === 'column') {
    return (
      <View style={[styles.row, styles.rowColumn]}>
        <Text style={styles.metaColumn} numberOfLines={3}>
          {meta}
        </Text>
        <View style={[styles.columnDivider, dividerColor]} />
        <Text style={[styles.inlineTitle, titleColor]} numberOfLines={3}>
          {displayTitle}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.metaBadgeInRow}>
        <Text style={styles.metaBadgeText} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={[styles.inlineTitle, titleColor]} numberOfLines={1}>
        {displayTitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowColumn: {
    alignItems: 'stretch',
  },
  metaPlain: {
    flexShrink: 0,
    maxWidth: '46%',
    fontSize: 12,
    fontWeight: '600',
    color: Theme.accent,
    lineHeight: 16,
  },
  metaColumn: {
    width: 78,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    color: Theme.accent,
    lineHeight: 15,
  },
  columnDivider: {
    width: Math.max(1, StyleSheet.hairlineWidth * 2),
    alignSelf: 'stretch',
  },
  inlineTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
  },
  stackedTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  metaBadgeInRow: {
    flexShrink: 0,
    maxWidth: '48%',
    alignSelf: 'center',
    backgroundColor: Theme.accentLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  metaBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Theme.accentLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  metaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.accent,
    flexShrink: 1,
  },
});
