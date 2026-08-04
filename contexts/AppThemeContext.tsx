import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getAppThemeBundle,
  normalizeAppThemeVariant,
  type AppThemeBundle,
  type AppThemeColors,
  type AppThemeVariant,
} from '@/constants/appThemes';
import { getAppThemeVariant, initializeDatabase, setAppThemeVariant } from '../db';

type AppThemeContextValue = {
  variant: AppThemeVariant;
  bundle: AppThemeBundle;
  colors: AppThemeColors;
  setVariant: (variant: AppThemeVariant) => void;
  reload: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<AppThemeVariant>('white');

  const reload = useCallback(() => {
    initializeDatabase();
    setVariantState(getAppThemeVariant());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setVariant = useCallback((next: AppThemeVariant) => {
    initializeDatabase();
    setAppThemeVariant(next);
    setVariantState(next);
  }, []);

  const bundle = useMemo(() => getAppThemeBundle(variant), [variant]);

  const value = useMemo(
    () => ({
      variant,
      bundle,
      colors: bundle.colors,
      setVariant,
      reload,
    }),
    [variant, bundle, setVariant, reload]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return ctx;
}

export function useAppThemeOptional(): AppThemeContextValue | null {
  return useContext(AppThemeContext);
}

export { normalizeAppThemeVariant };
