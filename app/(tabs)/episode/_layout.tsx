import { Stack } from 'expo-router';
import { navigationTapLockListeners } from '@/utils/navigationTapLock';

export default function EpisodeTabStack() {
  return <Stack screenListeners={navigationTapLockListeners} screenOptions={{ headerShown: false }} />;
}
