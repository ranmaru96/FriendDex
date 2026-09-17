import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { Radius, Theme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { signInWithEmail, signOutSupabase, signUpWithEmail } from '@/lib/supabase';
import { upsertMyselfIdentityProfile } from '@/lib/identityProfileSync';

type ThemedStyles = {
  sectionHeader: object | null;
  hint: object | null;
  rowLabel: object | null;
  group: object | null;
  separator: object | null;
};

export function AccountSettingsSection({ themed }: { themed: ThemedStyles }) {
  const { variant, colors, patternId } = useAppTheme();
  const content = useContentColors();
  const isMonochrome = isMonochromeAppTheme(variant);
  const isCodex = usesOffsetChrome(patternId);
  const { configured, session, ready } = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const runAuth = async (mode: 'signup' | 'signin') => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください。');
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === 'signup'
          ? await signUpWithEmail(trimmedEmail, password)
          : await signInWithEmail(trimmedEmail, password);
      if (result.errorMessage) {
        Alert.alert(mode === 'signup' ? '登録できませんでした' : 'ログインできませんでした', result.errorMessage);
        return;
      }
      setPassword('');
      if (!result.session) {
        Alert.alert(
          '確認メール',
          'アカウントは作成されました。メールの確認が有効なときは、確認後にログインしてください。'
        );
        return;
      }
      const sync = await upsertMyselfIdentityProfile();
      const body = sync.errorMessage
        ? `ログインはできました。公開カードのサーバー反映に失敗しました。\n${sync.errorMessage}`
        : '本人カードがある場合、公開カードをサーバーへ送りました。';
      Alert.alert(mode === 'signup' ? '登録しました' : 'ログインしました', body);
    } finally {
      setBusy(false);
    }
  };

  const runSignOut = async () => {
    setBusy(true);
    try {
      const errorMessage = await signOutSupabase();
      if (errorMessage) {
        Alert.alert('ログアウトできませんでした', errorMessage);
        return;
      }
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <View style={styles.body}>
      {session?.user ? (
        <>
          <Text style={[styles.status, contentTextStyle(content)]}>
            ログイン中{'\n'}
            {session.user.email ?? session.user.id}
          </Text>
          <Pressable
            style={[styles.button, contentFilledButtonStyle(content), busy && styles.buttonDisabled]}
            onPress={() => void runSignOut()}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={content.contentCard} />
            ) : (
              <Text style={[styles.buttonText, contentFilledButtonTextStyle(content)]}>ログアウト</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            style={[styles.input, contentInputStyle(content), contentTextStyle(content)]}
            value={email}
            onChangeText={setEmail}
            placeholder="メールアドレス"
            placeholderTextColor={content.contentTextSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextInput
            style={[styles.input, contentInputStyle(content), contentTextStyle(content)]}
            value={password}
            onChangeText={setPassword}
            placeholder="パスワード（6文字以上）"
            placeholderTextColor={content.contentTextSecondary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, contentFilledButtonStyle(content), busy && styles.buttonDisabled]}
              onPress={() => void runAuth('signin')}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={content.contentCard} />
              ) : (
                <Text style={[styles.buttonText, contentFilledButtonTextStyle(content)]}>ログイン</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, { borderColor: content.contentBorder }]}
              onPress={() => void runAuth('signup')}
              disabled={busy}
            >
              <Text style={[styles.secondaryButtonText, contentMutedTextStyle(content)]}>新規登録</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  const body = !configured ? (
    <View style={styles.row}>
      <Text style={[styles.emptyText, themed.hint]}>
        .env の EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY が未設定です
      </Text>
    </View>
  ) : !ready ? (
    <View style={styles.row}>
      <ActivityIndicator color={content.contentText} />
    </View>
  ) : (
    form
  );

  const group = isCodex ? (
    <OffsetCard style={{ marginHorizontal: 16 }}>{body}</OffsetCard>
  ) : (
    <View style={[styles.group, themed.group]}>{body}</View>
  );

  return (
    <>
      <Text
        style={[
          styles.sectionHeader,
          themed.sectionHeader,
          isMonochrome && { color: colors.onScreenText },
        ]}
      >
        アカウント
      </Text>
      {group}
      <Text style={[styles.hint, themed.hint]}>
        メールとパスワードでサーバーにログインします。ログインすると本人カードの公開項目をサーバーへ送ります。QRで相手が取る処理はまだありません。
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: Typography.base,
    fontWeight: '600',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 15,
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  status: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 42,
  },
  actions: {
    gap: 8,
  },
  button: {
    borderRadius: Radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: Radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    marginTop: 12,
    marginHorizontal: 16,
    fontSize: Typography.base,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
});
