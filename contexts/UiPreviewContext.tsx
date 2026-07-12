import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  episodeListPhotoSpanRowsForLayout,
  getUiKit,
  normalizeUiPreviewVariant,
  type CalendarEventTimeDisplay,
  type EpisodeListPhotoLayout,
  type UiKit,
  type UiPreviewVariant,
} from '@/constants/uiKit';
import {
  getCalendarEventTimeDisplayOverride,
  getEpisodeListPhotoLayoutOverride,
  getUiPreviewVariant,
  initializeDatabase,
  setCalendarEventTimeDisplayOverride,
  setEpisodeListPhotoLayoutOverride,
  setUiPreviewVariant,
} from '../db';

type UiPreviewContextValue = {
  variant: UiPreviewVariant;
  isPreview: boolean;
  isStable: boolean;
  kit: UiKit;
  setVariant: (variant: UiPreviewVariant) => void;
  setCalendarEventTimeDisplay: (display: CalendarEventTimeDisplay) => void;
  setEpisodeListPhotoLayout: (layout: EpisodeListPhotoLayout) => void;
  reload: () => void;
};

const UiPreviewContext = createContext<UiPreviewContextValue | null>(null);

export function UiPreviewProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<UiPreviewVariant>('stable');
  const [calendarEventTimeDisplay, setCalendarEventTimeDisplayState] =
    useState<CalendarEventTimeDisplay | null>(null);
  const [episodeListPhotoLayout, setEpisodeListPhotoLayoutState] =
    useState<EpisodeListPhotoLayout | null>(null);

  const reload = useCallback(() => {
    initializeDatabase();
    setVariantState(getUiPreviewVariant());
    setCalendarEventTimeDisplayState(getCalendarEventTimeDisplayOverride());
    setEpisodeListPhotoLayoutState(getEpisodeListPhotoLayoutOverride());
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

  const setEpisodeListPhotoLayout = useCallback((layout: EpisodeListPhotoLayout) => {
    initializeDatabase();
    setEpisodeListPhotoLayoutOverride(layout);
    setEpisodeListPhotoLayoutState(layout);
  }, []);

  const kit = useMemo(() => {
    const base = getUiKit(variant);
    if (variant !== 'preview') {
      return base;
    }
    let next = base;
    const timeDisplay = calendarEventTimeDisplay ?? base.calendarEventTimeDisplay;
    if (timeDisplay !== base.calendarEventTimeDisplay) {
      next = { ...next, calendarEventTimeDisplay: timeDisplay };
    }
    const photoLayout = episodeListPhotoLayout ?? base.episodeListPhotoLayout;
    if (photoLayout !== base.episodeListPhotoLayout) {
      next = {
        ...next,
        episodeListPhotoLayout: photoLayout,
        episodeListPhotoSpanRows: episodeListPhotoSpanRowsForLayout(photoLayout),
      };
    }
    return next;
  }, [variant, calendarEventTimeDisplay, episodeListPhotoLayout]);

  const value = useMemo(
    () => ({
      variant,
      isPreview: variant === 'preview',
      isStable: variant === 'stable',
      kit,
      setVariant,
      setCalendarEventTimeDisplay,
      setEpisodeListPhotoLayout,
      reload,
    }),
    [variant, kit, setVariant, setCalendarEventTimeDisplay, setEpisodeListPhotoLayout, reload]
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
