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

export const APP_THEME_OPTIONS: { value: AppThemeVariant; label: string }[] = [
  { value: 'default', label: defaultAppTheme.label },
  { value: 'white', label: whiteAppTheme.label },
  { value: 'black', label: blackAppTheme.label },
];

export function getAppThemeBundle(variant: AppThemeVariant): AppThemeBundle {
  return BUNDLES[variant] ?? defaultAppTheme;
}

export function normalizeAppThemeVariant(value: string | null | undefined): AppThemeVariant {
  if (value === 'white' || value === 'black') {
    return value;
  }
  return 'default';
}

/** ホワイト / ブラック：形状・レイアウト共通。差は AppThemeColors のみ */
export function isMonochromeAppTheme(
  variant: AppThemeVariant | null | undefined
): boolean {
  return variant === 'white' || variant === 'black';
}
