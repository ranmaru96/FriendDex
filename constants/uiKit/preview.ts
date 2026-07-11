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

  screenPaddingHorizontal: 0,
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
  listItemStyle: 'panelSections',
  listPanelStyle: 'edgeFlat',
  sectionDividerStyle: 'bold2px',
  participantChipStyle: 'fitted',
  participantChipBackground: '#FFFFFF',
  episodeListCardLayout: 'photoRight',
  calendarEventMemoDisplay: 'oneLine',
  calendarMonthLayout: 'scheduleGrid',
  calendarEventTimeDisplay: 'plain',
  calendarParticipantChipBackground: '#FFFFFF',
  calendarParticipantChipStyle: 'fitted',
  calendarScreenPaddingHorizontal: 0,
  textPrimary: Theme.textPrimary,
  textSecondary: Theme.textSecondary,
  inputBg: Theme.inputBg,
  inputBorder: Theme.inputBorder,
  topBarText: Theme.topBarText,
};
