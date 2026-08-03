import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { Spacing, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';

type CompactSectionHeaderProps = {
  title: string;
  /** 件数。省略時は countSuffix も表示しない */
  count?: number;
  countSuffix?: string;
  variant?: 'compact' | 'classic';
  edgeToEdge?: boolean;
  /** 行の右端（例: 追加ボタン） */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function CompactSectionHeader({
  title,
  count,
  countSuffix = '件',
  variant = 'compact',
  edgeToEdge = false,
  right,
  style,
}: CompactSectionHeaderProps) {
  const appTheme = useAppThemeOptional();
  const showCount = count != null;
  const isMonochrome = isMonochromeAppTheme(appTheme?.variant);
  const isBlack = appTheme?.variant === 'black';
  const titleColor = appTheme?.colors.onScreenText ?? '#FFFFFF';
  const countColor = appTheme?.colors.onScreenTextSecondary ?? Theme.textSecondary;

  if (isMonochrome) {
    return (
      <View
        style={[
          styles.monoRow,
          right ? styles.monoRowWithRight : null,
          edgeToEdge ? styles.edgeToEdge : null,
          style,
        ]}
      >
        <View
          style={[styles.monoChip, isBlack ? styles.monoChipBlack : styles.monoChipWhite]}
        >
          <Text
            style={[
              variant === 'compact' ? styles.compactTitle : styles.classicTitle,
              { color: titleColor },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {showCount ? (
            <Text style={[styles.count, { color: countColor }]}>
              {count}
              {countSuffix}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.rightSlot}>{right}</View> : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.band,
        variant === 'compact' ? styles.compactHeader : styles.classicHeader,
        edgeToEdge ? styles.edgeToEdge : null,
        style,
      ]}
    >
      <Text
        style={[
          variant === 'compact' ? styles.compactTitle : styles.classicTitle,
          { color: titleColor },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={styles.bandTrailing}>
        {showCount ? (
          <Text style={[styles.count, { color: countColor }]}>
            {count}
            {countSuffix}
          </Text>
        ) : null}
        {right ? <View style={styles.rightSlot}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  bandTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  monoRow: {
    alignItems: 'flex-start',
  },
  monoRowWithRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  monoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  monoChipWhite: {
    backgroundColor: '#f3f4f6',
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  monoChipBlack: {
    backgroundColor: '#2a2a2a',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  rightSlot: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  classicHeader: {
    paddingHorizontal: 2,
  },
  compactHeader: {
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  edgeToEdge: {
    paddingHorizontal: Spacing.sm,
  },
  classicTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  count: {
    fontSize: 12,
    fontWeight: '600',
  },
});
