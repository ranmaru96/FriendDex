import { addCommonItemOption } from '../db';
import { normalizeEpisodeTag } from './episodeHelpers';

/**
 * 本体の保存成功後に予定タグを共通項目へ登録する。
 * 本体保存を優先し、候補登録だけの失敗は保存失敗として扱わない。
 */
export const registerSavedEpisodeTag = (value: string | null | undefined): boolean => {
  const normalized = normalizeEpisodeTag(value);
  if (!normalized) {
    return true;
  }

  try {
    return addCommonItemOption('episode_tag', normalized, null) != null;
  } catch (error) {
    console.warn('Failed to register saved episode tag in common items.', error);
    return false;
  }
};
