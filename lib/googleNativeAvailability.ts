import { requireOptionalNativeModule } from 'expo-modules-core';

export const isGoogleCalendarNativeAvailable = (): boolean => {
  try {
    return Boolean(requireOptionalNativeModule('ExpoWebBrowser'));
  } catch {
    return false;
  }
};
