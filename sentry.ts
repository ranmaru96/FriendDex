import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    enableNative: true,
    enableNativeCrashHandling: true,
    tracesSampleRate: 0,
  });
}
