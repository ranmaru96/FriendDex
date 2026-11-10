import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { clearBoundAuthUserId, getBoundAuthUserId } from '@/lib/deviceAuthBind';

const DEV_BUNDLE_ID = 'com.ranmaru96.frienddex.dev';

/** インストール済みアプリのバンドル ID。TestFlight 本番には出さない。 */
export const isDevAppInstall = (): boolean => {
  const iosBundleId = Constants.expoConfig?.ios?.bundleIdentifier;
  const androidPackage = Constants.expoConfig?.android?.package;
  return iosBundleId === DEV_BUNDLE_ID || androidPackage === DEV_BUNDLE_ID;
};

export function DevBindFooter() {
  const [boundId, setBoundId] = useState(() => getBoundAuthUserId());

  const resetBind = () => {
    Alert.alert(
      '紐付けをリセット',
      'この端末に保存したアカウント ID だけを消します。次にログインしたアカウントが新しい紐付けになります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'リセット',
          style: 'destructive',
          onPress: () => {
            clearBoundAuthUserId();
            setBoundId(getBoundAuthUserId());
          },
        },
      ]
    );
  };

  return (
    <View style={styles.box}>
      <Text style={styles.label}>この端末の紐付け ID</Text>
      <Text selectable style={styles.value}>
        {boundId || '未設定'}
      </Text>
      <Pressable onPress={resetBind} hitSlop={8} style={styles.hit}>
        <Text style={styles.action}>紐付けをリセット</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 18,
    gap: 8,
    alignItems: 'center',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  hit: {
    paddingVertical: 4,
  },
  action: {
    color: '#E07A5F',
    fontSize: 14,
    fontWeight: '600',
  },
});
