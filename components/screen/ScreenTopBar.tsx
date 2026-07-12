import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Radius, Spacing, Theme } from '@/constants/theme';
import { subScreenHeaderStyles } from './subScreenHeaderStyles';

type ScreenTopBarProps = {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  left?: ReactNode;
  right?: ReactNode;
  /** 中央タイトルの左側（前後移動ボタンなど） */
  titleLeading?: ReactNode;
  /** 中央タイトルの右側 */
  titleTrailing?: ReactNode;
  /** subScreen: screenBase 背景＋白文字。plain: 背景なし（カメラ黒画面など） */
  variant?: 'subScreen' | 'plain';
  style?: ViewStyle;
  backTextStyle?: TextStyle;
  titleStyle?: TextStyle;
};

export function ScreenTopBar({
  title,
  onBack,
  backLabel = '‹ 戻る',
  left,
  right,
  titleLeading,
  titleTrailing,
  variant = 'subScreen',
  style,
  backTextStyle,
  titleStyle,
}: ScreenTopBarProps) {
  const leftContent =
    left ??
    (onBack ? (
      <Pressable style={styles.sidePressable} onPress={onBack} hitSlop={8}>
        <Text style={[styles.backText, backTextStyle]}>{backLabel}</Text>
      </Pressable>
    ) : null);

  return (
    <View
      style={[
        styles.bar,
        variant === 'subScreen' && styles.barSubScreen,
        style,
      ]}
    >
      <View style={styles.sideLeft}>{leftContent}</View>
      {titleLeading != null || titleTrailing != null ? (
        <View style={styles.titleRow}>
          <View style={styles.titleSide}>{titleLeading ?? null}</View>
          <Text style={[styles.title, titleStyle]} numberOfLines={1}>
            {title ?? ''}
          </Text>
          <View style={styles.titleSide}>{titleTrailing ?? null}</View>
        </View>
      ) : (
        <Text style={[styles.title, titleStyle]} numberOfLines={1}>
          {title ?? ''}
        </Text>
      )}
      <View style={styles.sideRight}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    minHeight: 48,
  },
  barSubScreen: {
    backgroundColor: Theme.screenBase,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.topBarBorder,
  },
  sideLeft: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  sideRight: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  sidePressable: {
    minHeight: 44,
    justifyContent: 'center',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: 2,
  },
  titleSide: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: subScreenHeaderStyles.backText,
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: Theme.topBarText,
    textAlign: 'center',
  },
});

export const screenTopBarIconButtonStyle = {
  width: 44,
  height: 44,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  borderRadius: Radius.sm,
};
