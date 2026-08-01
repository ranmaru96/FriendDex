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
  getCalendarEventCardStyleOverride,
  getCalendarEventTimeDisplayOverride,
  getDetailProfileCardStyleOverride,
  getEpisodeListPhotoLayoutOverride,
  getUiPreviewVariant,
  initializeDatabase,
  setCalendarEventCardStyleOverride,
  setCalendarEventTimeDisplayOverride,
  setDetailProfileCardStyleOverride,
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
  const [calendarEventCardStyle, setCalendarEventCardStyleState] =
    useState<CalendarEventCardStyle | null>(null);
  const [calendarEventTimeDisplay, setCalendarEventTimeDisplayState] =
    useState<CalendarEventTimeDisplay | null>(null);
  const [episodeListPhotoLayout, setEpisodeListPhotoLayoutState] =
    useState<EpisodeListPhotoLayout | null>(null);
  const [detailProfileCardStyle, setDetailProfileCardStyleState] =
    useState<DetailProfileCardStyle | null>(null);

  const reload = useCallback(() => {
    initializeDatabase();
    setVariantState(getUiPreviewVariant());
    setCalendarEventCardStyleState(getCalendarEventCardStyleOverride());
    setCalendarEventTimeDisplayState(getCalendarEventTimeDisplayOverride());
    setEpisodeListPhotoLayoutState(getEpisodeListPhotoLayoutOverride());
    setDetailProfileCardStyleState(getDetailProfileCardStyleOverride());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setVariant = useCallback((next: UiPreviewVariant) => {
    initializeDatabase();
    setUiPreviewVariant(next);
    setVariantState(next);
  }, []);

  const setCalendarEventCardStyle = useCallback((style: CalendarEventCardStyle) => {
    initializeDatabase();
    setCalendarEventCardStyleOverride(style);
    setCalendarEventCardStyleState(style);
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

  const setDetailProfileCardStyle = useCallback((style: DetailProfileCardStyle) => {
    initializeDatabase();
    setDetailProfileCardStyleOverride(style);
    setDetailProfileCardStyleState(style);
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
    };
    const cardStyle = calendarEventCardStyle ?? next.calendarEventCardStyle;
    if (cardStyle !== next.calendarEventCardStyle) {
      next = { ...next, calendarEventCardStyle: cardStyle };
    }
    const timeDisplay = calendarEventTimeDisplay ?? next.calendarEventTimeDisplay;
    if (timeDisplay !== next.calendarEventTimeDisplay) {
      next = { ...next, calendarEventTimeDisplay: timeDisplay };
    }
    const photoLayout = episodeListPhotoLayout ?? next.episodeListPhotoLayout;
    if (photoLayout !== next.episodeListPhotoLayout) {
      next = {
        ...next,
        episodeListPhotoLayout: photoLayout,
        episodeListPhotoSpanRows: episodeListPhotoSpanRowsForLayout(photoLayout),
      };
    }
    const detailCardStyle = detailProfileCardStyle ?? next.detailProfileCardStyle;
    if (detailCardStyle !== next.detailProfileCardStyle) {
      next = { ...next, detailProfileCardStyle: detailCardStyle };
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
    calendarEventCardStyle,
    calendarEventTimeDisplay,
    episodeListPhotoLayout,
    detailProfileCardStyle,
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
