import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import type { DesignPatternId, DesignPatternShape } from '@/constants/designPatterns';
import { Theme } from '@/constants/theme';

type ToolTitlePlaqueProps = {
  title: string;
  titleStyle?: TextStyle;
};

type PlaqueChrome = {
  borderWidth: number;
  borderRadius: number;
  borderColor: string;
  rivetSize: number;
  rivetInset: number;
  rivetFilled: boolean;
  rivetColor: string;
  letterSpacing: number;
};

function resolvePlaqueChrome(
  patternId: DesignPatternId | undefined,
  shape: DesignPatternShape | undefined,
  colors: {
    cyan: string;
    cardInk: string;
    headerBorder: string;
    topBarText: string;
    topBarBorder: string;
  }
): PlaqueChrome {
  if (patternId === 'codex' && shape) {
    return {
      borderWidth: Math.max(1.5, shape.cardBorderWidth),
      borderRadius: shape.innerRadius,
      borderColor: colors.cyan,
      rivetSize: 5,
      rivetInset: 3,
      rivetFilled: false,
      rivetColor: colors.cyan,
      letterSpacing: shape.kickerLetterSpacing,
    };
  }
  if (patternId === 'catalog' && shape) {
    return {
      borderWidth: 1,
      borderRadius: Math.max(2, shape.innerRadius - 1),
      borderColor: colors.headerBorder,
      rivetSize: 3,
      rivetInset: 2,
      rivetFilled: true,
      rivetColor: colors.cardInk,
      letterSpacing: shape.kickerLetterSpacing,
    };
  }
  return {
    borderWidth: 1,
    borderRadius: shape?.innerRadius ?? 6,
    borderColor: colors.topBarBorder,
    rivetSize: 4,
    rivetInset: 3,
    rivetFilled: true,
    rivetColor: colors.topBarText,
    letterSpacing: 0,
  };
}

function CornerRivet({
  size,
  inset,
  filled,
  color,
  corner,
}: {
  size: number;
  inset: number;
  filled: boolean;
  color: string;
  corner: 'tl' | 'tr' | 'bl' | 'br';
}) {
  const offset =
    corner === 'tl'
      ? { top: inset, left: inset }
      : corner === 'tr'
        ? { top: inset, right: inset }
        : corner === 'bl'
          ? { bottom: inset, left: inset }
          : { bottom: inset, right: inset };

  return (
    <View
      pointerEvents="none"
      style={[
        styles.rivet,
        offset,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: filled ? color : 'transparent',
          borderWidth: filled ? 0 : Math.max(1, size * 0.28),
          borderColor: filled ? 'transparent' : color,
        },
      ]}
    />
  );
}

export function ToolTitlePlaque({ title, titleStyle }: ToolTitlePlaqueProps) {
  const appTheme = useAppThemeOptional();
  const chrome = resolvePlaqueChrome(appTheme?.patternId, appTheme?.shape, {
    cyan: appTheme?.patternColors.cyan ?? Theme.accent,
    cardInk: appTheme?.patternColors.cardInk ?? Theme.heading,
    headerBorder: appTheme?.patternColors.headerBorder ?? Theme.border,
    topBarText: appTheme?.colors.topBarText ?? Theme.topBarText,
    topBarBorder: appTheme?.colors.topBarBorder ?? Theme.topBarBorder,
  });
  const textColor = appTheme?.colors.topBarText ?? Theme.topBarText;
  const longTitle = title.length > 10;
  const letterSpacing = longTitle ? 0 : chrome.letterSpacing;

  return (
    <View
      style={[
        styles.plaque,
        {
          borderWidth: chrome.borderWidth,
          borderRadius: chrome.borderRadius,
          borderColor: chrome.borderColor,
          paddingHorizontal: longTitle ? 8 : 16,
          alignSelf: longTitle ? 'stretch' : 'center',
        },
      ]}
    >
      <CornerRivet
        size={chrome.rivetSize}
        inset={chrome.rivetInset}
        filled={chrome.rivetFilled}
        color={chrome.rivetColor}
        corner="tl"
      />
      <CornerRivet
        size={chrome.rivetSize}
        inset={chrome.rivetInset}
        filled={chrome.rivetFilled}
        color={chrome.rivetColor}
        corner="tr"
      />
      <CornerRivet
        size={chrome.rivetSize}
        inset={chrome.rivetInset}
        filled={chrome.rivetFilled}
        color={chrome.rivetColor}
        corner="bl"
      />
      <CornerRivet
        size={chrome.rivetSize}
        inset={chrome.rivetInset}
        filled={chrome.rivetFilled}
        color={chrome.rivetColor}
        corner="br"
      />
      <Text
        style={[
          styles.title,
          longTitle ? styles.longTitle : null,
          { color: textColor, letterSpacing },
          longTitle ? { width: '100%' as const } : null,
          titleStyle,
        ]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  plaque: {
    maxWidth: '100%',
    paddingHorizontal: 16,
    paddingVertical: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rivet: {
    position: 'absolute',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  longTitle: {
    fontSize: 13,
    lineHeight: 17,
  },
});
