import {
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';

/** 永続化した画像の保存先（documentDirectory 配下）。 */
const PHOTOS_DIRECTORY = `${documentDirectory}photos/`;

const ensurePhotosDirectory = async (): Promise<void> => {
  const info = await getInfoAsync(PHOTOS_DIRECTORY);
  if (!info.exists) {
    await makeDirectoryAsync(PHOTOS_DIRECTORY, { intermediates: true });
  }
};

/**
 * ImagePicker / ImageManipulator が返すキャッシュ URI を
 * documentDirectory 配下へコピーして永続 URI を返す。
 * コピーに失敗した場合は元 URI を返す（保存自体は継続させる）。
 */
export const persistImageFile = async (tempUri: string): Promise<string> => {
  const source = tempUri.trim();
  if (!source || isPersistedImageUri(source)) {
    return source;
  }
  try {
    await ensurePhotosDirectory();
    const filename = `photo_${Date.now()}_${Math.floor(Math.random() * 100000)}.jpg`;
    const destUri = `${PHOTOS_DIRECTORY}${filename}`;
    await copyAsync({ from: source, to: destUri });
    return destUri;
  } catch (error) {
    console.warn('Failed to persist image file.', error);
    return source;
  }
};

/** photos ディレクトリ配下（＝アプリが管理している実体）か。 */
export const isPersistedImageUri = (uri: string | null | undefined): boolean => {
  const normalized = uri?.trim() ?? '';
  return normalized.startsWith(PHOTOS_DIRECTORY);
};

/**
 * 永続化済み画像を削除する。アプリ管理外の URI は無視する。
 * 呼び出し側の処理を止めないよう、失敗しても例外は投げない。
 */
export const deletePersistedImage = async (uri: string | null | undefined): Promise<void> => {
  if (!isPersistedImageUri(uri)) {
    return;
  }
  try {
    await deleteAsync(uri as string, { idempotent: true });
  } catch (error) {
    console.warn('Failed to delete persisted image file.', error);
  }
};

/** 同期処理から呼ぶ用（削除完了を待たない）。 */
export const deletePersistedImages = (uris: Array<string | null | undefined>): void => {
  uris.forEach((uri) => {
    void deletePersistedImage(uri);
  });
};
