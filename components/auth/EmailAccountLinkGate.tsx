import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectSocialAndRetireEmail } from '@/lib/emailAccountLink';
import { discardForeignAuthSession } from '@/lib/deviceAuthBind';
import { requireOnline } from '@/lib/networkReachability';
import type { SocialProvider } from '@/lib/socialAuth';

const GATE = {
  screen: '#000000',
  card: '#141414',
  title: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.55)',
  methodBorder: 'rgba(255, 255, 255, 0.28)',
};

type EmailAccountLinkGateProps = {
  checking: boolean;
  onLinked: () => void;
};

export function EmailAccountLinkGate({ checking, onLinked }: EmailAccountLinkGateProps) {
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('確認しています');

  const link = async (provider: SocialProvider) => {
    if (!requireOnline()) {
      return;
    }
    setBusy(true);
    setBusyLabel(provider === 'google' ? 'Google を紐づけています' : 'Apple を紐づけています');
    try {
      const result = await connectSocialAndRetireEmail(provider);
      if (result.cancelled) {
        return;
      }
      if (result.errorMessage) {
        Alert.alert('紐づけできませんでした', result.errorMessage);
        return;
      }
      onLinked();
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setBusyLabel('ログアウトしています');
    try {
      await discardForeignAuthSession();
    } finally {
      setBusy(false);
    }
  };

  const locked = checking || busy;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.title}>ログイン方法の変更</Text>
        <Text style={styles.hint}>
          メールアドレスでのログインは終了します。今のアカウントに Google または Apple を紐づけてください。データはそのまま残ります。
        </Text>
        {locked ? (
          <View style={styles.busyBox}>
            <ActivityIndicator color={GATE.title} />
            <Text style={styles.hint}>{checking && !busy ? '確認しています' : busyLabel}</Text>
          </View>
        ) : (
          <View style={styles.stack}>
            <Pressable style={styles.method} onPress={() => void link('google')}>
              <Ionicons name="logo-google" size={18} color={GATE.title} />
              <Text style={styles.methodText}>Google アカウント</Text>
            </Pressable>
            {Platform.OS === 'ios' ? (
              <Pressable style={styles.method} onPress={() => void link('apple')}>
                <Ionicons name="logo-apple" size={18} color={GATE.title} />
                <Text style={styles.methodText}>Apple ID</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.logoutHit} onPress={() => void logout()}>
              <Text style={styles.logoutText}>ログアウト</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: GATE.screen,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: GATE.card,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 22,
  },
  title: {
    color: GATE.title,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
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
    paddingVertical: 8,
  },
  stack: {
    gap: 12,
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
  methodText: {
    color: GATE.title,
    fontSize: 15,
    fontWeight: '600',
  },
  logoutHit: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  logoutText: {
    color: GATE.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
