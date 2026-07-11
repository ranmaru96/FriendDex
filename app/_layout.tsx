import { Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppHeader from '../AppHeader';
import { runAutoBackup } from '../backup';
import BottomNav from '../components/BottomNav';
import { EventNotificationHandler } from '../components/EventNotificationHandler';
import { Theme } from '@/constants/theme';
import { DetailDesignProvider } from '../contexts/DetailDesignContext';
import { UiPreviewProvider } from '../contexts/UiPreviewContext';
import { usePastEventConversionSchedule } from '../hooks/usePastEventConversionSchedule';
import { getActiveTab, shouldHideBottomNav, shouldHideHeader } from '../utils/bottomNavVisibility';
import { initializeDatabase } from '../db';
import { convertPastEventsToAutoEpisodes } from '../utils/eventEpisodeConversion';

function PastEventConversionScheduler() {
  usePastEventConversionSchedule();
  return null;
}

function AppShell() {
  const pathname = usePathname();
  const hideHeader = shouldHideHeader(pathname);
  const hideBottomNav = shouldHideBottomNav(pathname);
  const activeTab = getActiveTab(pathname);

  return (
    <View style={styles.shell}>
      {!hideHeader && <AppHeader />}
      <View style={styles.content}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      {!hideBottomNav && <BottomNav active={activeTab} />}
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initializeDatabase();
    convertPastEventsToAutoEpisodes();
    void runAutoBackup();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <DetailDesignProvider>
          <UiPreviewProvider>
            <EventNotificationHandler />
            <PastEventConversionScheduler />
            <AppShell />
          </UiPreviewProvider>
        </DetailDesignProvider>
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
    backgroundColor: Theme.background,
  },
  content: {
    flex: 1,
  },
});
