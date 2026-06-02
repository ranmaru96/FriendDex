import { Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppHeader from '../AppHeader';
import { runAutoBackup } from '../backup';
import BottomNav from '../components/BottomNav';
import { initializeDatabase } from '../db';

type TabKey = 'home' | 'episode' | 'commonitems' | 'friends';

function getActiveTab(pathname: string): TabKey {
  if (pathname.includes('/commonitems')) return 'commonitems';
  if (pathname.includes('/friends')) return 'friends';
  if (pathname.includes('/episode')) return 'episode';
  return 'home';
}

function AppShell() {
  const pathname = usePathname();
  const hideNav = ['detail', 'edit', 'episode-detail'].some((p) => pathname.includes(p));
  const activeTab = getActiveTab(pathname);

  return (
    <View style={styles.shell}>
      <AppHeader />
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      {!hideNav && <BottomNav active={activeTab} />}
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initializeDatabase();
    void runAutoBackup();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  shell: {
    flex: 1,
    backgroundColor: '#f0f0f2',
  },
  content: {
    flex: 1,
  },
});
