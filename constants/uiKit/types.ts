import type { AppTheme } from '@/constants/theme';

export type UiPreviewVariant = 'stable' | 'preview';

export type FormLayout = 'vertical' | 'horizontal';
export type FormContainer = 'multiCard' | 'singlePanel';
export type SearchAreaStyle = 'doubleBorder' | 'singleBorder';
export type ListItemStyle = 'separateCards' | 'panelSections';
export type ListPanelStyle = 'roundedPanel' | 'edgeFlat';
export type SectionDividerStyle = 'hairline' | 'bold2px';
export type ParticipantChipStyle = 'default' | 'fitted';
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
  /** フォーム外パネルの角丸（エピソード編集など） */
  formPanelBorderRadius: number;
  /** フォーム内フィールド・ボタンの角丸 */
  formFieldBorderRadius: number;
  searchAreaStyle: SearchAreaStyle;
  /** 検索エリア内 padding */
  searchAreaPadding: number;
  /** 検索エリア行内のフィールド間隔 */
  searchAreaRowGap: number;
  /** 検索エリア行間の間隔 */
  searchAreaFieldGap: number;
  /** 検索フィールドの角丸 */
  searchAreaFieldBorderRadius: number;
  /** フィールド上にラベル表示 */
  searchAreaShowFieldLabels: boolean;
  /** 検索エリア下〜リスト間の余白（singleBorder 時・区切り線の下） */
  searchAreaBottomGap: number;
  /** 検索フィールド下端〜区切り線の余白（singleBorder 時） */
  searchAreaDividerGapBefore: number;
  listItemStyle: ListItemStyle;
  /** panelSections 時のパネル形状（edgeFlat = カレンダー案5） */
  listPanelStyle: ListPanelStyle;
  sectionDividerStyle: SectionDividerStyle;
  participantChipStyle: ParticipantChipStyle;
  participantChipBackground: string;
  episodeListCardLayout: EpisodeListCardLayout;
  /** ボトムタブの一覧画面（一覧・ツール・友達など）の左右余白 */
  listScreenPaddingHorizontal: number;
  /** エピソード一覧 ScrollView の左右余白 */
  episodeListPaddingHorizontal: number;
  /** エピソード一覧のカード間隔 */
  episodeListCardGap: number;
  /** エピソード一覧カードの角丸 */
  episodeListCardBorderRadius: number;
  /** エピソード一覧カード写真の右側縦占有行数（2=タイトル+メタのみ、3=参加者行まで） */
  episodeListPhotoSpanRows: number;
  calendarEventMemoDisplay: CalendarEventMemoDisplay;
  calendarMonthLayout: CalendarMonthLayout;
  /** カレンダー予定カードの時刻表示 */
  calendarEventTimeDisplay: CalendarEventTimeDisplay;
  /** カレンダー画面 ScrollView の左右余白（0 でフルブリード） */
  calendarScreenPaddingHorizontal: number;
  /** badge 表示時の予定リスト左右余白（0 なら従来どおり） */
  calendarEventListPaddingHorizontal: number;
  /** badge 表示時の予定カード間隔 */
  calendarEventCardGap: number;
  /** badge 表示時の予定カード角丸 */
  calendarEventCardBorderRadius: number;
  /** 共通項目画面の外パネル角丸（0 でカレンダー風フルブリード） */
  commonItemsPanelBorderRadius: number;
  /** 共通項目のタブ・タグ左右余白（区切り線インセットと揃える） */
  commonItemsContentPaddingHorizontal: number;
  /** 一覧画面の人物カード間隔（縦・横） */
  friendHomeCardGap: number;
  /** 一覧画面の人物カード・名前枠の上下 padding */
  friendHomeCardNamePaddingVertical: number;
  /** ツール画面のカード角丸 */
  toolScreenCardBorderRadius: number;
  /** ツール画面のアイコン背景角丸 */
  toolScreenIconBorderRadius: number;
  /** ツール画面のサブタイトル表示 */
  toolScreenShowSubtitle: boolean;
  /** お金貸し借り・人物シャッフル等 SubTool 画面の左右余白 */
  subToolScreenPaddingHorizontal: number;
  /** 友達画面のカード・行・ツールバー角丸（Preview 適用） */
  friendsScreenBorderRadius: number;

  textPrimary: AppTheme['textPrimary'];
  textSecondary: AppTheme['textSecondary'];
  inputBg: AppTheme['inputBg'];
  inputBorder: AppTheme['inputBorder'];
  topBarText: AppTheme['topBarText'];
};
