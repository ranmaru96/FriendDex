import type { AppTheme } from '@/constants/theme';

export type UiPreviewVariant = 'stable' | 'preview';

export type FormLayout = 'vertical' | 'horizontal';
export type FormContainer = 'multiCard' | 'singlePanel';
export type SearchAreaStyle = 'doubleBorder' | 'singleBorder';
export type ListItemStyle = 'separateCards' | 'panelSections';
export type EpisodeListCardLayout = 'classic' | 'photoRight';
export type CalendarEventMemoDisplay = 'full' | 'twoLines';

export type UiKit = {
  label: string;

  screenBackground: string;
  panelBackground: string;
  panelBorderColor: string;
  panelBorderRadius: number;
  panelBorderWidth: number;

  screenPaddingHorizontal: number;
  sectionPaddingHorizontal: number;
  sectionPaddingVertical: number;
  sectionDividerInset: number;

  formLabelWidth: number;
  formRowGap: number;
  formLabelAlign: 'left' | 'right';
  inputMinHeight: number;

  formLayout: FormLayout;
  formContainer: FormContainer;
  searchAreaStyle: SearchAreaStyle;
  listItemStyle: ListItemStyle;
  episodeListCardLayout: EpisodeListCardLayout;
  calendarEventMemoDisplay: CalendarEventMemoDisplay;

  textPrimary: AppTheme['textPrimary'];
  textSecondary: AppTheme['textSecondary'];
  inputBg: AppTheme['inputBg'];
  inputBorder: AppTheme['inputBorder'];
  topBarText: AppTheme['topBarText'];
};
