import { requireOptionalNativeModule } from 'expo-modules-core';

export const isGoogleCalendarNativeAvailable = (): boolean =>
  Boolean(requireOptionalNativeModule('ExpoWebBrowser'));
