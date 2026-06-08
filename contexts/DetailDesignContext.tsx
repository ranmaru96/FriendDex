import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getDetailDesignBundle,
  normalizeDetailDesignVariant,
  type DetailDesignBundle,
  type DetailDesignVariant,
} from '@/constants/detailThemes';
import { getDetailDesignVariant, initializeDatabase, setDetailDesignVariant } from '../db';

type DetailDesignContextValue = {
  variant: DetailDesignVariant;
  bundle: DetailDesignBundle;
  setVariant: (variant: DetailDesignVariant) => void;
  reload: () => void;
};

const DetailDesignContext = createContext<DetailDesignContextValue | null>(null);

export function DetailDesignProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<DetailDesignVariant>('main');

  const reload = useCallback(() => {
    initializeDatabase();
    setVariantState(getDetailDesignVariant());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setVariant = useCallback((next: DetailDesignVariant) => {
    initializeDatabase();
    setDetailDesignVariant(next);
    setVariantState(next);
  }, []);

  const bundle = useMemo(() => getDetailDesignBundle(variant), [variant]);

  const value = useMemo(
    () => ({
      variant,
      bundle,
      setVariant,
      reload,
    }),
    [variant, bundle, setVariant, reload]
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
