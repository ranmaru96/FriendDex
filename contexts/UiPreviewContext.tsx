import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getUiKit,
  normalizeUiPreviewVariant,
  type UiKit,
  type UiPreviewVariant,
} from '@/constants/uiKit';
import { getUiPreviewVariant, initializeDatabase, setUiPreviewVariant } from '../db';

type UiPreviewContextValue = {
  variant: UiPreviewVariant;
  isPreview: boolean;
  isStable: boolean;
  kit: UiKit;
  setVariant: (variant: UiPreviewVariant) => void;
  reload: () => void;
};

const UiPreviewContext = createContext<UiPreviewContextValue | null>(null);

export function UiPreviewProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<UiPreviewVariant>('stable');

  const reload = useCallback(() => {
    initializeDatabase();
    setVariantState(getUiPreviewVariant());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setVariant = useCallback((next: UiPreviewVariant) => {
    initializeDatabase();
    setUiPreviewVariant(next);
    setVariantState(next);
  }, []);

  const kit = useMemo(() => getUiKit(variant), [variant]);

  const value = useMemo(
    () => ({
      variant,
      isPreview: variant === 'preview',
      isStable: variant === 'stable',
      kit,
      setVariant,
      reload,
    }),
    [variant, kit, setVariant, reload]
  );

  return <UiPreviewContext.Provider value={value}>{children}</UiPreviewContext.Provider>;
}

export function useUiPreview(): UiPreviewContextValue {
  const ctx = useContext(UiPreviewContext);
  if (!ctx) {
    throw new Error('useUiPreview must be used within UiPreviewProvider');
  }
  return ctx;
}

export function useUiKit(): UiKit {
  return useUiPreview().kit;
}

export function useUiPreviewOptional(): UiPreviewContextValue | null {
  return useContext(UiPreviewContext);
}

export { normalizeUiPreviewVariant };
