import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getUiKit,
  normalizeUiPreviewVariant,
  type CalendarEventTimeDisplay,
  type UiKit,
  type UiPreviewVariant,
} from '@/constants/uiKit';
import {
  getCalendarEventTimeDisplayOverride,
  getUiPreviewVariant,
  initializeDatabase,
  setCalendarEventTimeDisplayOverride,
  setUiPreviewVariant,
} from '../db';

type UiPreviewContextValue = {
  variant: UiPreviewVariant;
  isPreview: boolean;
  isStable: boolean;
  kit: UiKit;
  setVariant: (variant: UiPreviewVariant) => void;
  setCalendarEventTimeDisplay: (display: CalendarEventTimeDisplay) => void;
  reload: () => void;
};

const UiPreviewContext = createContext<UiPreviewContextValue | null>(null);

export function UiPreviewProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<UiPreviewVariant>('stable');
  const [calendarEventTimeDisplay, setCalendarEventTimeDisplayState] =
    useState<CalendarEventTimeDisplay | null>(null);

  const reload = useCallback(() => {
    initializeDatabase();
    setVariantState(getUiPreviewVariant());
    setCalendarEventTimeDisplayState(getCalendarEventTimeDisplayOverride());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setVariant = useCallback((next: UiPreviewVariant) => {
    initializeDatabase();
    setUiPreviewVariant(next);
    setVariantState(next);
  }, []);

  const setCalendarEventTimeDisplay = useCallback((display: CalendarEventTimeDisplay) => {
    initializeDatabase();
    setCalendarEventTimeDisplayOverride(display);
    setCalendarEventTimeDisplayState(display);
  }, []);

  const kit = useMemo(() => {
    const base = getUiKit(variant);
    if (variant !== 'preview') {
      return base;
    }
    const timeDisplay = calendarEventTimeDisplay ?? base.calendarEventTimeDisplay;
    if (timeDisplay === base.calendarEventTimeDisplay) {
      return base;
    }
    return { ...base, calendarEventTimeDisplay: timeDisplay };
  }, [variant, calendarEventTimeDisplay]);

  const value = useMemo(
    () => ({
      variant,
      isPreview: variant === 'preview',
      isStable: variant === 'stable',
      kit,
      setVariant,
      setCalendarEventTimeDisplay,
      reload,
    }),
    [variant, kit, setVariant, setCalendarEventTimeDisplay, reload]
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
