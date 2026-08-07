import { Theme } from '@/constants/theme';
import { getCommonItemOptionByKindAndLabel } from '@/db';
import { normalizeEpisodeTag } from './episodeHelpers';

/** 予定タグのカレンダー帯色パレット（共通項目エディタでも使用）
 * 赤〜紫を色相で離し、グレー／茶をニュートラルとして足す（計14色）。
 */
export const EPISODE_TAG_COLOR_PALETTE = [
  '#DC2626', // 赤
  '#EC4899', // ピンク
  '#EA580C', // オレンジ
  '#CA8A04', // 黄（帯でも沈まない濃さ）
  '#65A30D', // 黄緑
  '#15803D', // 緑
  '#0F766E', // 青緑
  '#0891B2', // 水色
  '#2563EB', // 青
  '#1E3A8A', // 紺
  '#7C3AED', // 紫
  '#C026D3', // 赤紫
  '#9A3412', // 茶
  '#6B7280', // グレー
] as const;

const UNTAGGED_EVENT_COLOR = Theme.accent;

const hashTagLabel = (tag: string): number => {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return hash;
};

/** 登録色が無いタグ向けのハッシュ色 */
export const getHashedEpisodeTagColor = (tag: string): string => {
  const index = hashTagLabel(tag) % EPISODE_TAG_COLOR_PALETTE.length;
  return EPISODE_TAG_COLOR_PALETTE[index];
};

export const getEventCalendarColor = (episodeTag: string | null | undefined): string => {
  const tag = normalizeEpisodeTag(episodeTag);
  if (!tag) {
    return UNTAGGED_EVENT_COLOR;
  }
  const option = getCommonItemOptionByKindAndLabel('episode_tag', tag);
  if (option?.color) {
    return option.color;
  }
  return getHashedEpisodeTagColor(tag);
};
