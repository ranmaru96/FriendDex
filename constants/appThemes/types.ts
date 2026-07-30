import type { AppThemeContentColorFields } from './contentColors';

export type AppThemeVariant = 'default' | 'white' | 'black';

/** 一覧人物カードの影（iOS shadow / Android elevation） */
export type AppThemeCardElevation = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

/** 全画面共通の土台色 + コンテンツ面色 */
export type AppThemeColors = AppThemeContentColorFields & {
  screenBackground: string;
  topBarText: string;
  topBarBorder: string;
  /** トップバー上の無効アイコンなど */
  topBarTextMuted: string;
  /** screenBackground 上に載る本文・見出し */
  onScreenText: string;
  onScreenTextSecondary: string;
  /** メイン AppHeader */
  headerBackground: string;
  headerBorder: string;
  headerText: string;
  /** ボトムタブ */
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarInactive: string;
  tabBarActivePill: string;
  tabBarActiveText: string;
  /** カレンダー月グリッドの外周（特に上下） */
  calendarOuterBorder: string;
  homeCardElevation: AppThemeCardElevation;
};

export type AppThemeBundle = {
  variant: AppThemeVariant;
  label: string;
  colors: AppThemeColors;
};
