import { addCommonItemOption } from '../db';
import type { CommonItemKind } from '../types';
import { normalizeEpisodeTag } from './episodeHelpers';

const registerSavedTag = (
  kind: Extract<CommonItemKind, 'episode_tag' | 'location_tag'>,
  value: string | null | undefined
): boolean => {
  const normalized = normalizeEpisodeTag(value);
  if (!normalized) {
    return true;
  }

  try {
    return addCommonItemOption(kind, normalized, null) != null;
  } catch (error) {
    console.warn(`Failed to register saved ${kind} in common items.`, error);
    return false;
  }
};

/**
 * 本体の保存成功後に予定タグを共通項目へ登録する。
 * 本体保存を優先し、候補登録だけの失敗は保存失敗として扱わない。
 */
export const registerSavedEpisodeTag = (value: string | null | undefined): boolean =>
  registerSavedTag('episode_tag', value);

export const registerSavedLocationTag = (value: string | null | undefined): boolean =>
  registerSavedTag('location_tag', value);
