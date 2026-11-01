import { Stack } from 'expo-router';
import { navigationTapLockListeners } from '@/utils/navigationTapLock';

export default function CalendarTabStack() {
  return <Stack screenListeners={navigationTapLockListeners} screenOptions={{ headerShown: false }} />;
}
