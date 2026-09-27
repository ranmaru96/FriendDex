import {
  BOUND_AUTH_USER_ID_KEY,
  getAppSetting,
  initializeDatabase,
  setAppSetting,
} from '@/db';
import { signOutSupabase } from '@/lib/supabase';

export const DEVICE_BIND_MISMATCH_MESSAGE =
  'この端末は別のアカウントで使われています。同じアカウントで入るか、アプリを削除してから別アカウントで入ってください。';

export const getBoundAuthUserId = (): string => {
  initializeDatabase();
  return getAppSetting(BOUND_AUTH_USER_ID_KEY)?.trim() ?? '';
};

const persistBoundAuthUserId = (authUserId: string): void => {
  initializeDatabase();
  setAppSetting(BOUND_AUTH_USER_ID_KEY, authUserId);
};

export const discardForeignAuthSession = async (): Promise<void> => {
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // Google 未設定・未ログインなら無視
  }
  await signOutSupabase();
};

export type DeviceBindResult = { ok: true } | { ok: false; errorMessage: string };

/** 端末に紐づくアカウントだけ通す。初回のみ紐付ける。ログアウトでは消さない。 */
export async function adoptAuthUserOnThisDevice(authUserId: string): Promise<DeviceBindResult> {
  const id = authUserId.trim();
  if (!id) {
    return { ok: false, errorMessage: 'セッションがありません。' };
  }
  const bound = getBoundAuthUserId();
  if (bound && bound !== id) {
    await discardForeignAuthSession();
    return { ok: false, errorMessage: DEVICE_BIND_MISMATCH_MESSAGE };
  }
  if (!bound) {
    persistBoundAuthUserId(id);
  }
  return { ok: true };
}

export const isAuthUserAllowedOnThisDevice = (authUserId: string): boolean => {
  const id = authUserId.trim();
  if (!id) {
    return false;
  }
  const bound = getBoundAuthUserId();
  return !bound || bound === id;
};
