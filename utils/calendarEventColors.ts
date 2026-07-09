import { Theme } from '@/constants/theme';
import { normalizeEpisodeTag } from './episodeHelpers';

/** エピソードタグごとのカレンダー帯色（未設定タグは accent） */
const TAG_COLOR_PALETTE = [
  '#E85D75',
  '#7C5CBF',
  '#2A9D5A',
  '#F4A261',
  '#457B9D',
  '#6D597A',
  '#E76F51',
  '#2A6F97',
  '#9B5DE5',
  '#06A77D',
] as const;

const UNTAGGED_EVENT_COLOR = Theme.accent;

const hashTagLabel = (tag: string): number => {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const getEventCalendarColor = (episodeTag: string | null | undefined): string => {
  const tag = normalizeEpisodeTag(episodeTag);
  if (!tag) {
    return UNTAGGED_EVENT_COLOR;
  }
  const index = hashTagLabel(tag) % TAG_COLOR_PALETTE.length;
  return TAG_COLOR_PALETTE[index];
};
