import { Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppHeader from '../AppHeader';
import { runAutoBackup } from '../backup';
import BottomNav from '../components/BottomNav';
import { EventNotificationHandler } from '../components/EventNotificationHandler';
import { AppThemeProvider, useAppTheme } from '../contexts/AppThemeContext';
import { DetailDesignProvider } from '../contexts/DetailDesignContext';
import { UiPreviewProvider } from '../contexts/UiPreviewContext';
import { usePastEventConversionSchedule } from '../hooks/usePastEventConversionSchedule';
import { getActiveTab, shouldHideBottomNav, shouldHideHeader } from '../utils/bottomNavVisibility';
import { getNextTabAnimation } from '../utils/tabTransition';
import { initializeDatabase } from '../db';
import { convertPastEventsToAutoEpisodes } from '../utils/eventEpisodeConversion';

const BOTTOM_TAB_ROUTE_NAMES = new Set([
  'index',
  'commonitems',
  'calendar',
  'episode',
  'tools',
  'friends',
]);

function PastEventConversionScheduler() {
  usePastEventConversionSchedule();
  return null;
}

function AppShell() {
  const pathname = usePathname();
  const hideHeader = shouldHideHeader(pathname);
  const hideBottomNav = shouldHideBottomNav(pathname);
  const activeTab = getActiveTab(pathname);
  const { colors } = useAppTheme();

  return (
    <View style={[styles.shell, { backgroundColor: colors.screenBackground }]}>
      {!hideHeader && <AppHeader />}
      <View style={styles.content}>
        <Stack
          screenOptions={({ route }) => ({
            headerShown: false,
            animation: BOTTOM_TAB_ROUTE_NAMES.has(route.name)
              ? getNextTabAnimation()
              : 'slide_from_right',
            /** replace でも push と同じ方向で入る（pop だと向きが反転する） */
            animationTypeForReplace: 'push',
          })}
        />
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
        <AppThemeProvider>
          <DetailDesignProvider>
            <UiPreviewProvider>
              <EventNotificationHandler />
              <PastEventConversionScheduler />
              <AppShell />
            </UiPreviewProvider>
          </DetailDesignProvider>
        </AppThemeProvider>
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
  },
  content: {
    flex: 1,
  },
});
