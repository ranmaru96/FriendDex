import { HomeCardElevation, Theme } from '@/constants/theme';
import { lightContentColors } from './contentColors';
import type { AppThemeBundle } from './types';

/** 現行の見た目（グレー画面ベース） */
export const defaultAppTheme: AppThemeBundle = {
  variant: 'default',
  label: 'デフォルト',
  colors: {
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
    homeCardElevation: { ...HomeCardElevation },
  },
};
