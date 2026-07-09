import { previewUiKit } from './preview';
import { stableUiKit } from './stable';
import type { UiKit, UiPreviewVariant } from './types';

export type {
  CalendarEventMemoDisplay,
  EpisodeListCardLayout,
  FormContainer,
  FormLayout,
  ListItemStyle,
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
