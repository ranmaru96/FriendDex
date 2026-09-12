const PHOTOS_DIR_MARKER = '/photos/';
/** persistImageFile が付ける名前。これ以外はアプリ管理外とみなす。 */
const PERSISTED_PHOTO_FILENAME = /^photo_\d+_\d+\.jpe?g$/i;

const getFileSystem = () => require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');

const getDocumentDirectory = (): string | null => getFileSystem().documentDirectory ?? null;

const getPhotosDirectory = (): string => `${getDocumentDirectory() ?? ''}photos/`;

const ensurePhotosDirectory = async (): Promise<void> => {
  const fileSystem = getFileSystem();
  const photosDirectory = getPhotosDirectory();
  const info = await fileSystem.getInfoAsync(photosDirectory);
  if (!info.exists) {
    await fileSystem.makeDirectoryAsync(photosDirectory, { intermediates: true });
  }
};

/** `.../photos/<filename>` からファイル名だけ取り出す。アプリ管理外なら null。 */
export const extractPersistedPhotoFilename = (uri: string | null | undefined): string | null => {
  const normalized = uri?.trim() ?? '';
  if (!normalized) {
    return null;
  }
  const markerIndex = normalized.lastIndexOf(PHOTOS_DIR_MARKER);
  if (markerIndex < 0) {
    return null;
  }
  const rawName = normalized.slice(markerIndex + PHOTOS_DIR_MARKER.length).split(/[?#]/)[0] ?? '';
  let filename = rawName;
  try {
    filename = decodeURIComponent(rawName);
  } catch {
    filename = rawName;
  }
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  if (!PERSISTED_PHOTO_FILENAME.test(filename)) {
    return null;
  }
  return filename;
};

/**
 * コンテナ UUID が変わった古い絶対パスを、今の documentDirectory 配下へ付け替える。
 * `/photos/` を含まない URI はそのまま返す。
 */
export const resolvePersistedImageUri = (uri: string | null | undefined): string | null => {
  const normalized = uri?.trim() ?? '';
  if (!normalized) {
    return null;
  }
  const filename = extractPersistedPhotoFilename(normalized);
  const documentDirectory = getDocumentDirectory();
  if (!filename || !documentDirectory) {
    return normalized;
  }
  return `${documentDirectory}photos/${filename}`;
};

/**
 * ImagePicker / ImageManipulator が返すキャッシュ URI を
 * documentDirectory 配下へコピーして永続 URI を返す。
 * コピーに失敗した場合は元 URI を返す（保存自体は継続させる）。
 */
export const persistImageFile = async (tempUri: string): Promise<string> => {
  const source = tempUri.trim();
  if (!source) {
    return source;
  }
  if (isPersistedImageUri(source)) {
    return resolvePersistedImageUri(source) ?? source;
  }
  try {
    await ensurePhotosDirectory();
    const filename = `photo_${Date.now()}_${Math.floor(Math.random() * 100000)}.jpg`;
    const destUri = `${getPhotosDirectory()}${filename}`;
    await getFileSystem().copyAsync({ from: source, to: destUri });
    return destUri;
  } catch (error) {
    console.warn('Failed to persist image file.', error);
    return source;
  }
};

/** photos ディレクトリ配下（＝アプリが管理している実体）か。コンテナ UUID が古くても true。 */
export const isPersistedImageUri = (uri: string | null | undefined): boolean =>
  extractPersistedPhotoFilename(uri) != null;

/**
 * 永続化済み画像を削除する。アプリ管理外の URI は無視する。
 * 呼び出し側の処理を止めないよう、失敗しても例外は投げない。
 */
export const deletePersistedImage = async (uri: string | null | undefined): Promise<void> => {
  if (!isPersistedImageUri(uri)) {
    return;
  }
  const resolved = resolvePersistedImageUri(uri);
  if (!resolved) {
    return;
  }
  try {
    await getFileSystem().deleteAsync(resolved, { idempotent: true });
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
