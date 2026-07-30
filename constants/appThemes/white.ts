import type { AppThemeBundle } from './types';

/** 全画面ベースを白にした試作 */
export const whiteAppTheme: AppThemeBundle = {
  variant: 'white',
  label: 'ホワイト',
  colors: {
    screenBackground: '#FFFFFF',
    topBarText: '#111111',
    topBarBorder: 'rgba(0, 0, 0, 0.22)',
    topBarTextMuted: 'rgba(17, 17, 17, 0.35)',
    onScreenText: '#111111',
    onScreenTextSecondary: '#444444',
    headerBackground: '#FFFFFF',
    headerBorder: 'rgba(0, 0, 0, 0.22)',
    headerText: '#111111',
    tabBarBackground: '#FFFFFF',
    /** トップバー下端と同じ色・太さ感に揃える */
    tabBarBorder: 'rgba(0, 0, 0, 0.22)',
    tabBarInactive: '#444444',
    tabBarActivePill: '#222222',
    tabBarActiveText: '#ffffff',
    calendarOuterBorder: '#666666',
    /** 白背景では強い影が目立つので弱め */
    homeCardElevation: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 3,
    },
  },
};
