import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export type AuthIntent = 'signup' | 'signin';
type AuthMethod = 'email' | 'google' | 'apple';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateCardSwap = () => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
};

const GATE = {
  screen: '#000000',
  card: '#141414',
  title: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.55)',
  create: '#4A6FA5',
  login: '#E07A5F',
  inputBg: '#1C1C1C',
  inputBorder: 'rgba(255, 255, 255, 0.22)',
  methodBorder: 'rgba(255, 255, 255, 0.28)',
  methodOn: '#F2F2F2',
  methodOnText: '#111111',
};

type AuthGateViewProps = {
  preview?: boolean;
  overlayMessage?: string | null;
  onClose?: () => void;
  onEmailSubmit: (mode: AuthIntent, email: string, password: string) => void;
  onSocialSubmit?: (mode: AuthIntent, provider: 'google' | 'apple') => void;
};

export function AuthGateView({
  preview = false,
  overlayMessage = null,
  onClose,
  onEmailSubmit,
  onSocialSubmit,
}: AuthGateViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [intent, setIntent] = useState<AuthIntent | null>(null);
  const [method, setMethod] = useState<AuthMethod | null>(null);
  const locked = Boolean(overlayMessage);
  const title =
    intent === 'signup' ? 'アカウント作成' : intent === 'signin' ? 'ログイン' : 'FriendDex';

  const openIntent = (next: AuthIntent) => {
    animateCardSwap();
    setIntent(next);
    setMethod(null);
  };

  const goBack = () => {
    animateCardSwap();
    if (method === 'email') {
      setMethod(null);
      return;
    }
    setIntent(null);
    setMethod(null);
  };

  const pickMethod = (next: AuthMethod) => {
    if (next === 'google' || next === 'apple') {
      if (next === 'apple' && Platform.OS !== 'ios') {
        Alert.alert('使えません', 'Apple ID でのログインは iPhone のみです。');
        return;
      }
      if (preview || !onSocialSubmit) {
        Alert.alert('プレビュー', '見た目確認用です。送信・復元はしません。');
        return;
      }
      if (!intent) {
        return;
      }
      onSocialSubmit(intent, next);
      return;
    }
    animateCardSwap();
    setMethod('email');
  };

  const submitEmail = () => {
    if (!intent) {
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください。');
      return;
    }
    onEmailSubmit(intent, trimmedEmail, password);
  };

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
          {intent ? (
            <Pressable onPress={goBack} hitSlop={8} style={styles.backHit} disabled={locked}>
              <Ionicons name="chevron-back" size={20} color={GATE.title} />
              <Text style={styles.backText}>戻る</Text>
            </Pressable>
          ) : preview && onClose ? (
            <Pressable onPress={onClose} hitSlop={8} style={styles.backHit}>
              <Text style={styles.backText}>閉じる</Text>
            </Pressable>
          ) : null}

          <Text style={styles.title}>{title}</Text>
          {preview ? <Text style={styles.hint}>見た目確認用です。送信・復元はしません。</Text> : null}

          {locked ? (
            <View style={styles.busyBox}>
              <ActivityIndicator color={GATE.title} />
              <Text style={styles.hint}>{overlayMessage}</Text>
            </View>
          ) : intent == null ? (
            <View style={styles.stack}>
              <Pressable style={[styles.pill, styles.createPill]} onPress={() => openIntent('signup')}>
                <Text style={styles.pillText}>アカウント作成</Text>
              </Pressable>
              <Pressable style={[styles.pill, styles.loginPill]} onPress={() => openIntent('signin')}>
                <Text style={styles.pillText}>ログイン</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stack}>
              <Text style={styles.sectionLabel}>
                {method === 'email'
                  ? 'メールとパスワード'
                  : intent === 'signup'
                    ? '作成方法'
                    : 'ログイン方法'}
              </Text>
              {method === 'email' ? (
                <>
                  <View style={styles.field}>
                    <Ionicons name="mail-outline" size={18} color={GATE.muted} />
                    <TextInput
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                      placeholder="メールアドレス"
                      placeholderTextColor={GATE.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                    />
                  </View>
                  <View style={styles.field}>
                    <Ionicons name="lock-closed-outline" size={18} color={GATE.muted} />
                    <TextInput
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="パスワード（6文字以上）"
                      placeholderTextColor={GATE.muted}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                    />
                  </View>
                  <Pressable
                    style={[styles.pill, intent === 'signup' ? styles.createPill : styles.loginPill]}
                    onPress={submitEmail}
                  >
                    <Text style={styles.pillText}>{intent === 'signup' ? '作成する' : 'ログイン'}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <MethodButton
                    icon="mail-outline"
                    label="メールとパスワード"
                    selected={false}
                    onPress={() => pickMethod('email')}
                  />
                  <MethodButton
                    icon="logo-google"
                    label="Google アカウント"
                    selected={false}
                    onPress={() => pickMethod('google')}
                  />
                  {Platform.OS === 'ios' ? (
                    <MethodButton
                      icon="logo-apple"
                      label="Apple ID"
                      selected={false}
                      onPress={() => pickMethod('apple')}
                    />
                  ) : null}
                </>
              )}
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function MethodButton({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.method, selected ? styles.methodSelected : null]}>
      <Ionicons name={icon} size={18} color={selected ? GATE.methodOnText : GATE.title} />
      <Text style={[styles.methodText, selected ? styles.methodTextSelected : null]}>{label}</Text>
    </Pressable>
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
    overflow: 'hidden',
  },
  backHit: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: -8,
    marginBottom: -8,
  },
  backText: {
    color: GATE.title,
    fontSize: 15,
    fontWeight: '600',
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
  sectionLabel: {
    color: GATE.muted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  pill: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  createPill: {
    backgroundColor: GATE.create,
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
  method: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GATE.methodBorder,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  methodSelected: {
    backgroundColor: GATE.methodOn,
    borderColor: GATE.methodOn,
  },
  methodText: {
    color: GATE.title,
    fontSize: 15,
    fontWeight: '600',
  },
  methodTextSelected: {
    color: GATE.methodOnText,
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
