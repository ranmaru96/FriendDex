import { useMemo } from 'react';
import { lightContentColors, type AppThemeContentColorFields } from '@/constants/appThemes/contentColors';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import type { AppThemeColors } from '@/constants/appThemes/types';

/** コンテンツ面色。AppTheme 未提供時はライト既定にフォールバック */
export function useContentColors(): AppThemeContentColorFields {
  const appTheme = useAppThemeOptional();
  return useMemo(() => {
    const c = appTheme?.colors;
    if (!c) {
      return lightContentColors;
    }
    return pickContentColors(c);
  }, [appTheme?.colors]);
}

export function pickContentColors(colors: AppThemeColors): AppThemeContentColorFields {
  return {
    contentCard: colors.contentCard,
    contentBorder: colors.contentBorder,
    contentText: colors.contentText,
    contentTextSecondary: colors.contentTextSecondary,
    contentPersonTagBg: colors.contentPersonTagBg,
    contentSearchArea: colors.contentSearchArea,
    contentSearchFieldBorder: colors.contentSearchFieldBorder,
    contentInputBg: colors.contentInputBg,
    contentPhotoInnerBorder: colors.contentPhotoInnerBorder,
    contentPhotoPlaceholder: colors.contentPhotoPlaceholder,
    contentPhotoPlaceholderText: colors.contentPhotoPlaceholderText,
    contentCardName: colors.contentCardName,
    contentCalendarInMonth: colors.contentCalendarInMonth,
    contentCalendarOutMonth: colors.contentCalendarOutMonth,
    contentDivider: colors.contentDivider,
  };
}
