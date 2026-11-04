import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import {
  endPasswordRecovery,
  readResetLinkParams,
  takeQueuedResetLink,
} from '@/lib/passwordResetLink';
import { getSupabaseClient } from '@/lib/supabase';

export type PasswordResetSessionResult = {
  session: Session | null;
  errorMessage: string | null;
};

const readableResetError = (error: { message: string; code?: string }): string => {
  if (
    error.code === 'pkce_code_verifier_not_found' ||
    error.message.includes('code verifier')
  ) {
    return '再設定メールは、送った端末で開いてください。';
  }
  return error.message;
};

export const requestPasswordReset = async (email: string): Promise<string | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return 'Supabase が未設定です';
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: Linking.createURL('reset-password'),
  });
  if (error) {
    return readableResetError(error);
  }
  return null;
};

export const establishPasswordResetSession = async (
  url: string
): Promise<PasswordResetSessionResult> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { session: null, errorMessage: 'Supabase が未設定です' };
  }
  const params = readResetLinkParams(url);
  if (params.errorMessage && !params.code && !params.accessToken) {
    return { session: null, errorMessage: params.errorMessage };
  }
  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      return { session: null, errorMessage: readableResetError(error) };
    }
    return { session: data.session, errorMessage: null };
  }
  if (params.accessToken && params.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) {
      return { session: null, errorMessage: readableResetError(error) };
    }
    return { session: data.session, errorMessage: null };
  }
  return { session: null, errorMessage: '再設定リンクを読み取れませんでした。' };
};

export const updatePassword = async (
  password: string
): Promise<PasswordResetSessionResult> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { session: null, errorMessage: 'Supabase が未設定です' };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { session: null, errorMessage: error.message };
  }
  const { data } = await supabase.auth.getSession();
  return { session: data.session, errorMessage: null };
};

let inflight: Promise<PasswordResetSessionResult> | null = null;

/** 同じリンクは一度だけセッションにする。Strict Mode の再実行でも同じ Promise を返す。 */
export const consumePasswordResetLink = (): Promise<PasswordResetSessionResult> | null => {
  const queued = takeQueuedResetLink();
  if (queued) {
    inflight = establishPasswordResetSession(queued);
    return inflight;
  }
  return inflight;
};

export const finishPasswordRecovery = (): void => {
  inflight = null;
  endPasswordRecovery();
};
