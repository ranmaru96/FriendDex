import { previewUiKit } from './preview';
import { stableUiKit } from './stable';
import type { CalendarEventTimeDisplay, UiKit, UiPreviewVariant } from './types';

export type {
  CalendarEventMemoDisplay,
  CalendarEventTimeDisplay,
  CalendarMonthLayout,
  EpisodeListCardLayout,
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
