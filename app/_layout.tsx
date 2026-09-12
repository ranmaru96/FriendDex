import '../sentry';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { useEffect, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppHeader from '../AppHeader';
import BottomNav from '../components/BottomNav';
import { ScreenTopBar } from '../components/screen/ScreenTopBar';
import { SharedHeaderFrame } from '../components/screen/SharedHeaderFrame';
import { AppThemeProvider, useAppTheme } from '../contexts/AppThemeContext';
import { NoteFormatAccessoryProvider } from '@/contexts/NoteFormatAccessoryContext';
import { DetailDesignProvider } from '../contexts/DetailDesignContext';
import { SettlementMockProvider } from '../contexts/SettlementMockContext';
import {
  SharedHeaderChromeProvider,
  useSharedHeaderVisuals,
  useSuppressBottomNav,
} from '../contexts/SharedHeaderChromeContext';
import { UiPreviewProvider, useUiKit } from '../contexts/UiPreviewContext';
import { usePastEventConversionSchedule } from '../hooks/usePastEventConversionSchedule';
import {
  getActiveTab,
  shouldHideBottomNav,
  shouldHideHeader,
} from '../utils/bottomNavVisibility';
import { resolveStackAnimation } from '../utils/tabTransition';
import { getMyselfSetupPhase, initializeDatabase, ensureDatabaseOpened } from '../db';
import { convertPastEventsToAutoEpisodes } from '../utils/eventEpisodeConversion';
import { SHARED_HEADER_BAR_MIN_HEIGHT } from '../components/screen/SharedHeaderFrame';

const BOTTOM_TAB_ROUTE_NAMES = new Set([
  'index',
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
  const hideBottomNav = shouldHideBottomNav(pathname);
  const kit = useUiKit();
  const { colors } = useAppTheme();
  const { detailHeader, subToolHeader } = useSharedHeaderVisuals();
  const isDetailRoute = pathname.includes('/detail');
  const useSharedChrome = kit.sharedHeaderChrome;
  const showDetailChrome = isDetailRoute && detailHeader != null;
  /** 下部タブ付きサブツールはヘッダー枠の高さを維持して上下ジャンプを防ぐ */
  const showSubToolChrome = hideHeader && !hideBottomNav;

  if (useSharedChrome && (isDetailRoute || !hideHeader || showSubToolChrome)) {
    const useSubToolBar = showSubToolChrome && !isDetailRoute;
    return (
      <SharedHeaderFrame
        backgroundColor={
          showDetailChrome || useSubToolBar
            ? colors.screenBackground
            : colors.headerBackground
        }
        borderColor={
          showDetailChrome || useSubToolBar ? colors.topBarBorder : colors.headerBorder
        }
      >
        {showDetailChrome && detailHeader ? (
          <ScreenTopBar
            title="Profile"
            variant="plain"
            titleFramed={false}
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
        ) : useSubToolBar ? (
          subToolHeader ? (
            <ScreenTopBar
              title={subToolHeader.title}
              variant="plain"
              onBack={subToolHeader.onBack}
              right={subToolHeader.right}
              titleTrailing={subToolHeader.titleTrailing}
              titleFramed={subToolHeader.titleFramed ?? false}
            />
          ) : (
            <View style={{ minHeight: SHARED_HEADER_BAR_MIN_HEIGHT }} />
          )
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
  const router = useRouter();
  const suppressBottomNav = useSuppressBottomNav();
  const { colors } = useAppTheme();
  const [setupPhase, setSetupPhase] = useState(() => {
    try {
      initializeDatabase();
      return getMyselfSetupPhase();
    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          errorString: String(error),
          errorMessage: error instanceof Error ? error.message : 'no message',
          errorName: error instanceof Error ? error.name : 'unknown',
        },
      });
      throw error;
    }
  });
  const needsSetup = setupPhase !== 'ready';
  const onSetupRoute = pathname.includes('setup-myself');
  const hideBottomNav =
    shouldHideBottomNav(pathname) || suppressBottomNav || needsSetup || onSetupRoute;
  const activeTab = getActiveTab(pathname);

  useEffect(() => {
    initializeDatabase();
    setSetupPhase(getMyselfSetupPhase());
  }, [pathname]);

  useEffect(() => {
    if (needsSetup && !onSetupRoute) {
      router.replace('/setup-myself');
    } else if (!needsSetup && onSetupRoute) {
      router.replace('/');
    }
  }, [needsSetup, onSetupRoute, router]);

  return (
    <View style={[styles.shell, { backgroundColor: colors.screenBackground }]}>
      {needsSetup ? null : <AppShellHeader />}
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

function AppProviders() {
  const { EventNotificationHandler } =
    require('../components/EventNotificationHandler') as typeof import('../components/EventNotificationHandler');
  return (
    <AppThemeProvider>
      <DetailDesignProvider>
        <UiPreviewProvider>
          <SharedHeaderChromeProvider>
            <SettlementMockProvider>
              <EventNotificationHandler />
              <PastEventConversionScheduler />
              <NoteFormatAccessoryProvider>
                <AppShell />
              </NoteFormatAccessoryProvider>
            </SettlementMockProvider>
          </SharedHeaderChromeProvider>
        </UiPreviewProvider>
      </DetailDesignProvider>
    </AppThemeProvider>
  );
}

function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        try {
          ensureDatabaseOpened();
          initializeDatabase();
          convertPastEventsToAutoEpisodes();
          setReady(true);
        } catch (error) {
          Sentry.captureException(error, {
            extra: { phase: 'deferred-sqlite-open' },
          });
          throw error;
        }
      });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, []);

  if (!ready) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <View style={[styles.root, styles.launchSplash]} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProviders />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  launchSplash: {
    backgroundColor: '#ffffff',
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
