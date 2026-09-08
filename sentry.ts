import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://c6ee57167dbd8754d2c63a14773c7163@o4512049938104320.ingest.us.sentry.io/4512050169184256',
  enableNative: true,
  enableNativeCrashHandling: true,
  tracesSampleRate: 0,
});
