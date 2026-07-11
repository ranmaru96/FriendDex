import type { AppTheme } from '@/constants/theme';

export type UiPreviewVariant = 'stable' | 'preview';

export type FormLayout = 'vertical' | 'horizontal';
export type FormContainer = 'multiCard' | 'singlePanel';
export type SearchAreaStyle = 'doubleBorder' | 'singleBorder';
export type ListItemStyle = 'separateCards' | 'panelSections';
export type EpisodeListCardLayout = 'classic' | 'photoRight';
export type CalendarEventMemoDisplay = 'full' | 'twoLines' | 'oneLine';
export type CalendarMonthLayout = 'classic' | 'scheduleGrid';
export type CalendarEventTimeDisplay = 'badge' | 'plain' | 'column';

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
  calendarMonthLayout: CalendarMonthLayout;
  /** カレンダー予定カードの時刻表示 */
  calendarEventTimeDisplay: CalendarEventTimeDisplay;
  /** カレンダー予定カード内の参加者チップ背景 */
  calendarParticipantChipBackground: string;
  /** カレンダー予定カード内の参加者チップ形状 */
  calendarParticipantChipStyle: 'default' | 'fitted';
  /** カレンダー画面 ScrollView の左右余白（0 でフルブリード） */
  calendarScreenPaddingHorizontal: number;

  textPrimary: AppTheme['textPrimary'];
  textSecondary: AppTheme['textSecondary'];
  inputBg: AppTheme['inputBg'];
  inputBorder: AppTheme['inputBorder'];
  topBarText: AppTheme['topBarText'];
};
