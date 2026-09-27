import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthGateView, type AuthIntent } from '@/components/auth/AuthGateView';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { getMyselfSetupPhase, initializeDatabase } from '@/db';
import { DEVICE_BIND_MISMATCH_MESSAGE, discardForeignAuthSession, isAuthUserAllowedOnThisDevice } from '@/lib/deviceAuthBind';
import { runOwnedLoginSideEffects } from '@/lib/ownedLoginSync';
import { signInWithAppleAccount, signInWithGoogleAccount, type SocialProvider } from '@/lib/socialAuth';
import { signInWithEmail, signUpWithEmail } from '@/lib/supabase';
import { requireOnline } from '@/lib/networkReachability';

export default function LoginScreen() {
  const router = useRouter();
  const { configured, session, ready, deviceBindError, clearDeviceBindError } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('読み込み中');
  const handledSessionId = useRef<string | null>(null);

  const finishAfterSession = useCallback(async (mode: AuthIntent) => {
    setBusyLabel(mode === 'signin' ? '復元しています' : '準備しています');
    const { restore, syncError, rejected } = await runOwnedLoginSideEffects(mode);
    if (rejected) {
      Alert.alert('ログインできません', syncError ?? 'この端末では入れません。');
      return false;
    }
    initializeDatabase();
    const phase = getMyselfSetupPhase();
    if (phase === 'ready') {
      if (restore?.errorMessage) {
        Alert.alert('復元の一部に失敗しました', restore.errorMessage);
      } else if (syncError) {
        Alert.alert('ログインしました', `サーバー反映に失敗しました。\n${syncError}`);
      }
      router.replace('/calendar');
      return true;
    }
    if (restore?.errorMessage) {
      Alert.alert('復元できませんでした', restore.errorMessage);
    }
    router.replace('/setup-myself');
    return true;
  }, [router]);

  useEffect(() => {
    if (!deviceBindError || busy) {
      return;
    }
    Alert.alert('ログインできません', deviceBindError);
    clearDeviceBindError();
  }, [busy, clearDeviceBindError, deviceBindError]);

  useEffect(() => {
    if (!ready || !configured) {
      return;
    }
    const sessionId = session?.user.id?.trim() ?? '';
    if (!sessionId) {
      return;
    }
    initializeDatabase();
    if (handledSessionId.current === sessionId) {
      if (busy) {
        return;
      }
      router.replace(getMyselfSetupPhase() === 'ready' ? '/calendar' : '/setup-myself');
      return;
    }
    if (getMyselfSetupPhase() === 'ready') {
      router.replace('/calendar');
      return;
    }
    if (busy) {
      return;
    }
    setBusy(true);
    void finishAfterSession('signin')
      .then((ok) => {
        if (ok) {
          handledSessionId.current = sessionId;
        }
      })
      .finally(() => {
        setBusy(false);
      });
  }, [busy, configured, finishAfterSession, ready, router, session]);

  const runAuth = async (mode: AuthIntent, email: string, password: string) => {
    if (!requireOnline()) {
      return;
    }
    setBusy(true);
    setBusyLabel(mode === 'signin' ? 'ログインしています' : '登録しています');
    try {
      const result =
        mode === 'signup'
          ? await signUpWithEmail(email, password)
          : await signInWithEmail(email, password);
      if (result.errorMessage) {
        Alert.alert(mode === 'signup' ? '登録できませんでした' : 'ログインできませんでした', result.errorMessage);
        return;
      }
      if (!result.session) {
        Alert.alert(
          '確認メール',
          'アカウントは作成されました。メールの確認が有効なときは、確認後にログインしてください。'
        );
        return;
      }
      const sessionId = result.session.user.id?.trim() ?? '';
      if (sessionId && !isAuthUserAllowedOnThisDevice(sessionId)) {
        await discardForeignAuthSession();
        clearDeviceBindError();
        Alert.alert('ログインできません', DEVICE_BIND_MISMATCH_MESSAGE);
        return;
      }
      const ok = await finishAfterSession(mode);
      if (ok && sessionId) {
        handledSessionId.current = sessionId;
      }
    } finally {
      setBusy(false);
    }
  };

  const runSocial = async (mode: AuthIntent, provider: SocialProvider) => {
    if (!requireOnline()) {
      return;
    }
    setBusy(true);
    setBusyLabel(mode === 'signin' ? 'ログインしています' : '登録しています');
    try {
      const result =
        provider === 'google' ? await signInWithGoogleAccount() : await signInWithAppleAccount();
      if (result.cancelled) {
        return;
      }
      if (result.errorMessage) {
        Alert.alert(
          mode === 'signup' ? '登録できませんでした' : 'ログインできませんでした',
          result.errorMessage
        );
        return;
      }
      if (!result.session) {
        Alert.alert(
          mode === 'signup' ? '登録できませんでした' : 'ログインできませんでした',
          'セッションを取得できませんでした。'
        );
        return;
      }
      const sessionId = result.session.user.id?.trim() ?? '';
      if (sessionId && !isAuthUserAllowedOnThisDevice(sessionId)) {
        await discardForeignAuthSession();
        clearDeviceBindError();
        Alert.alert('ログインできません', DEVICE_BIND_MISMATCH_MESSAGE);
        return;
      }
      const ok = await finishAfterSession(mode);
      if (ok && sessionId) {
        handledSessionId.current = sessionId;
      }
    } finally {
      setBusy(false);
    }
  };

  const overlayMessage = !configured
    ? 'サーバー設定が無いため、ログインできません。'
    : !ready || busy || session
      ? busyLabel
      : null;

  return (
    <AuthGateView
      overlayMessage={overlayMessage}
      onEmailSubmit={runAuth}
      onSocialSubmit={runSocial}
    />
  );
}
