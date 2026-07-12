import { previewUiKit } from './preview';
import { stableUiKit } from './stable';
import type {
  CalendarEventTimeDisplay,
  EpisodeListPhotoLayout,
  UiKit,
  UiPreviewVariant,
} from './types';

export type {
  CalendarEventMemoDisplay,
  CalendarEventTimeDisplay,
  CalendarMonthLayout,
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
}[] = [
  { value: 'plain', label: 'プレーン（左・背景なし）' },
  { value: 'column', label: '固定列（左・区切り線）' },
  { value: 'badge', label: 'バッジ（従来）' },
];

export function normalizeCalendarEventTimeDisplay(
  value: string | null | undefined
): CalendarEventTimeDisplay | null {
  if (value === 'plain' || value === 'column' || value === 'badge') {
    return value;
  }
  return null;
}

export const EPISODE_LIST_PHOTO_LAYOUT_OPTIONS: {
  value: EpisodeListPhotoLayout;
  label: string;
}[] = [
  { value: 'compactOne', label: 'コンパクト1枚（タイトル+日付行）' },
  { value: 'compactTwoSideBySide', label: 'コンパクト2枚横並び' },
  { value: 'tallOne', label: '縦長1枚（参加者行まで）' },
];

export function normalizeEpisodeListPhotoLayout(
  value: string | null | undefined
): EpisodeListPhotoLayout | null {
  if (value === 'compactOne' || value === 'compactTwoSideBySide' || value === 'tallOne') {
    return value;
  }
  return null;
}

export function episodeListPhotoSpanRowsForLayout(layout: EpisodeListPhotoLayout): number {
  return layout === 'tallOne' ? 3 : 2;
}
