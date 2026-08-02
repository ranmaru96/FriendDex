import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  getDetailDesignBundle,
  normalizeDetailDesignVariant,
  type DetailDesignBundle,
  type DetailDesignVariant,
} from '@/constants/detailThemes';

type DetailDesignContextValue = {
  variant: DetailDesignVariant;
  bundle: DetailDesignBundle;
  setVariant: (variant: DetailDesignVariant) => void;
  reload: () => void;
};

const DetailDesignContext = createContext<DetailDesignContextValue | null>(null);

export function DetailDesignProvider({ children }: { children: ReactNode }) {
  const reload = useCallback(() => {
    // Detail デザインは main 固定（ライト ver 廃止）
  }, []);

  const setVariant = useCallback((_next: DetailDesignVariant) => {
    // no-op: ライト ver 削除により切り替え不可
  }, []);

  const bundle = useMemo(() => getDetailDesignBundle('main'), []);

  const value = useMemo(
    () => ({
      variant: 'main' as const,
      bundle,
      setVariant,
      reload,
    }),
    [bundle, setVariant, reload]
  );

  return <DetailDesignContext.Provider value={value}>{children}</DetailDesignContext.Provider>;
}

export function useDetailDesign(): DetailDesignContextValue {
  const ctx = useContext(DetailDesignContext);
  if (!ctx) {
    throw new Error('useDetailDesign must be used within DetailDesignProvider');
  }
  return ctx;
}

export function useDetailDesignOptional(): DetailDesignContextValue | null {
  return useContext(DetailDesignContext);
}

export { normalizeDetailDesignVariant };
