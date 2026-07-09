import { BorderWidth, Radius, ScreenHorizontalInset, Spacing, Theme } from '@/constants/theme';
import type { UiKit } from './types';

/** 現在採用中の UI ルール（現状の見た目・構造を反映） */
export const stableUiKit: UiKit = {
  label: 'stable（採用版）',

  screenBackground: Theme.screenBase,
  panelBackground: Theme.bgSurface,
  panelBorderColor: Theme.border,
  panelBorderRadius: Radius.md,
  panelBorderWidth: BorderWidth.card,

  screenPaddingHorizontal: ScreenHorizontalInset,
  sectionPaddingHorizontal: Spacing.md,
  sectionPaddingVertical: Spacing.sm,
  sectionDividerInset: Spacing.md,

  formLabelWidth: 88,
  formRowGap: Spacing.sm,
  formLabelAlign: 'left',
  inputMinHeight: 44,

  formLayout: 'vertical',
  formContainer: 'multiCard',
  searchAreaStyle: 'doubleBorder',
  listItemStyle: 'separateCards',
  episodeListCardLayout: 'classic',
  calendarEventMemoDisplay: 'full',

  textPrimary: Theme.textPrimary,
  textSecondary: Theme.textSecondary,
  inputBg: Theme.inputBg,
  inputBorder: Theme.inputBorder,
  topBarText: Theme.topBarText,
};
