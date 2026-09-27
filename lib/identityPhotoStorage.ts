import type { SupabaseClient } from '@supabase/supabase-js';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  persistImageFromBase64,
  persistImageFromRemoteUrl,
  readPersistedImageAsBase64,
} from '@/utils/persistImageFile';

export const IDENTITY_PHOTO_BUCKET = 'identity-photos';
export const OWNED_PERSON_PHOTO_BUCKET = 'owned-person-photos';
export const OWNED_EPISODE_PHOTO_BUCKET = 'owned-episode-photos';
export const SHARED_EPISODE_PHOTO_BUCKET = 'shared-episode-photos';

const objectPathForUser = (authUserId: string): string => `${authUserId}/avatar.jpg`;

const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = bytes.subarray(index, index + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

/** 本人写真は公開オフでも Storage に残す。ファイルが無いときだけ消す */
export async function syncIdentityPhotoUpload(
  supabase: SupabaseClient,
  authUserId: string,
  localPhotoUri: string | null | undefined
): Promise<string | null> {
  const path = objectPathForUser(authUserId);
  const uri = localPhotoUri?.trim() ?? '';
  if (!uri) {
    await supabase.storage.from(IDENTITY_PHOTO_BUCKET).remove([path]);
    return null;
  }
  const base64 = await readPersistedImageAsBase64(uri);
  if (!base64) {
    return null;
  }
  const { error } = await supabase.storage.from(IDENTITY_PHOTO_BUCKET).upload(path, base64ToUint8Array(base64), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) {
    return null;
  }
  return path;
}

const ownedPersonPhotoPath = (ownerId: string, localFriendId: string): string =>
  `${ownerId}/cards/${localFriendId}.jpg`;

/** 自分の手帳用写真。失敗しても文字同期は止めない */
export async function syncOwnedPersonPhotoUpload(
  supabase: SupabaseClient,
  ownerId: string,
  localFriendId: string,
  localPhotoUri: string | null | undefined
): Promise<string | null> {
  const friendId = localFriendId.trim();
  if (!ownerId.trim() || !friendId || friendId.includes('..') || friendId.includes('/')) {
    return null;
  }
  const path = ownedPersonPhotoPath(ownerId, friendId);
  const uri = localPhotoUri?.trim() ?? '';
  if (!uri) {
    await supabase.storage.from(OWNED_PERSON_PHOTO_BUCKET).remove([path]);
    return null;
  }
  const base64 = await readPersistedImageAsBase64(uri);
  if (!base64) {
    return null;
  }
  const { error } = await supabase.storage.from(OWNED_PERSON_PHOTO_BUCKET).upload(path, base64ToUint8Array(base64), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) {
    return null;
  }
  return path;
}

const ownedEpisodePhotoPath = (ownerId: string, episodeId: string, localPhotoId: number): string =>
  `${ownerId}/episodes/${episodeId}_${localPhotoId}.jpg`;

const EPISODE_PHOTO_MAX_EDGE = 1024;
const STORAGE_LIMIT_BYTES = 2_097_152;

export type OwnedEpisodePhotoUploadResult = {
  path: string | null;
  errorMessage: string | null;
  /** 端末のファイルが無い／読めない。他の写真の送信は続ける */
  unreadable: boolean;
};

const toLocalPhotoId = (value: unknown): number | null => {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    return Number.isSafeInteger(asNumber) && asNumber > 0 ? asNumber : null;
  }
  const asNumber = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return null;
  }
  return Math.floor(asNumber);
};

/** 人物カードと同じく 1024px JPEG にしてから上げる。失敗理由は呼び出し側へ返す */
const encodeEpisodePhotoJpeg = async (
  uri: string
): Promise<{ bytes: Uint8Array | null; errorMessage: string | null }> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: EPISODE_PHOTO_MAX_EDGE } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (result.base64) {
      const bytes = base64ToUint8Array(result.base64);
      if (bytes.byteLength > 0 && bytes.byteLength <= STORAGE_LIMIT_BYTES) {
        return { bytes, errorMessage: null };
      }
    }
  } catch {
    // 縮小できないときは元ファイルを試す
  }
  const base64 = await readPersistedImageAsBase64(uri);
  if (!base64) {
    return { bytes: null, errorMessage: 'エピソード写真を読めませんでした' };
  }
  const bytes = base64ToUint8Array(base64);
  if (bytes.byteLength > STORAGE_LIMIT_BYTES) {
    return { bytes: null, errorMessage: 'エピソード写真が大きすぎます（2MBまで）' };
  }
  return { bytes, errorMessage: null };
};

export async function syncOwnedEpisodePhotoUpload(
  supabase: SupabaseClient,
  ownerId: string,
  episodeId: string,
  localPhotoId: unknown,
  localPhotoUri: string | null | undefined
): Promise<OwnedEpisodePhotoUploadResult> {
  const trimmedEpisodeId = episodeId.trim();
  const photoId = toLocalPhotoId(localPhotoId);
  if (
    !ownerId.trim() ||
    !trimmedEpisodeId ||
    trimmedEpisodeId.includes('..') ||
    trimmedEpisodeId.includes('/') ||
    photoId == null
  ) {
    return { path: null, errorMessage: 'エピソード写真のIDが不正です', unreadable: true };
  }
  const path = ownedEpisodePhotoPath(ownerId, trimmedEpisodeId, photoId);
  const uri = localPhotoUri?.trim() ?? '';
  if (!uri) {
    await supabase.storage.from(OWNED_EPISODE_PHOTO_BUCKET).remove([path]);
    return { path: null, errorMessage: 'エピソード写真のファイルがありません', unreadable: true };
  }
  const encoded = await encodeEpisodePhotoJpeg(uri);
  if (!encoded.bytes) {
    return { path: null, errorMessage: encoded.errorMessage, unreadable: true };
  }
  const { error } = await supabase.storage.from(OWNED_EPISODE_PHOTO_BUCKET).upload(path, encoded.bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) {
    return { path: null, errorMessage: error.message, unreadable: false };
  }
  return { path, errorMessage: null, unreadable: false };
}

export async function removeOwnedEpisodePhotoFiles(
  supabase: SupabaseClient,
  paths: string[]
): Promise<void> {
  const cleaned = paths.map((path) => path.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return;
  }
  await supabase.storage.from(OWNED_EPISODE_PHOTO_BUCKET).remove(cleaned);
}

const sharedEpisodePhotoPath = (ownerId: string, episodeId: string, localPhotoId: number): string =>
  `${ownerId.trim().toLowerCase()}/${episodeId}/${localPhotoId}.jpg`;

export async function syncSharedEpisodePhotoUpload(
  supabase: SupabaseClient,
  ownerId: string,
  episodeId: string,
  localPhotoId: unknown,
  localPhotoUri: string | null | undefined
): Promise<OwnedEpisodePhotoUploadResult> {
  const trimmedEpisodeId = episodeId.trim();
  const photoId = toLocalPhotoId(localPhotoId);
  if (
    !ownerId.trim() ||
    !trimmedEpisodeId ||
    trimmedEpisodeId.includes('..') ||
    trimmedEpisodeId.includes('/') ||
    photoId == null
  ) {
    return { path: null, errorMessage: 'エピソード写真のIDが不正です', unreadable: true };
  }
  const path = sharedEpisodePhotoPath(ownerId, trimmedEpisodeId, photoId);
  const uri = localPhotoUri?.trim() ?? '';
  if (!uri) {
    await supabase.storage.from(SHARED_EPISODE_PHOTO_BUCKET).remove([path]);
    return { path: null, errorMessage: 'エピソード写真のファイルがありません', unreadable: true };
  }
  const encoded = await encodeEpisodePhotoJpeg(uri);
  if (!encoded.bytes) {
    return { path: null, errorMessage: encoded.errorMessage, unreadable: true };
  }
  const { error } = await supabase.storage.from(SHARED_EPISODE_PHOTO_BUCKET).upload(path, encoded.bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) {
    return { path: null, errorMessage: error.message, unreadable: false };
  }
  return { path, errorMessage: null, unreadable: false };
}

export async function removeSharedEpisodePhotoFiles(
  supabase: SupabaseClient,
  paths: string[]
): Promise<void> {
  const cleaned = paths.map((path) => path.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return;
  }
  await supabase.storage.from(SHARED_EPISODE_PHOTO_BUCKET).remove(cleaned);
}

const blobToBase64 = async (blob: Blob): Promise<string | null> => {
  if (typeof blob.arrayBuffer === 'function') {
    try {
      const buffer = await blob.arrayBuffer();
      return uint8ToBase64(new Uint8Array(buffer));
    } catch {
      // RN の Blob では arrayBuffer が無い／落ちることがある
    }
  }
  if (typeof FileReader === 'undefined') {
    return null;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        resolve(null);
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
};

export async function downloadIdentityPhoto(
  supabase: SupabaseClient,
  photoPath: string | null | undefined
): Promise<string | null> {
  return downloadOwnedBucketPhoto(supabase, IDENTITY_PHOTO_BUCKET, photoPath);
}

export async function downloadOwnedBucketPhoto(
  supabase: SupabaseClient,
  bucket: string,
  photoPath: string | null | undefined
): Promise<string | null> {
  const path = photoPath?.trim() ?? '';
  if (!path || path.includes('..')) {
    return null;
  }

  const signed = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (!signed.error && signed.data?.signedUrl) {
    const persisted = await persistImageFromRemoteUrl(signed.data.signedUrl);
    if (persisted) {
      return persisted;
    }
  }

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    return null;
  }
  try {
    const base64 = await blobToBase64(data);
    if (!base64) {
      return null;
    }
    return persistImageFromBase64(base64);
  } catch {
    return null;
  }
}
