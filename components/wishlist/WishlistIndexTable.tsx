import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

export type WishlistIndexRow = {
  key: string;
  title: string;
  count: number;
};

type WishlistIndexTableProps = {
  rows: WishlistIndexRow[];
  onPressRow: (key: string) => void;
};

export function WishlistIndexTable({ rows, onPressRow }: WishlistIndexTableProps) {
  const content = useContentColors();

  return (
    <View style={[styles.table, contentSurfaceStyle(content)]}>
      {rows.map((row, index) => (
        <Fragment key={row.key || '__unset'}>
          {index > 0 ? (
            <View style={[styles.divider, { backgroundColor: content.contentBorder }]} />
          ) : null}
          <Pressable
            style={styles.row}
            onPress={() => onPressRow(row.key)}
            accessibilityRole="button"
            accessibilityLabel={`${row.title}、${row.count}件`}
          >
            <Text style={[styles.title, contentTextStyle(content)]} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={[styles.count, contentMutedTextStyle(content)]}>{row.count}件</Text>
            <Ionicons name="chevron-forward" size={18} color={content.contentTextSecondary} />
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  row: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  count: {
    fontSize: 13,
    fontWeight: '600',
  },
});
