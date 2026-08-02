import { mainDetailDesign } from './main';
import type { DetailDesignBundle, DetailDesignVariant } from './types';

export type { DetailDesignBundle, DetailDesignVariant, DetailThemeColors } from './types';
export type { DetailTabKey } from './tabs';
export { DETAIL_TAB_KEYS } from './tabs';
export { mainDetailDesign };

export function getDetailDesignBundle(_variant?: DetailDesignVariant): DetailDesignBundle {
  return mainDetailDesign;
}

/** ライト ver 廃止後は常に main */
export function normalizeDetailDesignVariant(_value?: string | null): DetailDesignVariant {
  return 'main';
}
