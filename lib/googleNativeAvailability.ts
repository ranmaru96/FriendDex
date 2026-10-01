import { requireOptionalNativeModule } from 'expo';

export const isGoogleCalendarNativeAvailable = (): boolean => {
  try {
    return Boolean(requireOptionalNativeModule('ExpoWebBrowser'));
  } catch {
    return false;
  }
};
