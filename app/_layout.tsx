import '../sentry';
import { Stack, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { InteractionManager, Pressable, StyleSheet, View, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from '../AppHeader';
import BottomNav from '../components/BottomNav';
import { BackdropBlur } from '../components/screen/BackdropBlur';
import { LaunchSplash } from '../components/screen/LaunchSplash';
import { ScreenTopBar } from '../components/screen/ScreenTopBar';
import { SharedHeaderFrame } from '../components/screen/SharedHeaderFrame';
import { PendingEpisodeReviewHost } from '../components/episode/PendingEpisodeReviewHost';
import { NavDiagHost } from '../components/navDiag/NavDiagHost';
import { AppThemeProvider, useAppTheme } from '../contexts/AppThemeContext';
import { NoteFormatAccessoryProvider } from '@/contexts/NoteFormatAccessoryContext';
import { DetailDesignProvider } from '../contexts/DetailDesignContext';
import { SettlementMockProvider } from '../contexts/SettlementMockContext';
import {
  SharedHeaderChromeProvider,
  useSharedHeaderVisuals,
  useShellHeaderHidden,
  useSuppressBottomNav,
} from '../contexts/SharedHeaderChromeContext';
import { AuthSessionProvider, useAuthSession } from '@/contexts/AuthSessionContext';
import { EmailAccountLinkGate } from '@/components/auth/EmailAccountLinkGate';
import { useEmailAccountMigration } from '@/hooks/useEmailAccountMigration';
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
} from '../utils/tabTransition';
import { openAfterAuthGate, resetAuthGateNavigation } from '@/utils/navigationRestore';
import {
  installNavigationTapLock,
  navigationTapLockListeners,
  useNavigationTapLock,
} from '@/utils/navigationTapLock';
import { useTabStackBackHandler } from '@/hooks/useTabStackBackHandler';
import { useTabStackSync } from '@/hooks/useTabStackSync';
import { getMyselfSetupPhase, initializeDatabase, ensureDatabaseOpened } from '../db';
import {
  getPasswordRecoveryRevision,
  isPasswordRecoveryPending,
  subscribePasswordRecovery,
} from '@/lib/passwordResetLink';
import { convertPastEventsToAutoEpisodes } from '../utils/eventEpisodeConversion';
import {
  absorbWidgetTaskChecks,
  listenForTodayScheduleWidgetToggles,
  requestTodayScheduleWidgetSync,
} from '@/utils/todayScheduleWidget';
import '@/widgets/MemoryWidget';
import '@/widgets/RecordWidget';
import '@/widgets/TodayScheduleWidget';
import '@/widgets/UpcomingPeopleWidget';
import { SHARED_HEADER_BAR_MIN_HEIGHT } from '../components/screen/SharedHeaderFrame';

installNavigationTapLock();

const BOTTOM_TAB_ROUTE_NAMES = new Set([
  'index',
  'calendar',
  'people',
  'episode',
  'tools',
  'tasks',
]);

function stackRoutePath(routeName: string): string {
  return routeName.startsWith('/') ? routeName : `/${routeName}`;
}

/** 予定の追加・編集。予定詳細（event-detail）は含めない */
function isEventFormPath(pathname: string): boolean {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  return path === '/event';
}

/**
 * 予定フォームを開いているあいだは、その下に残っている画面のパスを返す。
 * 左右のすき間から見える画面のヘッダーと下部ナビを動かさないため。
 */
function useShellChromePath(): { pathname: string; chromePath: string; eventFormOpen: boolean } {
  const pathname = usePathname();
  const rootState = useRootNavigationState();
  const eventFormOpen = isEventFormPath(pathname);
  const eventInStack = Boolean(rootState?.routes?.some((route) => route.name === 'event'));
  const hostPathRef = useRef(pathname);
  if (!eventInStack && !eventFormOpen) {
    hostPathRef.current = pathname;
  }
  return {
    pathname,
    chromePath: eventFormOpen ? hostPathRef.current : pathname,
    eventFormOpen,
  };
}

/** シェルのヘッダーをこの画面の上に重ねて出すか。AppShellHeader と同じ条件。 */
function routeShowsShellHeader(path: string): boolean {
  if (path.includes('/detail')) {
    return true;
  }
  if (!shouldHideHeader(path)) {
    return true;
  }
  return shouldKeepSharedHeaderFrame(path);
}

function estimateShellHeaderHeight(topInset: number): number {
  return topInset + 44 + 2;
}

function estimateShellNavHeight(bottomInset: number): number {
  return 8 + 12 + 22 + 3 + 12 + (bottomInset / 2 + 8) + 2;
}

function PastEventConversionScheduler() {
  usePastEventConversionSchedule();
  return null;
}

function TodayScheduleWidgetSync() {
  useEffect(() => {
    listenForTodayScheduleWidgetToggles();
    const sync = () => {
      void absorbWidgetTaskChecks().finally(() => {
        requestTodayScheduleWidgetSync();
      });
    };
    sync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sync();
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);
  return null;
}

function AppShellHeader({ chromePath }: { chromePath: string }) {
  const hideHeader = shouldHideHeader(chromePath);
  const kit = useUiKit();
  const { colors } = useAppTheme();
  const { detailHeader, subToolHeader } = useSharedHeaderVisuals();
  const isDetailRoute = chromePath.includes('/detail');
  const useSharedChrome = kit.sharedHeaderChrome;
  const showDetailChrome = isDetailRoute && detailHeader != null;
  /** 下部タブ付きサブツール／マイページはヘッダー枠の高さを維持して上下ジャンプを防ぐ */
  const showSubToolChrome = shouldKeepSharedHeaderFrame(chromePath);

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

function usePasswordRecoveryPending(): boolean {
  useSyncExternalStore(
    subscribePasswordRecovery,
    getPasswordRecoveryRevision,
    getPasswordRecoveryRevision
  );
  return isPasswordRecoveryPending();
}

function AppShell() {
  const { pathname, chromePath, eventFormOpen } = useShellChromePath();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const suppressBottomNav = useSuppressBottomNav();
  const shellHeaderHidden = useShellHeaderHidden();
  const { colors, variant } = useAppTheme();
  const backdropTint = variant === 'black' ? 'dark' : 'light';
  const [headerHeight, setHeaderHeight] = useState(() => estimateShellHeaderHeight(insets.top));
  const [navHeight, setNavHeight] = useState(() => estimateShellNavHeight(insets.bottom));
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
  const onResetRoute = pathname.includes('reset-password');
  const recoveryPending = usePasswordRecoveryPending();
  const loggedOut = configured && !session;
  const emailMigration = useEmailAccountMigration(session, recoveryPending || onResetRoute);
  const hideBottomNav =
    shouldHideBottomNav(chromePath) ||
    suppressBottomNav ||
    needsSetup ||
    onSetupRoute ||
    onLoginRoute ||
    onResetRoute ||
    loggedOut ||
    recoveryPending ||
    emailMigration.visible;
  useTabStackSync();
  const activeTab = getActiveTab(chromePath);
  const [gateOpened, setGateOpened] = useState(false);
  useTabStackBackHandler(
    !hideBottomNav &&
    !eventFormOpen &&
    !needsSetup &&
    !onSetupRoute &&
    !onLoginRoute &&
    !onResetRoute &&
    !recoveryPending &&
    !emailMigration.visible
  );

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
    const onReset = pathname.includes('reset-password');

    if (isPasswordRecoveryPending()) {
      if (!onReset) {
        router.replace('/reset-password');
      }
      return;
    }

    if (loggedOut) {
      resetAuthGateNavigation();
      setGateOpened(false);
      if (!onLogin) {
        router.replace('/login');
      }
      return;
    }

    if (!setupNeeded) {
      openAfterAuthGate(pathname);
      setGateOpened(true);
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
  }, [authReady, configured, pathname, recoveryPending, router, session]);

  const shellHidesHeader =
    loggedOut || needsSetup || shellHeaderHidden || onResetRoute || recoveryPending || emailMigration.visible;
  const shellHidesNav =
    suppressBottomNav ||
    needsSetup ||
    onSetupRoute ||
    onLoginRoute ||
    onResetRoute ||
    loggedOut ||
    recoveryPending ||
    emailMigration.visible;
  const showShellHeader = !shellHidesHeader && routeShowsShellHeader(chromePath);
  const rememberChromeHeight = (current: number, next: number) =>
    next > 0 && next !== current ? next : current;

  return (
    <View style={[styles.shell, { backgroundColor: colors.screenBackground }]}>
      <View style={styles.content}>
        <Stack
          screenListeners={navigationTapLockListeners}
          screenLayout={({ route, children }) => {
            // タブの中は親から route.name が (tabs) のままなので、見えている URL で余白を決める。
            // 予定フォーム中は、下に残っている画面の余白を使う。
            const path =
              route.name === '(tabs)'
                ? eventFormOpen
                  ? chromePath
                  : pathname
                : route.name === 'event' && eventFormOpen
                  ? chromePath
                  : stackRoutePath(route.name);
            const paddingTop =
              shellHidesHeader || !routeShowsShellHeader(path) ? 0 : headerHeight;
            const paddingBottom =
              shellHidesNav || shouldHideBottomNav(path) ? 0 : navHeight;
            const eventModal = route.name === 'event';
            return (
              <View
                style={[
                  styles.screenInset,
                  {
                    paddingTop,
                    paddingBottom,
                    backgroundColor: eventModal ? 'transparent' : colors.screenBackground,
                  },
                ]}
              >
                <View style={styles.screenFrame}>{children}</View>
              </View>
            );
          }}
          screenOptions={({ route }) => ({
            headerShown: false,
            contentStyle: {
              backgroundColor: route.name === 'event' ? 'transparent' : colors.screenBackground,
            },
            animation: resolveStackAnimation(route.name, BOTTOM_TAB_ROUTE_NAMES),
            /** replace でも push と同じ方向で入る（pop だと向きが反転する） */
            animationTypeForReplace: peekNextReplaceAsPop() ? 'pop' : 'push',
            /** 下部ナビ付き画面はタブ階層で戻る。スワイプで Stack の戻るとタブが混ざるのを防ぐ */
            gestureEnabled:
              route.name !== 'event' &&
              route.name !== 'reset-password' &&
              shouldHideBottomNav(`/${route.name}`),
            ...(route.name === 'event' ? { presentation: 'transparentModal' as const } : {}),
          })}
        />
        {(!authReady ||
          (recoveryPending && !onResetRoute) ||
          (!recoveryPending && loggedOut && !onLoginRoute) ||
          (!recoveryPending && needsSetup && !onLoginRoute && !onSetupRoute) ||
          (!recoveryPending && !loggedOut && !needsSetup && !gateOpened)) ? (
          <View pointerEvents="auto" style={StyleSheet.absoluteFill}>
            <LaunchSplash />
          </View>
        ) : null}
      </View>
      {showShellHeader ? (
        <View
          pointerEvents={eventFormOpen ? 'none' : 'box-none'}
          style={styles.headerOverlay}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            setHeaderHeight((current) => rememberChromeHeight(current, next));
          }}
        >
          <AppShellHeader chromePath={chromePath} />
          {eventFormOpen ? <BackdropBlur tint={backdropTint} /> : null}
        </View>
      ) : null}
      {!hideBottomNav ? (
        <View
          pointerEvents={eventFormOpen ? 'none' : 'box-none'}
          style={styles.navOverlay}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            setNavHeight((current) => rememberChromeHeight(current, next));
          }}
        >
          <BottomNav active={activeTab} />
          {eventFormOpen ? <BackdropBlur tint={backdropTint} /> : null}
        </View>
      ) : null}
      <PendingEpisodeReviewHost
        enabled={
          authReady &&
          !loggedOut &&
          !needsSetup &&
          !onLoginRoute &&
          !onSetupRoute &&
          !onResetRoute &&
          !recoveryPending &&
          !emailMigration.visible
        }
      />
      <NavigationTapShield />
      <NavDiagHost />
      {emailMigration.visible ? (
        <View style={StyleSheet.absoluteFill}>
          <EmailAccountLinkGate checking={emailMigration.checking} onLinked={() => void emailMigration.refresh()} />
        </View>
      ) : null}
    </View>
  );
}

function NavigationTapShield() {
  const locked = useNavigationTapLock();
  if (!locked) {
    return null;
  }
  return (
    <View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFill, styles.tapShield]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
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
                  <TodayScheduleWidgetSync />
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
          <LaunchSplash />
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
    backgroundColor: '#000000',
  },
  shell: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  screenInset: {
    flex: 1,
  },
  /** 絶対配置の基準。padding の内側なのでフォームのバーがシェルヘッダーに隠れない */
  screenFrame: {
    flex: 1,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  navOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  tapShield: {
    zIndex: 50,
  },
  adjacentHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
