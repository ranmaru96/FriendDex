import { blackAppTheme } from './black';
import { defaultAppTheme } from './default';
import { whiteAppTheme } from './white';
import type { AppThemeBundle, AppThemeVariant } from './types';

export type { AppThemeBundle, AppThemeCardElevation, AppThemeColors, AppThemeVariant } from './types';
export type { AppThemeContentColorFields } from './contentColors';
export {
  darkContentColors,
  lightContentColors,
  whiteContentColors,
} from './contentColors';
export { defaultAppTheme, whiteAppTheme, blackAppTheme };


const BUNDLES: Record<AppThemeVariant, AppThemeBundle> = {
  default: defaultAppTheme,
  white: whiteAppTheme,
  black: blackAppTheme,
};

/**
 * 設定画面で選べるテーマ。
 * default は非表示（実装・BUNDLES は残しているので、ここへ戻せば再選択できる）。
 */
export const APP_THEME_OPTIONS: { value: AppThemeVariant; label: string }[] = [
  { value: 'white', label: whiteAppTheme.label },
  { value: 'black', label: blackAppTheme.label },
];

export function getAppThemeBundle(variant: AppThemeVariant): AppThemeBundle {
  return BUNDLES[variant] ?? whiteAppTheme;
}

/** 未設定・旧 default はホワイトに寄せる（default バンドル自体は残置） */
export function normalizeAppThemeVariant(value: string | null | undefined): AppThemeVariant {
  if (value === 'white' || value === 'black') {
    return value;
  }
  return 'white';
}

/** ホワイト / ブラック：形状・レイアウト共通。差は AppThemeColors のみ */
export function isMonochromeAppTheme(
  variant: AppThemeVariant | null | undefined
): boolean {
  return variant === 'white' || variant === 'black';
}
