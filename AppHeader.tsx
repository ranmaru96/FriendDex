import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SIDE_WIDTH = 44;

export default function AppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={styles.side} />
        <View style={styles.center}>
          <Ionicons name="people" size={22} color="#1e293b" />
          <Text style={styles.title}>FriendDex</Text>
        </View>
        <View style={styles.side}>
          <Pressable
            style={styles.gearButton}
            onPress={() => router.push('/appsettings')}
            accessibilityLabel="アプリ設定"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={24} color="#334155" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#f2f5f8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cbd5e1',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  side: {
    width: SIDE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.3,
  },
  gearButton: {
    width: SIDE_WIDTH,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
