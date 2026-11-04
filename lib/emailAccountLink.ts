import type { UserIdentity } from '@supabase/supabase-js';
import { linkNativeIdentityToCurrentUser, type SocialProvider } from '@/lib/socialAuth';
import { getSupabaseClient } from '@/lib/supabase';

const SOCIAL_PROVIDERS = new Set(['google', 'apple']);

/** サーバーの identity に email があるときだけ、ログイン方法の変更が必要。 */
export function identitiesRequireEmailMigration(identities: { provider?: string | null }[]): boolean {
  return identities.some((identity) => identity.provider?.trim() === 'email');
}

const emailIdentities = (identities: UserIdentity[]): UserIdentity[] =>
  identities.filter(
    (identity) => identity.provider === 'email' && (identity.identity_id?.trim().length ?? 0) > 0
  );

/** 今のセッションに Google か Apple を足し、メールのログイン手段を外す。 */
export async function connectSocialAndRetireEmail(
  provider: SocialProvider
): Promise<{ cancelled: boolean; errorMessage: string | null }> {
  const linked = await linkNativeIdentityToCurrentUser(provider);
  if (linked.cancelled) {
    return { cancelled: true, errorMessage: null };
  }
  if (linked.switchedAccount) {
    return { cancelled: false, errorMessage: linked.errorMessage };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { cancelled: false, errorMessage: 'Supabase が未設定です' };
  }
  const listed = await supabase.auth.getUserIdentities();
  if (listed.error || !listed.data) {
    return {
      cancelled: false,
      errorMessage: linked.errorMessage ?? listed.error?.message ?? '紐づけを確認できませんでした。',
    };
  }
  const social = listed.data.identities.filter((identity) => SOCIAL_PROVIDERS.has(identity.provider));
  if (social.length === 0) {
    return {
      cancelled: false,
      errorMessage: linked.errorMessage ?? 'このアカウントに Google または Apple を足せませんでした。',
    };
  }

  for (const identity of emailIdentities(listed.data.identities)) {
    const removed = await supabase.auth.unlinkIdentity(identity);
    if (removed.error) {
      return {
        cancelled: false,
        errorMessage: removed.error.message || 'メールログインを終了できませんでした。もう一度押してください。',
      };
    }
  }

  const after = await supabase.auth.getUserIdentities();
  if (after.error || !after.data) {
    return {
      cancelled: false,
      errorMessage: 'メールログインを終了できたか確認できませんでした。もう一度押してください。',
    };
  }
  if (identitiesRequireEmailMigration(after.data.identities)) {
    return { cancelled: false, errorMessage: 'メールログインが残っています。もう一度押してください。' };
  }
  return { cancelled: false, errorMessage: null };
}
