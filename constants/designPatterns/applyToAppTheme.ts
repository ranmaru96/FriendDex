import { catalogDesignPattern } from './catalog';
import { codexDesignPattern } from './codex';
import { toneIdFromAppTheme } from './types';
import type { DesignPatternColors, DesignPatternId } from './types';
import type { AppThemeColors, AppThemeVariant } from '@/constants/appThemes/types';
import { isLightHexColor, withAlpha } from '@/utils/colorHelpers';

function overlayPattern(base: AppThemeColors, c: DesignPatternColors): AppThemeColors {
  const inkIsLight = isLightHexColor(c.cardInk);
  return {
    ...base,
    screenBackground: c.screen,
    topBarText: c.cardInk,
    topBarBorder: c.headerBorder,
    topBarTextMuted: c.cardMuted,
    onScreenText: c.cardInk,
    onScreenTextSecondary: c.cardMuted,
    headerBackground: c.headerBg,
    headerBorder: c.headerBorder,
    headerText: c.cardInk,
    tabBarBackground: c.headerBg,
    tabBarBorder: c.headerBorder,
    tabBarInactive: c.cardMuted,
    tabBarActivePill: c.chipOn,
    tabBarActiveText: c.chipOnInk,
    calendarOuterBorder: c.cyan,
    contentCard: c.card,
    contentBorder: c.headerBorder,
    contentText: c.cardInk,
    contentTextSecondary: c.cardMuted,
    contentPersonTagBg: c.accentSoft,
    contentSearchArea: c.headerBg,
    contentSearchFieldBorder: c.headerBorder,
    contentInputBg: c.logBg,
    contentPhotoInnerBorder: c.card,
    contentPhotoPlaceholder: c.logBg,
    contentPhotoPlaceholderText: c.cardMuted,
    contentCardName: c.cardInk,
    contentCalendarInMonth: c.card,
    contentCalendarOutMonth: c.screen,
    contentDivider: c.headerBorder,
    contentSwitchTrackOff: withAlpha(c.cardInk, inkIsLight ? 0.42 : 0.38),
    contentSwitchThumbOff: inkIsLight ? '#E6E6E6' : '#FFFFFF',
    contentSwitchTrackOn: c.cardInk,
    contentSwitchThumbOn: inkIsLight ? c.card : '#FFFFFF',
  };
}

/** 選択中パターンを、既存の AppThemeColors に載せる（モノクロームは素通し）。 */
export function applyDesignPatternToAppColors(
  base: AppThemeColors,
  patternId: DesignPatternId,
  variant: AppThemeVariant
): AppThemeColors {
  if (patternId === 'codex') {
    return overlayPattern(base, codexDesignPattern.tones[toneIdFromAppTheme(variant)].colors);
  }
  if (patternId === 'catalog') {
    return overlayPattern(base, catalogDesignPattern.tones[toneIdFromAppTheme(variant)].colors);
  }
  return base;
}
