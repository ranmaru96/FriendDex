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
import { getSupabaseClient, signInWithIdTokenProvider, signOutSupabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export type SocialProvider = 'google' | 'apple';

export type SocialAuthResult = {
  session: Session | null;
  cancelled: boolean;
  errorMessage: string | null;
};

export type LinkIdentityResult = {
  cancelled: boolean;
  errorMessage: string | null;
  userId: string | null;
  switchedAccount: boolean;
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

type ObtainedCredential =
  | { ok: true; provider: 'google'; token: string; accessToken: string | null }
  | { ok: true; provider: 'apple'; token: string; nonce: string }
  | { ok: false; cancelled: boolean; errorMessage: string };

const failedCredential = (
  error: unknown
): { ok: false; cancelled: boolean; errorMessage: string } => {
  const message = error instanceof Error ? error.message : String(error);
  if (/native module|RNGoogleSignin|ExpoAppleAuthentication|not linked|TurboModule/i.test(message)) {
    return { ok: false, cancelled: false, errorMessage: NATIVE_REQUIRED };
  }
  return { ok: false, cancelled: false, errorMessage: message || NATIVE_REQUIRED };
};

const obtainGoogleCredential = async (): Promise<
  | { ok: true; provider: 'google'; token: string; accessToken: string | null }
  | { ok: false; cancelled: boolean; errorMessage: string }
> => {
  try {
    const configError = ensureGoogleConfigured();
    if (configError) {
      return { ok: false, cancelled: false, errorMessage: configError };
    }
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      return { ok: false, cancelled: true, errorMessage: '' };
    }
    if (!isSuccessResponse(response)) {
      return { ok: false, cancelled: false, errorMessage: 'Google ログインを完了できませんでした。' };
    }
    const idToken = response.data.idToken?.trim() ?? '';
    if (!idToken) {
      return { ok: false, cancelled: false, errorMessage: 'Google の ID トークンを取得できませんでした。' };
    }
    let accessToken: string | null = null;
    try {
      const tokens = await GoogleSignin.getTokens();
      accessToken = tokens.accessToken?.trim() || null;
    } catch {
      accessToken = null;
    }
    return { ok: true, provider: 'google', token: idToken, accessToken };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { ok: false, cancelled: true, errorMessage: '' };
    }
    return failedCredential(error);
  }
};

const obtainAppleCredential = async (): Promise<
  | { ok: true; provider: 'apple'; token: string; nonce: string }
  | { ok: false; cancelled: boolean; errorMessage: string }
> => {
  if (Platform.OS !== 'ios') {
    return { ok: false, cancelled: false, errorMessage: 'Apple ID でのログインは iPhone のみです。' };
  }
  try {
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      return { ok: false, cancelled: false, errorMessage: 'この端末では Sign in with Apple を使えません。' };
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
      return { ok: false, cancelled: false, errorMessage: 'Apple の ID トークンを取得できませんでした。' };
    }
    return { ok: true, provider: 'apple', token: idToken, nonce: rawNonce };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'ERR_REQUEST_CANCELED') {
      return { ok: false, cancelled: true, errorMessage: '' };
    }
    return failedCredential(error);
  }
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

const credentialFailure = (credential: Extract<ObtainedCredential, { ok: false }>): SocialAuthResult =>
  empty({
    cancelled: credential.cancelled,
    errorMessage: credential.cancelled ? null : credential.errorMessage,
  });

export const signInWithGoogleAccount = async (): Promise<SocialAuthResult> => {
  const credential = await obtainGoogleCredential();
  if (!credential.ok) {
    return credentialFailure(credential);
  }
  return finishWithToken('google', credential.token);
};

export const signInWithAppleAccount = async (): Promise<SocialAuthResult> => {
  const credential = await obtainAppleCredential();
  if (!credential.ok) {
    return credentialFailure(credential);
  }
  return finishWithToken('apple', credential.token, credential.nonce);
};

const friendlyLinkError = (message: string): string => {
  if (/manual linking/i.test(message)) {
    return 'サーバー側で手動の紐づけが無効です。Supabase の Authentication で Manual linking を有効にしてください。';
  }
  return message;
};

/** ログイン中のユーザーに Google / Apple を足す。別ユーザーのセッションには切り替えない。 */
export const linkNativeIdentityToCurrentUser = async (
  provider: SocialProvider
): Promise<LinkIdentityResult> => {
  const credential = provider === 'google' ? await obtainGoogleCredential() : await obtainAppleCredential();
  if (!credential.ok) {
    return {
      cancelled: credential.cancelled,
      errorMessage: credential.cancelled ? null : credential.errorMessage,
      userId: null,
      switchedAccount: false,
    };
  }
  if (credential.provider === 'google' && !credential.accessToken) {
    return {
      cancelled: false,
      errorMessage: 'Google のアクセストークンを取得できませんでした。',
      userId: null,
      switchedAccount: false,
    };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      cancelled: false,
      errorMessage: 'Supabase が未設定です',
      userId: null,
      switchedAccount: false,
    };
  }
  const before = await supabase.auth.getSession();
  const beforeId = before.data.session?.user.id?.trim() ?? '';
  if (!beforeId) {
    return {
      cancelled: false,
      errorMessage: 'セッションがありません。',
      userId: null,
      switchedAccount: false,
    };
  }
  const { data, error } = await supabase.auth.linkIdentity(
    credential.provider === 'google'
      ? { provider: 'google', token: credential.token, access_token: credential.accessToken ?? '' }
      : { provider: 'apple', token: credential.token, nonce: credential.nonce }
  );
  if (error) {
    return {
      cancelled: false,
      errorMessage: friendlyLinkError(error.message),
      userId: beforeId,
      switchedAccount: false,
    };
  }
  const nextId = data.session?.user.id?.trim() || data.user?.id?.trim() || '';
  if (!nextId || nextId !== beforeId) {
    await signOutSupabase();
    return {
      cancelled: false,
      errorMessage: '別のアカウントに切り替わったため、中断しました。メールアドレスで入り直してください。',
      userId: null,
      switchedAccount: true,
    };
  }
  return {
    cancelled: false,
    errorMessage: null,
    userId: nextId,
    switchedAccount: false,
  };
};
