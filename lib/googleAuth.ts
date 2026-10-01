import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { GOOGLE_CALENDAR_SCOPE } from '@/constants/googleCalendar';
import {
  deleteAppSetting,
  getAppSetting,
  GOOGLE_CALENDAR_NEEDS_REAUTH_KEY,
  initializeDatabase,
  setAppSetting,
} from '@/db';

const TOKEN_STORAGE_KEY = 'google_calendar_tokens';

export const GOOGLE_AUTH_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export type GoogleClientIds = {
  iosClientId?: string;
  androidClientId?: string;
  webClientId?: string;
};

export type StoredGoogleTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export type GoogleAuthTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

const readExtraString = (key: string): string | undefined => {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const value = extra[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const readEnvString = (value: string | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined;

export const getGoogleClientIds = (): GoogleClientIds => ({
  iosClientId:
    readExtraString('googleIosClientId') ??
    readEnvString(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  androidClientId:
    readExtraString('googleAndroidClientId') ??
    readEnvString(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
  webClientId:
    readExtraString('googleWebClientId') ??
    readEnvString(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
});

export const getPlatformGoogleClientId = (): string | null => {
  const ids = getGoogleClientIds();
  if (Platform.OS === 'ios') {
    return ids.iosClientId ?? null;
  }
  if (Platform.OS === 'android') {
    return ids.androidClientId ?? null;
  }
  return ids.webClientId ?? null;
};

export const isGoogleCalendarAuthConfigured = (): boolean => Boolean(getPlatformGoogleClientId());

export const toReversedGoogleScheme = (clientId: string): string | null => {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) {
    return null;
  }
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
};

export const getGoogleNativeRedirectUri = (): string | undefined => {
  const clientId = getPlatformGoogleClientId();
  if (!clientId) {
    return undefined;
  }
  const reversed = toReversedGoogleScheme(clientId);
  return reversed ? `${reversed}:/oauthredirect` : undefined;
};

export const GOOGLE_CALENDAR_AUTH_SCOPES = [GOOGLE_CALENDAR_SCOPE] as const;

const loadSecureStore = (): typeof import('expo-secure-store') | null => {
  if (!requireOptionalNativeModule('ExpoSecureStore')) {
    return null;
  }
  return require('expo-secure-store') as typeof import('expo-secure-store');
};

const readStoredJson = async (key: string): Promise<string | null> => {
  const secureStore = loadSecureStore();
  if (secureStore) {
    const fromSecure = await secureStore.getItemAsync(key);
    if (fromSecure) {
      return fromSecure;
    }
  }
  initializeDatabase();
  return getAppSetting(key);
};

const writeStoredJson = async (key: string, value: string): Promise<void> => {
  const secureStore = loadSecureStore();
  if (secureStore) {
    await secureStore.setItemAsync(key, value);
    initializeDatabase();
    deleteAppSetting(key);
    return;
  }
  initializeDatabase();
  setAppSetting(key, value);
};

const deleteStoredJson = async (key: string): Promise<void> => {
  const secureStore = loadSecureStore();
  if (secureStore) {
    await secureStore.deleteItemAsync(key);
  }
  initializeDatabase();
  deleteAppSetting(key);
};

const parseStoredTokens = (raw: string | null): StoredGoogleTokens | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredGoogleTokens>;
    if (typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
    };
  } catch {
    return null;
  }
};

export const loadGoogleTokens = async (): Promise<StoredGoogleTokens | null> =>
  parseStoredTokens(await readStoredJson(TOKEN_STORAGE_KEY));

export const saveGoogleTokens = async (
  tokens: StoredGoogleTokens,
  previous?: StoredGoogleTokens | null
): Promise<void> => {
  const next: StoredGoogleTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || previous?.refreshToken,
    expiresAt: tokens.expiresAt,
  };
  await writeStoredJson(TOKEN_STORAGE_KEY, JSON.stringify(next));
  clearGoogleCalendarNeedsReauth();
};

export const clearGoogleTokens = async (): Promise<void> => {
  await deleteStoredJson(TOKEN_STORAGE_KEY);
};

export const isGoogleCalendarNeedsReauth = (): boolean => {
  initializeDatabase();
  return getAppSetting(GOOGLE_CALENDAR_NEEDS_REAUTH_KEY) === '1';
};

export const markGoogleCalendarNeedsReauth = (): void => {
  initializeDatabase();
  setAppSetting(GOOGLE_CALENDAR_NEEDS_REAUTH_KEY, '1');
};

export const clearGoogleCalendarNeedsReauth = (): void => {
  initializeDatabase();
  deleteAppSetting(GOOGLE_CALENDAR_NEEDS_REAUTH_KEY);
};

export const tokensFromAuthSession = (authentication: GoogleAuthTokenResponse): StoredGoogleTokens => {
  const expiresIn = authentication.expiresIn ?? 3500;
  return {
    accessToken: authentication.accessToken,
    refreshToken: authentication.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
};

export type GoogleAccessTokenFailure = 'missing' | 'reauth' | 'transient';

export type GoogleAccessTokenResolution =
  | { ok: true; accessToken: string }
  | { ok: false; failure: GoogleAccessTokenFailure };

type RefreshOutcome =
  | { ok: true; tokens: StoredGoogleTokens }
  | { ok: false; failure: 'reauth' | 'transient' };

let refreshInFlight: Promise<RefreshOutcome> | null = null;

const refreshFailure = (status: number, errorCode: string): 'reauth' | 'transient' => {
  if (
    status === 400 ||
    status === 401 ||
    errorCode === 'invalid_grant' ||
    errorCode === 'invalid_client' ||
    errorCode === 'unauthorized_client'
  ) {
    return 'reauth';
  }
  return 'transient';
};

const refreshGoogleTokens = async (current: StoredGoogleTokens): Promise<RefreshOutcome> => {
  if (!current.refreshToken) {
    return { ok: false, failure: 'reauth' };
  }
  const clientId = getPlatformGoogleClientId();
  if (!clientId) {
    return { ok: false, failure: 'reauth' };
  }
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
    });
    const response = await fetch(GOOGLE_AUTH_DISCOVERY.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      let errorCode = '';
      try {
        const parsed = JSON.parse(await response.text()) as { error?: string };
        if (typeof parsed.error === 'string') {
          errorCode = parsed.error;
        }
      } catch {
        // 本文が JSON でなくても、ステータスで失効か通信失敗かを分ける
      }
      return { ok: false, failure: refreshFailure(response.status, errorCode) };
    }
    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (typeof json.access_token !== 'string' || !json.access_token.trim()) {
      return { ok: false, failure: 'transient' };
    }
    const next = tokensFromAuthSession({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
    });
    await saveGoogleTokens(next, current);
    return { ok: true, tokens: (await loadGoogleTokens()) ?? next };
  } catch {
    return { ok: false, failure: 'transient' };
  }
};

export const resolveGoogleAccessToken = async (
  forceRefresh = false
): Promise<GoogleAccessTokenResolution> => {
  if (isGoogleCalendarNeedsReauth()) {
    return { ok: false, failure: 'reauth' };
  }
  const current = await loadGoogleTokens();
  if (!current) {
    return { ok: false, failure: 'missing' };
  }
  if (!forceRefresh && current.expiresAt > Date.now() + 60_000) {
    return { ok: true, accessToken: current.accessToken };
  }
  if (!refreshInFlight) {
    refreshInFlight = refreshGoogleTokens(current).finally(() => {
      refreshInFlight = null;
    });
  }
  const refreshed = await refreshInFlight;
  if (refreshed.ok) {
    clearGoogleCalendarNeedsReauth();
    return { ok: true, accessToken: refreshed.tokens.accessToken };
  }
  if (refreshed.failure === 'reauth') {
    markGoogleCalendarNeedsReauth();
  }
  return { ok: false, failure: refreshed.failure };
};

export const getValidGoogleAccessToken = async (forceRefresh = false): Promise<string | null> => {
  const resolved = await resolveGoogleAccessToken(forceRefresh);
  return resolved.ok ? resolved.accessToken : null;
};

export const hasGoogleTokens = async (): Promise<boolean> => {
  const tokens = await loadGoogleTokens();
  return Boolean(tokens?.accessToken || tokens?.refreshToken);
};

export const revokeGoogleAccess = async (): Promise<void> => {
  const tokens = await loadGoogleTokens();
  const token = tokens?.accessToken || tokens?.refreshToken;
  if (!token) {
    return;
  }
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    // ignore revoke failures; local disconnect should still proceed
  }
};
