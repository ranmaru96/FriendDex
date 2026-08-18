import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getAppThemeBundle,
  normalizeAppThemeVariant,
  type AppThemeBundle,
  type AppThemeColors,
  type AppThemeVariant,
} from '@/constants/appThemes';
import {
  applyDesignPatternToAppColors,
  getDesignPatternTone,
  normalizeDesignPatternId,
  type DesignPatternColors,
  type DesignPatternId,
  type DesignPatternShape,
} from '@/constants/designPatterns';
import {
  getAppThemeVariant,
  getDesignPatternId,
  initializeDatabase,
  setAppThemeVariant,
  setDesignPatternId,
} from '../db';

type AppThemeContextValue = {
  variant: AppThemeVariant;
  patternId: DesignPatternId;
  bundle: AppThemeBundle;
  colors: AppThemeColors;
  shape: DesignPatternShape;
  patternColors: DesignPatternColors;
  setVariant: (variant: AppThemeVariant) => void;
  setPatternId: (patternId: DesignPatternId) => void;
  reload: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<AppThemeVariant>('white');
  const [patternId, setPatternIdState] = useState<DesignPatternId>('monochrome');

  const reload = useCallback(() => {
    initializeDatabase();
    setVariantState(getAppThemeVariant());
    setPatternIdState(normalizeDesignPatternId(getDesignPatternId()));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setVariant = useCallback((next: AppThemeVariant) => {
    initializeDatabase();
    setAppThemeVariant(next);
    setVariantState(next);
  }, []);

  const setPatternId = useCallback((next: DesignPatternId) => {
    initializeDatabase();
    setDesignPatternId(next);
    setPatternIdState(next);
  }, []);

  const rawBundle = useMemo(() => getAppThemeBundle(variant), [variant]);
  const colors = useMemo(
    () => applyDesignPatternToAppColors(rawBundle.colors, patternId, variant),
    [rawBundle.colors, patternId, variant]
  );
  const bundle = useMemo(() => ({ ...rawBundle, colors }), [rawBundle, colors]);
  const { pattern, tone } = useMemo(
    () => getDesignPatternTone(patternId, variant),
    [patternId, variant]
  );

  const value = useMemo(
    () => ({
      variant,
      patternId,
      bundle,
      colors,
      shape: pattern.shape,
      patternColors: tone.colors,
      setVariant,
      setPatternId,
      reload,
    }),
    [variant, patternId, bundle, colors, pattern.shape, tone.colors, setVariant, setPatternId, reload]
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
