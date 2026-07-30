import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Spacing, Theme } from '@/constants/theme';
import { lightContentColors, type AppThemeColors } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';

/** hideNav サブ画面の共通トップバー（背景＝screenBackground、テーマ文字色） */
export function createSubScreenHeaderStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: 0,
      gap: Spacing.sm,
      minHeight: 44,
      backgroundColor: colors.screenBackground,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.topBarBorder,
    },
    sideBack: {
      minWidth: 64,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    side: {
      minWidth: 64,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'flex-end',
    },
    backText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.topBarText,
    },
    title: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.topBarText,
      textAlign: 'center',
    },
    titleLeft: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: colors.topBarText,
    },
  });
}

const fallbackColors: AppThemeColors = {
  ...lightContentColors,
  screenBackground: Theme.screenBase,
  topBarText: Theme.topBarText,
  topBarBorder: Theme.topBarBorder,
  topBarTextMuted: 'rgba(255, 255, 255, 0.28)',
  onScreenText: '#FFFFFF',
  onScreenTextSecondary: '#cbd5e1',
  headerBackground: Theme.surface,
  headerBorder: Theme.border,
  headerText: Theme.heading,
  tabBarBackground: Theme.tabBarBase,
  tabBarBorder: Theme.tabBarBorder,
  tabBarInactive: Theme.tabBarInactiveIcon,
  tabBarActivePill: Theme.tabBarActivePill,
  tabBarActiveText: '#ffffff',
  calendarOuterBorder: Theme.inputBorder,
  homeCardElevation: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 16,
  },
};

/** 静的フォールバック（デフォルトテーマ）。可能な限り useSubScreenHeaderStyles を使う */
export const subScreenHeaderStyles = createSubScreenHeaderStyles(fallbackColors);

export function useSubScreenHeaderStyles() {
  const appTheme = useAppThemeOptional();
  const colors = appTheme?.colors ?? fallbackColors;
  return useMemo(() => createSubScreenHeaderStyles(colors), [colors]);
}
