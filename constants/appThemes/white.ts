import { whiteContentColors } from './contentColors';
import type { AppThemeBundle } from './types';

/**
 * ブラックと同区分のモノクロライト。
 * 画面・タブは弱めの白、ヘッダーとカード／入力は強めの白。
 */
export const whiteAppTheme: AppThemeBundle = {
  variant: 'white',
  label: 'ホワイト',
  colors: {
    ...whiteContentColors,
    screenBackground: '#F2F2F2',
    topBarText: '#111111',
    topBarBorder: 'rgba(0, 0, 0, 0.22)',
    topBarTextMuted: 'rgba(17, 17, 17, 0.35)',
    onScreenText: '#111111',
    onScreenTextSecondary: '#666666',
    headerBackground: '#FFFFFF',
    headerBorder: 'rgba(0, 0, 0, 0.22)',
    headerText: '#111111',
    tabBarBackground: '#F2F2F2',
    tabBarBorder: 'rgba(0, 0, 0, 0.22)',
    tabBarInactive: '#666666',
    tabBarActivePill: '#222222',
    tabBarActiveText: '#ffffff',
    calendarOuterBorder: '#666666',
    homeCardElevation: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
  },
};
