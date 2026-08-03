import { Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppHeader from '../AppHeader';
import { runAutoBackup } from '../backup';
import BottomNav from '../components/BottomNav';
import { EventNotificationHandler } from '../components/EventNotificationHandler';
import { ScreenTopBar } from '../components/screen/ScreenTopBar';
import { SharedHeaderFrame } from '../components/screen/SharedHeaderFrame';
import { AppThemeProvider, useAppTheme } from '../contexts/AppThemeContext';
import { DetailDesignProvider } from '../contexts/DetailDesignContext';
import {
  SharedHeaderChromeProvider,
  useSharedHeaderChrome,
} from '../contexts/SharedHeaderChromeContext';
import { UiPreviewProvider, useUiKit } from '../contexts/UiPreviewContext';
import { usePastEventConversionSchedule } from '../hooks/usePastEventConversionSchedule';
import { getActiveTab, shouldHideBottomNav, shouldHideHeader } from '../utils/bottomNavVisibility';
import { resolveStackAnimation } from '../utils/tabTransition';
import { initializeDatabase } from '../db';
import { convertPastEventsToAutoEpisodes } from '../utils/eventEpisodeConversion';

const BOTTOM_TAB_ROUTE_NAMES = new Set([
  'index',
  'commonitems',
  'calendar',
  'episode',
  'tools',
  'tasks',
]);

function PastEventConversionScheduler() {
  usePastEventConversionSchedule();
  return null;
}

function AppShellHeader() {
  const pathname = usePathname();
  const hideHeader = shouldHideHeader(pathname);
  const kit = useUiKit();
  const { colors } = useAppTheme();
  const { detailHeader } = useSharedHeaderChrome();
  const isDetailRoute = pathname.includes('/detail');
  const useSharedChrome = kit.sharedHeaderChrome;
  const showDetailChrome = isDetailRoute && detailHeader != null;

  if (useSharedChrome && (isDetailRoute || !hideHeader)) {
    return (
      <SharedHeaderFrame
        backgroundColor={
          showDetailChrome ? colors.screenBackground : colors.headerBackground
        }
        borderColor={showDetailChrome ? colors.topBarBorder : colors.headerBorder}
      >
        {showDetailChrome && detailHeader ? (
          <ScreenTopBar
            title="Profile"
            variant="plain"
            onBack={detailHeader.onBack}
            titleLeading={
              <Pressable
                onPress={detailHeader.onPrev}
                disabled={!detailHeader.prevEnabled}
                accessibilityLabel="前の人物"
                hitSlop={8}
                style={styles.adjacentHit}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={
                    detailHeader.prevEnabled
                      ? detailHeader.activeIconColor
                      : detailHeader.mutedIconColor
                  }
                />
              </Pressable>
            }
            titleTrailing={
              <Pressable
                onPress={detailHeader.onNext}
                disabled={!detailHeader.nextEnabled}
                accessibilityLabel="次の人物"
                hitSlop={8}
                style={styles.adjacentHit}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={
                    detailHeader.nextEnabled
                      ? detailHeader.activeIconColor
                      : detailHeader.mutedIconColor
                  }
                />
              </Pressable>
            }
          />
        ) : (
          <AppHeader embedded />
        )}
      </SharedHeaderFrame>
    );
  }

  if (!hideHeader) {
    return <AppHeader />;
  }

  return null;
}

function AppShell() {
  const pathname = usePathname();
  const hideBottomNav = shouldHideBottomNav(pathname);
  const activeTab = getActiveTab(pathname);
  const { colors } = useAppTheme();

  return (
    <View style={[styles.shell, { backgroundColor: colors.screenBackground }]}>
      <AppShellHeader />
      <View style={styles.content}>
        <Stack
          screenOptions={({ route }) => ({
            headerShown: false,
            animation: resolveStackAnimation(route.name, BOTTOM_TAB_ROUTE_NAMES),
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
              <SharedHeaderChromeProvider>
                <EventNotificationHandler />
                <PastEventConversionScheduler />
                <AppShell />
              </SharedHeaderChromeProvider>
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
  adjacentHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
