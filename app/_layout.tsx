import '../sentry';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
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
import { AuthSessionProvider, useAuthSession } from '@/contexts/AuthSessionContext';
import { NetworkReachabilityProvider } from '@/contexts/NetworkReachabilityContext';
import { UiPreviewProvider, useUiKit } from '../contexts/UiPreviewContext';
import { usePastEventConversionSchedule } from '../hooks/usePastEventConversionSchedule';
import {
  getActiveTab,
  shouldHideBottomNav,
  shouldHideHeader,
  shouldKeepSharedHeaderFrame,
} from '../utils/bottomNavVisibility';
import {
  peekNextReplaceAsPop,
  resolveStackAnimation,
  suppressNextTabSlideOnce,
} from '../utils/tabTransition';
import { useTabStackBackHandler } from '@/hooks/useTabStackBackHandler';
import { useTabStackSync } from '@/hooks/useTabStackSync';
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

/** プロセスが生きているあいだは、起動時のカレンダー誘導を繰り返さない。 */
let launchRouteChosen = false;

const isListIndexPath = (pathname: string): boolean =>
  pathname === '/' || pathname === '/index';

function PastEventConversionScheduler() {
  usePastEventConversionSchedule();
  return null;
}

function AppShellHeader() {
  const pathname = usePathname();
  const hideHeader = shouldHideHeader(pathname);
  const kit = useUiKit();
  const { colors } = useAppTheme();
  const { detailHeader, subToolHeader } = useSharedHeaderVisuals();
  const isDetailRoute = pathname.includes('/detail');
  const useSharedChrome = kit.sharedHeaderChrome;
  const showDetailChrome = isDetailRoute && detailHeader != null;
  /** 下部タブ付きサブツール／マイページはヘッダー枠の高さを維持して上下ジャンプを防ぐ */
  const showSubToolChrome = shouldKeepSharedHeaderFrame(pathname);

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
  const { configured, session, ready: authReady } = useAuthSession();
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
  const onLoginRoute = pathname.includes('login');
  const loggedOut = configured && !session;
  const [holdLaunchList, setHoldLaunchList] = useState(() => !launchRouteChosen);
  const coveringLaunchList =
    holdLaunchList &&
    authReady &&
    !loggedOut &&
    !needsSetup &&
    !onSetupRoute &&
    !onLoginRoute &&
    isListIndexPath(pathname);
  const hideBottomNav =
    shouldHideBottomNav(pathname) ||
    suppressBottomNav ||
    needsSetup ||
    onSetupRoute ||
    onLoginRoute ||
    loggedOut ||
    coveringLaunchList;
  const activeTab = getActiveTab(pathname);
  useTabStackSync();
  useTabStackBackHandler(!hideBottomNav && !needsSetup && !onSetupRoute && !onLoginRoute);

  useEffect(() => {
    if (!authReady) {
      return;
    }
    initializeDatabase();
    const phase = getMyselfSetupPhase();
    setSetupPhase(phase);
    const setupNeeded = phase !== 'ready';
    const loggedOut = configured && !session;
    const onSetup = pathname.includes('setup-myself');
    const onLogin = pathname.includes('login');

    if (loggedOut) {
      if (!onLogin) {
        router.replace('/login');
      }
      return;
    }

    if (!setupNeeded) {
      if (onLogin || onSetup) {
        launchRouteChosen = true;
        setHoldLaunchList(false);
        router.replace('/calendar');
        return;
      }
      if (!launchRouteChosen) {
        launchRouteChosen = true;
        if (isListIndexPath(pathname) && !Notifications.getLastNotificationResponse()) {
          suppressNextTabSlideOnce();
          router.replace('/calendar');
          return;
        }
        setHoldLaunchList(false);
        return;
      }
      if (!isListIndexPath(pathname)) {
        setHoldLaunchList(false);
      }
      return;
    }

    if (phase === 'register') {
      if (!configured) {
        if (!onSetup) {
          router.replace('/setup-myself');
        }
        return;
      }
      if (!session) {
        if (!onLogin) {
          router.replace('/login');
        }
        return;
      }
      if (!onLogin && !onSetup) {
        router.replace('/login');
      }
      return;
    }

    if (!onSetup) {
      router.replace('/setup-myself');
    }
  }, [authReady, configured, pathname, router, session]);

  return (
    <View style={[styles.shell, { backgroundColor: colors.screenBackground }]}>
      {loggedOut || needsSetup ? null : <AppShellHeader />}
      <View style={styles.content}>
        <Stack
          screenOptions={({ route }) => ({
            headerShown: false,
            animation: resolveStackAnimation(route.name, BOTTOM_TAB_ROUTE_NAMES),
            /** replace でも push と同じ方向で入る（pop だと向きが反転する） */
            animationTypeForReplace: peekNextReplaceAsPop() ? 'pop' : 'push',
            /** 下部ナビ付き画面はタブ階層で戻る。スワイプで Stack の戻るとタブが混ざるのを防ぐ */
            gestureEnabled: shouldHideBottomNav(`/${route.name}`),
          })}
        />
        {(!authReady ||
          (loggedOut && !onLoginRoute) ||
          (needsSetup && !onLoginRoute && !onSetupRoute) ||
          coveringLaunchList) ? (
          <View
            pointerEvents="auto"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.screenBackground }]}
          />
        ) : null}
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
          <AuthSessionProvider>
            <NetworkReachabilityProvider>
              <SharedHeaderChromeProvider>
                <SettlementMockProvider>
                  <EventNotificationHandler />
                  <PastEventConversionScheduler />
                  <NoteFormatAccessoryProvider>
                    <AppShell />
                  </NoteFormatAccessoryProvider>
                </SettlementMockProvider>
              </SharedHeaderChromeProvider>
            </NetworkReachabilityProvider>
          </AuthSessionProvider>
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
