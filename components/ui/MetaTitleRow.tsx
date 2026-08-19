import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import {
  contentPersonTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

export type MetaTitleRowLayout = 'plain' | 'column' | 'badge' | 'stacked';

type MetaTitleRowProps = {
  meta: string;
  title: string;
  layout: MetaTitleRowLayout;
  emptyTitle?: string;
  /** タイトル右側（例: エピソード件数タグ） */
  titleTrailing?: ReactNode;
};

export function MetaTitleRow({
  meta,
  title,
  layout,
  emptyTitle = '（無題）',
  titleTrailing,
}: MetaTitleRowProps) {
  const content = useContentColors();
  const displayTitle = title || emptyTitle;
  const titleColor = contentTextStyle(content);
  const metaAccent = contentTextStyle(content);
  const badgeStyle = contentPersonTagStyle(content);
  const dividerColor = { backgroundColor: content.contentTextSecondary };

  const titleBlock = (numberOfLines: number, titleStyle: object) => (
    <View style={styles.titleWithTrailing}>
      <Text style={[titleStyle, titleColor]} numberOfLines={numberOfLines}>
        {displayTitle}
      </Text>
      {titleTrailing ?? null}
    </View>
  );

  if (layout === 'stacked') {
    return (
      <>
        <View style={[styles.metaBadge, badgeStyle]}>
          <Text style={[styles.metaBadgeText, contentTextStyle(content)]}>{meta}</Text>
        </View>
        {titleBlock(2, styles.stackedTitle)}
      </>
    );
  }

  if (layout === 'plain') {
    return (
      <View style={styles.row}>
        <Text style={[styles.metaPlain, metaAccent]} numberOfLines={2}>
          {meta}
        </Text>
        {titleBlock(2, styles.inlineTitle)}
      </View>
    );
  }

  if (layout === 'column') {
    return (
      <View style={[styles.row, styles.rowColumn]}>
        <Text style={[styles.metaColumn, metaAccent]} numberOfLines={3}>
          {meta}
        </Text>
        <View style={[styles.columnDivider, dividerColor]} />
        {titleBlock(3, styles.inlineTitle)}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={[styles.metaBadgeInRow, badgeStyle]}>
        <Text style={[styles.metaBadgeText, contentTextStyle(content)]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {titleBlock(1, styles.inlineTitle)}
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
    lineHeight: 16,
  },
  metaColumn: {
    width: 78,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  columnDivider: {
    width: Math.max(1, StyleSheet.hairlineWidth * 2),
    alignSelf: 'stretch',
  },
  titleWithTrailing: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
  },
  stackedTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
  },
  metaBadgeInRow: {
    flexShrink: 0,
    maxWidth: '48%',
    alignSelf: 'center',
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  metaBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  metaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
});
