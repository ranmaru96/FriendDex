import { BorderWidth, Radius, ScreenHorizontalInset, Spacing, Theme } from '@/constants/theme';
import type { UiKit } from './types';

/** 試作中の UI ルール（Phase 0 では stable と同値。Phase 1 以降で差分を足す） */
export const previewUiKit: UiKit = {
  label: 'preview（試作版）',

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

  formLayout: 'horizontal',
  formContainer: 'singlePanel',
  searchAreaStyle: 'doubleBorder',
  listItemStyle: 'separateCards',
  episodeListCardLayout: 'photoRight',
  calendarEventMemoDisplay: 'twoLines',

  textPrimary: Theme.textPrimary,
  textSecondary: Theme.textSecondary,
  inputBg: Theme.inputBg,
  inputBorder: Theme.inputBorder,
  topBarText: Theme.topBarText,
};
