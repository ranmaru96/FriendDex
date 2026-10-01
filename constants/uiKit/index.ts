import { previewUiKit } from './preview';
import { stableUiKit } from './stable';
import type {
  CalendarEventCardStyle,
  CalendarEventTimeDisplay,
  DetailProfileCardStyle,
  EpisodeListPhotoLayout,
  UiKit,
  UiPreviewVariant,
} from './types';

export type {
  CalendarEventCardStyle,
  CalendarEventMemoDisplay,
  CalendarEventTimeDisplay,
  CalendarMonthLayout,
  DetailProfileCardStyle,
  EpisodeListCardLayout,
  EpisodeListPhotoLayout,
  FormContainer,
  FormLayout,
  ListItemStyle,
  ListPanelStyle,
  ParticipantChipStyle,
  SectionDividerStyle,
  SearchAreaStyle,
  UiKit,
  UiPreviewVariant,
} from './types';
export { previewUiKit, stableUiKit };

const KITS: Record<UiPreviewVariant, UiKit> = {
  stable: stableUiKit,
  preview: previewUiKit,
};

export const UI_PREVIEW_OPTIONS: { value: UiPreviewVariant; label: string }[] = [
  { value: 'stable', label: stableUiKit.label },
  { value: 'preview', label: previewUiKit.label },
];

export function getUiKit(variant: UiPreviewVariant): UiKit {
  return KITS[variant] ?? stableUiKit;
}

export function normalizeUiPreviewVariant(value: string | null | undefined): UiPreviewVariant {
  return value === 'preview' ? 'preview' : 'stable';
}

export const CALENDAR_EVENT_TIME_DISPLAY_OPTIONS: {
  value: CalendarEventTimeDisplay;
  label: string;
}[] = [{ value: 'column', label: '固定列（左・区切り線）' }];

export function normalizeCalendarEventTimeDisplay(
  value: string | null | undefined
): CalendarEventTimeDisplay | null {
  if (value === 'column' || value === 'plain' || value === 'badge') {
    return 'column';
  }
  return null;
}

export const CALENDAR_EVENT_CARD_STYLE_OPTIONS: {
  value: CalendarEventCardStyle;
  label: string;
}[] = [{ value: 'roundedCards', label: '各予定を丸角カード化' }];

export function normalizeCalendarEventCardStyle(
  value: string | null | undefined
): CalendarEventCardStyle | null {
  if (value === 'roundedCards' || value === 'current') {
    return 'roundedCards';
  }
  return null;
}

export const EPISODE_LIST_PHOTO_LAYOUT_OPTIONS: {
  value: EpisodeListPhotoLayout;
  label: string;
}[] = [
  { value: 'tallOne', label: '1枚・縦幅3行分' },
  { value: 'compactTwoSideBySide', label: '2枚・縦幅2行分' },
];

export function normalizeEpisodeListPhotoLayout(
  value: string | null | undefined
): EpisodeListPhotoLayout | null {
  if (value === 'compactOne') {
    // 旧「コンパクト1枚」は縦長1枚へ寄せる
    return 'tallOne';
  }
  if (value === 'compactTwoSideBySide' || value === 'tallOne') {
    return value;
  }
  return null;
}

export function episodeListPhotoSpanRowsForLayout(layout: EpisodeListPhotoLayout): number {
  return layout === 'tallOne' ? 3 : 2;
}

export const DETAIL_PROFILE_CARD_STYLE_OPTIONS: {
  value: DetailProfileCardStyle;
  label: string;
}[] = [{ value: 'flat', label: 'フラット（枠なし）' }];

export function normalizeDetailProfileCardStyle(
  value: string | null | undefined
): DetailProfileCardStyle | null {
  if (value === 'flat' || value === 'card') {
    return 'flat';
  }
  return null;
}
