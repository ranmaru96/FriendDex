import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAuthStorage } from '@/lib/secureStoreChunkAdapter';

const readExtraString = (key: string): string | undefined => {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const value = extra[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const readEnvString = (value: string | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined;

export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export const getSupabasePublicConfig = (): SupabasePublicConfig | null => {
  const url =
    readExtraString('supabaseUrl') ?? readEnvString(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey =
    readExtraString('supabaseAnonKey') ?? readEnvString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
};

export const isSupabaseConfigured = (): boolean => getSupabasePublicConfig() != null;

let client: SupabaseClient | null | undefined;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (client !== undefined) {
    return client;
  }
  const config = getSupabasePublicConfig();
  if (!config) {
    client = null;
    return null;
  }
  client = createClient(config.url, config.anonKey, {
    auth: {
      storage: createSupabaseAuthStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
};

export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<{ session: Session | null; errorMessage: string | null }> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { session: null, errorMessage: 'Supabase が未設定です' };
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { session: null, errorMessage: error.message };
  }
  return { session: data.session, errorMessage: null };
};

export const signInWithEmail = async (
  email: string,
  password: string
): Promise<{ session: Session | null; errorMessage: string | null }> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { session: null, errorMessage: 'Supabase が未設定です' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { session: null, errorMessage: error.message };
  }
  return { session: data.session, errorMessage: null };
};

export const signInWithIdTokenProvider = async (
  provider: 'google' | 'apple',
  token: string,
  nonce?: string
): Promise<{ session: Session | null; errorMessage: string | null }> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { session: null, errorMessage: 'Supabase が未設定です' };
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider,
    token,
    ...(nonce ? { nonce } : {}),
  });
  if (error) {
    return { session: null, errorMessage: error.message };
  }
  return { session: data.session, errorMessage: null };
};

export const signOutSupabase = async (): Promise<string | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return 'Supabase が未設定です';
  }
  const { error } = await supabase.auth.signOut();
  return error?.message ?? null;
};

export const getSupabaseSession = async (): Promise<Session | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
};
