import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Radius, Spacing, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { ToolTitlePlaque } from '@/components/screen/ToolTitlePlaque';

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
  /** true のときタイトルを角の〇付き囲いで表示（ツール画面のみ） */
  titleFramed?: boolean;
  /** subScreen: screenBase 背景＋テーマ文字色。plain: 背景なし（カメラ黒画面など） */
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
  titleFramed = false,
  variant = 'subScreen',
  style,
  backTextStyle,
  titleStyle,
}: ScreenTopBarProps) {
  const appTheme = useAppThemeOptional();
  const barBackground =
    appTheme?.colors.headerBackground ?? appTheme?.colors.screenBackground ?? Theme.screenBase;
  const topBarText = appTheme?.colors.topBarText ?? Theme.topBarText;
  const topBarBorder = appTheme?.colors.topBarBorder ?? Theme.topBarBorder;

  const leftContent =
    left ??
    (onBack ? (
      <Pressable style={styles.sidePressable} onPress={onBack} hitSlop={8}>
        <Text style={[styles.backText, { color: topBarText }, backTextStyle]}>{backLabel}</Text>
      </Pressable>
    ) : null);
  const hasTitleAdornment = titleLeading != null || titleTrailing != null;
  const trimmedTitle = title?.trim() ?? '';

  return (
    <View
      style={[
        styles.bar,
        variant === 'subScreen' && {
          backgroundColor: barBackground,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: topBarBorder,
        },
        style,
      ]}
    >
      <View style={styles.sideLeft}>{leftContent}</View>
      <View style={styles.titleSlot}>
        {hasTitleAdornment ? <View style={styles.titleSide}>{titleLeading ?? null}</View> : null}
        <View style={styles.titleCenter}>
          {trimmedTitle ? (
            titleFramed ? (
              <ToolTitlePlaque title={trimmedTitle} titleStyle={titleStyle} />
            ) : (
              <Text
                style={[styles.plainTitle, { color: topBarText }, titleStyle]}
                numberOfLines={2}
              >
                {trimmedTitle}
              </Text>
            )
          ) : null}
        </View>
        {hasTitleAdornment ? <View style={styles.titleSide}>{titleTrailing ?? null}</View> : null}
      </View>
      <View style={styles.sideRight}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 0,
    gap: Spacing.sm,
    minHeight: 44,
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
  titleSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  titleCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleSide: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
  },
  plainTitle: {
    fontSize: 15,
    fontWeight: '700',
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
