import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { getMyselfSetupPhase, initializeDatabase } from '@/db';
import {
  DEVICE_BIND_MISMATCH_MESSAGE,
  discardForeignAuthSession,
  isAuthUserAllowedOnThisDevice,
} from '@/lib/deviceAuthBind';
import { runOwnedLoginSideEffects } from '@/lib/ownedLoginSync';
import { consumePasswordResetLink, finishPasswordRecovery, updatePassword } from '@/lib/passwordReset';
import {
  getPasswordRecoveryRevision,
  subscribePasswordRecovery,
} from '@/lib/passwordResetLink';
import { requireOnline } from '@/lib/networkReachability';
import { signOutSupabase } from '@/lib/supabase';
import { openAfterAuthGate } from '@/utils/navigationRestore';

const GATE = {
  screen: '#000000',
  card: '#141414',
  title: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.55)',
  login: '#E07A5F',
  inputBg: '#1C1C1C',
  inputBorder: 'rgba(255, 255, 255, 0.22)',
};

type Phase = 'loading' | 'form' | 'error';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuthSession();
  const revision = useSyncExternalStore(
    subscribePasswordRecovery,
    getPasswordRecoveryRevision,
    getPasswordRecoveryRevision
  );
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('確認しています');
  const appliedLink = useRef(false);
  const seenJob = useRef<Promise<unknown> | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const job = consumePasswordResetLink();
    if (!job) {
      if (appliedLink.current) {
        return;
      }
      const sessionId = sessionRef.current?.user.id?.trim() ?? '';
      if (sessionId && isAuthUserAllowedOnThisDevice(sessionId)) {
        setPhase('form');
        return;
      }
      setErrorMessage('再設定リンクを読み取れませんでした。メールのリンクから開き直してください。');
      setPhase('error');
      return;
    }
    let cancelled = false;
    if (seenJob.current !== job) {
      seenJob.current = job;
      setPhase('loading');
    }
    void job.then((result) => {
      if (cancelled) {
        return;
      }
      appliedLink.current = true;
      if (result.errorMessage || !result.session) {
        setErrorMessage(result.errorMessage ?? '再設定リンクを確認できませんでした。');
        setPhase('error');
        return;
      }
      const sessionId = result.session.user.id?.trim() ?? '';
      if (sessionId && !isAuthUserAllowedOnThisDevice(sessionId)) {
        setErrorMessage(DEVICE_BIND_MISMATCH_MESSAGE);
        setPhase('error');
        return;
      }
      setErrorMessage(null);
      setPhase('form');
    });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const leave = async () => {
    setBusy(true);
    setBusyLabel('戻っています');
    try {
      await signOutSupabase();
      finishPasswordRecovery();
      router.replace('/login');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (password.length < 6) {
      Alert.alert('入力エラー', 'パスワードは6文字以上にしてください。');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('入力エラー', 'パスワードが一致しません。');
      return;
    }
    const sessionId = session?.user.id?.trim() ?? '';
    if (!sessionId || !isAuthUserAllowedOnThisDevice(sessionId)) {
      Alert.alert('設定できません', '再設定のセッションがありません。メールのリンクから開き直してください。');
      return;
    }
    if (!requireOnline()) {
      return;
    }
    setBusy(true);
    setBusyLabel('設定しています');
    try {
      const updated = await updatePassword(password);
      if (updated.errorMessage) {
        Alert.alert('設定できませんでした', updated.errorMessage);
        return;
      }
      setBusyLabel('復元しています');
      const { restore, syncError, rejected } = await runOwnedLoginSideEffects('signin');
      if (rejected) {
        await discardForeignAuthSession();
        finishPasswordRecovery();
        Alert.alert('ログインできません', syncError ?? 'この端末では入れません。');
        router.replace('/login');
        return;
      }
      initializeDatabase();
      const setupPhase = getMyselfSetupPhase();
      finishPasswordRecovery();
      if (setupPhase === 'ready') {
        if (restore?.errorMessage) {
          Alert.alert('復元の一部に失敗しました', restore.errorMessage);
        } else if (syncError) {
          Alert.alert('ログインしました', `サーバー反映に失敗しました。\n${syncError}`);
        }
        openAfterAuthGate(pathname);
        return;
      }
      if (restore?.errorMessage) {
        Alert.alert('復元できませんでした', restore.errorMessage);
      }
      router.replace('/setup-myself');
    } finally {
      setBusy(false);
    }
  };

  const showForm = phase === 'form' && !busy;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
      >
        <View style={styles.card}>
          <Text style={styles.title}>新しいパスワード</Text>
          {phase === 'loading' || busy ? (
            <View style={styles.busyBox}>
              <ActivityIndicator color={GATE.title} />
              <Text style={styles.hint}>{busyLabel}</Text>
            </View>
          ) : phase === 'error' ? (
            <View style={styles.stack}>
              <Text style={styles.hint}>{errorMessage}</Text>
              <Pressable style={[styles.pill, styles.loginPill]} onPress={() => void leave()}>
                <Text style={styles.pillText}>ログインへ戻る</Text>
              </Pressable>
            </View>
          ) : showForm ? (
            <View style={styles.stack}>
              <Text style={styles.hint}>6文字以上で入力してください。</Text>
              <View style={styles.field}>
                <Ionicons name="lock-closed-outline" size={18} color={GATE.muted} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="新しいパスワード"
                  placeholderTextColor={GATE.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                />
              </View>
              <View style={styles.field}>
                <Ionicons name="lock-closed-outline" size={18} color={GATE.muted} />
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="もう一度入力"
                  placeholderTextColor={GATE.muted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                />
              </View>
              <Pressable style={[styles.pill, styles.loginPill]} onPress={() => void submit()}>
                <Text style={styles.pillText}>設定する</Text>
              </Pressable>
              <Pressable onPress={() => void leave()} hitSlop={8} style={styles.forgotHit}>
                <Text style={styles.forgotText}>ログインへ戻る</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: GATE.screen,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  card: {
    backgroundColor: GATE.card,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
    gap: 22,
  },
  title: {
    color: GATE.title,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  hint: {
    color: GATE.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  busyBox: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
  },
  stack: {
    gap: 12,
  },
  pill: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  loginPill: {
    backgroundColor: GATE.login,
  },
  pillText: {
    color: GATE.title,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  forgotHit: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  forgotText: {
    color: GATE.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  field: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GATE.inputBorder,
    backgroundColor: GATE.inputBg,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    color: GATE.title,
    fontSize: 15,
    paddingVertical: 12,
  },
});
