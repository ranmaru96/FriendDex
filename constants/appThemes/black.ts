import { darkContentColors } from './contentColors';
import type { AppThemeBundle } from './types';

/**
 * ホワイトの色反転。形状・レイアウトは white と同じ前提で、
 * 画面分岐は isMonochromeAppTheme() でまとめる。
 */
export const blackAppTheme: AppThemeBundle = {
  variant: 'black',
  label: 'ブラック',
  colors: {
    ...darkContentColors,
    screenBackground: '#111111',
    topBarText: '#FFFFFF',
    topBarBorder: 'rgba(255, 255, 255, 0.22)',
    topBarTextMuted: 'rgba(255, 255, 255, 0.35)',
    onScreenText: '#FFFFFF',
    onScreenTextSecondary: '#BBBBBB',
    headerBackground: '#111111',
    headerBorder: 'rgba(255, 255, 255, 0.22)',
    headerText: '#FFFFFF',
    tabBarBackground: '#111111',
    tabBarBorder: 'rgba(255, 255, 255, 0.22)',
    tabBarInactive: '#BBBBBB',
    tabBarActivePill: '#DDDDDD',
    tabBarActiveText: '#111111',
    calendarOuterBorder: '#999999',
    homeCardElevation: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 3,
    },
  },
};
