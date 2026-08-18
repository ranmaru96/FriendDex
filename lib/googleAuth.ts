import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { GOOGLE_CALENDAR_SCOPE } from '@/constants/googleCalendar';
import { deleteAppSetting, getAppSetting, initializeDatabase, setAppSetting } from '@/db';

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

const loadAuthSession = (): typeof import('expo-auth-session') | null => {
  if (!requireOptionalNativeModule('ExpoWebBrowser')) {
    return null;
  }
  return require('expo-auth-session') as typeof import('expo-auth-session');
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
};

export const clearGoogleTokens = async (): Promise<void> => {
  await deleteStoredJson(TOKEN_STORAGE_KEY);
};

export const tokensFromAuthSession = (authentication: GoogleAuthTokenResponse): StoredGoogleTokens => {
  const expiresIn = authentication.expiresIn ?? 3500;
  return {
    accessToken: authentication.accessToken,
    refreshToken: authentication.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
};

let refreshInFlight: Promise<StoredGoogleTokens | null> | null = null;

const refreshGoogleTokens = async (
  current: StoredGoogleTokens
): Promise<StoredGoogleTokens | null> => {
  if (!current.refreshToken) {
    return null;
  }
  const clientId = getPlatformGoogleClientId();
  if (!clientId) {
    return null;
  }
  try {
    const AuthSession = loadAuthSession();
    if (!AuthSession) {
      return null;
    }
    const refreshed = await AuthSession.refreshAsync(
      {
        clientId,
        refreshToken: current.refreshToken,
      },
      GOOGLE_AUTH_DISCOVERY
    );
    const next = tokensFromAuthSession(refreshed);
    await saveGoogleTokens(next, current);
    return (await loadGoogleTokens()) ?? next;
  } catch {
    return null;
  }
};

export const getValidGoogleAccessToken = async (forceRefresh = false): Promise<string | null> => {
  const current = await loadGoogleTokens();
  if (!current) {
    return null;
  }
  if (!forceRefresh && current.expiresAt > Date.now() + 60_000) {
    return current.accessToken;
  }
  if (!refreshInFlight) {
    refreshInFlight = refreshGoogleTokens(current).finally(() => {
      refreshInFlight = null;
    });
  }
  const refreshed = await refreshInFlight;
  return refreshed?.accessToken ?? (forceRefresh ? null : current.accessToken);
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
