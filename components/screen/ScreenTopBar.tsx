import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Radius, Spacing, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { ToolTitlePlaque } from '@/components/screen/ToolTitlePlaque';

const TITLE_ADORNMENT_GAP = 8;

type ScreenTopBarProps = {
  title?: string;
  onBack?: () => void;
  backDisabled?: boolean;
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
  backDisabled = false,
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
      <Pressable
        style={[styles.sidePressable, backDisabled ? styles.backDisabled : null]}
        onPress={onBack}
        disabled={backDisabled}
        hitSlop={8}
      >
        <Text style={[styles.backText, { color: topBarText }, backTextStyle]}>{backLabel}</Text>
      </Pressable>
    ) : null);
  const trimmedTitle = title?.trim() ?? '';
  const [titleWidth, setTitleWidth] = useState(0);
  const handleTitleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setTitleWidth((current) => (current === nextWidth ? current : nextWidth));
  };
  const adornmentOffset = titleWidth > 0 ? titleWidth / 2 + TITLE_ADORNMENT_GAP : 0;

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
        <View style={styles.titleCenter}>
          {titleLeading != null ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.titleAdornment,
                styles.titleAdornmentLeading,
                { marginRight: adornmentOffset, opacity: titleWidth > 0 ? 1 : 0 },
              ]}
            >
              {titleLeading}
            </View>
          ) : null}
          {trimmedTitle ? (
            <View style={styles.titleMeasure} onLayout={handleTitleLayout}>
              {titleFramed ? (
                <ToolTitlePlaque title={trimmedTitle} titleStyle={titleStyle} />
              ) : (
                <Text
                  style={[styles.plainTitle, { color: topBarText }, titleStyle]}
                  numberOfLines={2}
                >
                  {trimmedTitle}
                </Text>
              )}
            </View>
          ) : null}
          {titleTrailing != null ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.titleAdornment,
                styles.titleAdornmentTrailing,
                { marginLeft: adornmentOffset, opacity: titleWidth > 0 ? 1 : 0 },
              ]}
            >
              {titleTrailing}
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.sideRight}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'visible',
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
  backDisabled: {
    opacity: 0.55,
  },
  titleSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    overflow: 'visible',
  },
  titleCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  titleMeasure: {
    maxWidth: '100%',
  },
  titleAdornment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleAdornmentLeading: {
    right: '50%',
  },
  titleAdornmentTrailing: {
    left: '50%',
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
