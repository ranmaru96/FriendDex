import { Stack } from 'expo-router';
import { navigationTapLockListeners } from '@/utils/navigationTapLock';

export default function PeopleTabStack() {
  return <Stack screenListeners={navigationTapLockListeners} screenOptions={{ headerShown: false }} />;
}
