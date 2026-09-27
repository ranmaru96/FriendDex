import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { getGoogleClientIds } from '@/lib/googleAuth';
import { getSupabaseClient, signInWithIdTokenProvider } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export type SocialProvider = 'google' | 'apple';

export type SocialAuthResult = {
  session: Session | null;
  cancelled: boolean;
  errorMessage: string | null;
};

const NATIVE_REQUIRED =
  'この端末の Dev Client では使えません。Google / Apple ログイン用の新しい development ビルドが必要です。';

const empty = (partial: Partial<SocialAuthResult> = {}): SocialAuthResult => ({
  session: null,
  cancelled: false,
  errorMessage: null,
  ...partial,
});

const createNoncePair = async (): Promise<{ rawNonce: string; hashedNonce: string }> => {
  const rawNonce = Array.from(Crypto.getRandomBytes(16))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  return { rawNonce, hashedNonce };
};

let googleConfigured = false;

const ensureGoogleConfigured = (): string | null => {
  const ids = getGoogleClientIds();
  if (!ids.webClientId) {
    return 'Google の Web クライアント ID が未設定です。';
  }
  if (googleConfigured) {
    return null;
  }
  GoogleSignin.configure({
    webClientId: ids.webClientId,
    ...(ids.iosClientId ? { iosClientId: ids.iosClientId } : {}),
    scopes: ['openid', 'email', 'profile'],
    offlineAccess: false,
  });
  googleConfigured = true;
  return null;
};

const finishWithToken = async (
  provider: SocialProvider,
  token: string,
  nonce?: string
): Promise<SocialAuthResult> => {
  if (!getSupabaseClient()) {
    return empty({ errorMessage: 'Supabase が未設定です' });
  }
  const result = await signInWithIdTokenProvider(provider, token, nonce);
  return empty({
    session: result.session,
    errorMessage: result.errorMessage,
  });
};

export const signInWithGoogleAccount = async (): Promise<SocialAuthResult> => {
  try {
    const configError = ensureGoogleConfigured();
    if (configError) {
      return empty({ errorMessage: configError });
    }
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      return empty({ cancelled: true });
    }
    if (!isSuccessResponse(response)) {
      return empty({ errorMessage: 'Google ログインを完了できませんでした。' });
    }
    const idToken = response.data.idToken?.trim() ?? '';
    if (!idToken) {
      return empty({ errorMessage: 'Google の ID トークンを取得できませんでした。' });
    }
    return finishWithToken('google', idToken);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return empty({ cancelled: true });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/native module|RNGoogleSignin|not linked|TurboModule/i.test(message)) {
      return empty({ errorMessage: NATIVE_REQUIRED });
    }
    return empty({ errorMessage: message || NATIVE_REQUIRED });
  }
};

export const signInWithAppleAccount = async (): Promise<SocialAuthResult> => {
  if (Platform.OS !== 'ios') {
    return empty({ errorMessage: 'Apple ID でのログインは iPhone のみです。' });
  }
  try {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      return empty({ errorMessage: 'この端末では Sign in with Apple を使えません。' });
    }
    const { rawNonce, hashedNonce } = await createNoncePair();
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    const idToken = credential.identityToken?.trim() ?? '';
    if (!idToken) {
      return empty({ errorMessage: 'Apple の ID トークンを取得できませんでした。' });
    }
    return finishWithToken('apple', idToken, rawNonce);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'ERR_REQUEST_CANCELED') {
      return empty({ cancelled: true });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/native module|ExpoAppleAuthentication|not linked|TurboModule/i.test(message)) {
      return empty({ errorMessage: NATIVE_REQUIRED });
    }
    return empty({ errorMessage: message || NATIVE_REQUIRED });
  }
};
