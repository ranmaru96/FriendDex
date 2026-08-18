import { blackAppTheme } from '@/constants/appThemes/black';
import { whiteAppTheme } from '@/constants/appThemes/white';
import { BorderWidth, Radius } from '@/constants/theme';
import type { AppThemeColors } from '@/constants/appThemes/types';
import type { DesignPattern, DesignPatternColors } from './types';

function fromAppThemeColors(colors: AppThemeColors, offset: string): DesignPatternColors {
  return {
    screen: colors.screenBackground,
    card: colors.contentCard,
    cardInk: colors.contentText,
    cardMuted: colors.contentTextSecondary,
    accent: colors.tabBarActivePill,
    accentSoft: colors.contentPersonTagBg,
    cyan: colors.contentSearchFieldBorder,
    gold: colors.onScreenTextSecondary,
    offset,
    headerBg: colors.contentSearchArea,
    headerBorder: colors.contentSearchFieldBorder,
    chipBg: colors.contentPersonTagBg,
    chipOn: colors.tabBarActivePill,
    chipOnInk: colors.tabBarActiveText,
    logBg: colors.contentInputBg,
    quote: colors.contentText,
    addBtn: colors.tabBarActivePill,
    addBtnInk: colors.tabBarActiveText,
  };
}

/**
 * モノクローム
 * 現行アプリ全体（設定のホワイト / ブラック）の配色・形。
 * 色は appThemes を参照するので、本体テーマを直すと辞書も追従する。
 */
export const monochromeDesignPattern: DesignPattern = {
  id: 'monochrome',
  label: 'モノクローム',
  summary: '灰と白／黒。角は既存UIに合わせ、差は明るさだけ。',
  shape: {
    cardBorderRadius: Radius.md,
    cardBorderWidth: BorderWidth.card,
    cardPadding: 12,
    offsetDistance: 0,
    cornerBrackets: false,
    bracketSize: 0,
    innerRadius: Radius.sm,
    kickerLetterSpacing: 0,
  },
  tones: {
    light: {
      id: 'light',
      label: 'ホワイト',
      colors: fromAppThemeColors(whiteAppTheme.colors, 'transparent'),
    },
    dark: {
      id: 'dark',
      label: 'ブラック',
      colors: fromAppThemeColors(blackAppTheme.colors, 'transparent'),
    },
  },
};
