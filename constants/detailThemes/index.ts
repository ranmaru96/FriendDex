import { lightDetailDesign } from './light';
import { mainDetailDesign } from './main';
import type { DetailDesignBundle, DetailDesignVariant } from './types';

export type { DetailDesignBundle, DetailDesignVariant, DetailThemeColors } from './types';
export type { DetailTabKey } from './tabs';
export { DETAIL_TAB_KEYS } from './tabs';
export { mainDetailDesign, lightDetailDesign };

const BUNDLES: Record<DetailDesignVariant, DetailDesignBundle> = {
  main: mainDetailDesign,
  light: lightDetailDesign,
};

export const DETAIL_DESIGN_OPTIONS: { value: DetailDesignVariant; label: string }[] = [
  { value: 'main', label: mainDetailDesign.label },
  { value: 'light', label: lightDetailDesign.label },
];

export function getDetailDesignBundle(variant: DetailDesignVariant): DetailDesignBundle {
  return BUNDLES[variant] ?? mainDetailDesign;
}

export function normalizeDetailDesignVariant(value: string | null | undefined): DetailDesignVariant {
  return value === 'light' ? 'light' : 'main';
}
