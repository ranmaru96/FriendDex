import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  episodeListPhotoSpanRowsForLayout,
  getUiKit,
  type CalendarEventCardStyle,
  normalizeUiPreviewVariant,
  type CalendarEventTimeDisplay,
  type DetailProfileCardStyle,
  type EpisodeListPhotoLayout,
  type UiKit,
  type UiPreviewVariant,
} from '@/constants/uiKit';
import {
  getEpisodeListPhotoLayoutOverride,
  getUiPreviewVariant,
  initializeDatabase,
  setEpisodeListPhotoLayoutOverride,
  setUiPreviewVariant,
} from '../db';
import { useAppTheme } from './AppThemeContext';

type UiPreviewContextValue = {
  variant: UiPreviewVariant;
  isPreview: boolean;
  isStable: boolean;
  kit: UiKit;
  setVariant: (variant: UiPreviewVariant) => void;
  setCalendarEventCardStyle: (style: CalendarEventCardStyle) => void;
  setCalendarEventTimeDisplay: (display: CalendarEventTimeDisplay) => void;
  setEpisodeListPhotoLayout: (layout: EpisodeListPhotoLayout) => void;
  setDetailProfileCardStyle: (style: DetailProfileCardStyle) => void;
  reload: () => void;
};

const UiPreviewContext = createContext<UiPreviewContextValue | null>(null);

export function UiPreviewProvider({ children }: { children: ReactNode }) {
  const { colors: appThemeColors } = useAppTheme();
  const [variant, setVariantState] = useState<UiPreviewVariant>('stable');
  const [episodeListPhotoLayout, setEpisodeListPhotoLayoutState] =
    useState<EpisodeListPhotoLayout | null>(null);

  const reload = useCallback(() => {
    initializeDatabase();
    setVariantState(getUiPreviewVariant());
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

  const setCalendarEventCardStyle = useCallback((_style: CalendarEventCardStyle) => {
    // no-op: 丸角カードに固定
  }, []);

  const setCalendarEventTimeDisplay = useCallback((_display: CalendarEventTimeDisplay) => {
    // no-op: 固定列に固定
  }, []);

  const setEpisodeListPhotoLayout = useCallback((layout: EpisodeListPhotoLayout) => {
    initializeDatabase();
    setEpisodeListPhotoLayoutOverride(layout);
    setEpisodeListPhotoLayoutState(layout);
  }, []);

  const setDetailProfileCardStyle = useCallback((_style: DetailProfileCardStyle) => {
    // no-op: フラットに固定
  }, []);

  const kit = useMemo(() => {
    const base = getUiKit(variant);
    let next: UiKit = {
      ...base,
      screenBackground: appThemeColors.screenBackground as UiKit['screenBackground'],
      topBarText: appThemeColors.topBarText as UiKit['topBarText'],
      panelBackground: appThemeColors.contentCard,
      panelBorderColor: appThemeColors.contentBorder,
      textPrimary: appThemeColors.contentText as UiKit['textPrimary'],
      textSecondary: appThemeColors.contentTextSecondary as UiKit['textSecondary'],
      inputBg: appThemeColors.contentInputBg as UiKit['inputBg'],
      inputBorder: appThemeColors.contentSearchFieldBorder as UiKit['inputBorder'],
      calendarEventCardStyle: 'roundedCards',
      calendarEventTimeDisplay: 'column',
      detailProfileCardStyle: 'flat',
    };
    const photoLayout = episodeListPhotoLayout ?? next.episodeListPhotoLayout;
    if (photoLayout !== next.episodeListPhotoLayout) {
      next = {
        ...next,
        episodeListPhotoLayout: photoLayout,
        episodeListPhotoSpanRows: episodeListPhotoSpanRowsForLayout(photoLayout),
      };
    }
    return next;
  }, [
    variant,
    appThemeColors.screenBackground,
    appThemeColors.topBarText,
    appThemeColors.contentCard,
    appThemeColors.contentBorder,
    appThemeColors.contentText,
    appThemeColors.contentTextSecondary,
    appThemeColors.contentInputBg,
    appThemeColors.contentSearchFieldBorder,
    episodeListPhotoLayout,
  ]);

  const value = useMemo(
    () => ({
      variant,
      isPreview: variant === 'preview',
      isStable: variant === 'stable',
      kit,
      setVariant,
      setCalendarEventCardStyle,
      setCalendarEventTimeDisplay,
      setEpisodeListPhotoLayout,
      setDetailProfileCardStyle,
      reload,
    }),
    [
      variant,
      kit,
      setVariant,
      setCalendarEventCardStyle,
      setCalendarEventTimeDisplay,
      setEpisodeListPhotoLayout,
      setDetailProfileCardStyle,
      reload,
    ]
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
