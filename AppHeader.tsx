import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';

const SIDE_WIDTH = 44;

export default function AppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appTheme = useAppThemeOptional();
  const headerBackground = appTheme?.colors.headerBackground ?? Theme.surface;
  const headerBorder = appTheme?.colors.headerBorder ?? Theme.border;
  const headerText = appTheme?.colors.headerText ?? Theme.heading;

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingTop: insets.top,
          backgroundColor: headerBackground,
          borderBottomColor: headerBorder,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.side} />
        <View style={styles.center}>
          <Ionicons name="people" size={22} color={headerText} />
          <Text style={[styles.title, { color: headerText }]}>FriendDex</Text>
        </View>
        <View style={styles.side}>
          <Pressable
            style={styles.gearButton}
            onPress={() => router.push('/appsettings')}
            accessibilityLabel="アプリ設定"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={24} color={headerText} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    /** BottomNav の上端線（1.5）と揃える */
    borderBottomWidth: 1.5,
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
    letterSpacing: 0.3,
  },
  gearButton: {
    width: SIDE_WIDTH,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
