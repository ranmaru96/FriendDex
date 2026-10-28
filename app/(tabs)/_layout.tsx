import { Tabs } from 'expo-router';
import {
  noteTabSwitchTransitionEnd,
  noteTabSwitchTransitionStart,
} from '@/utils/navigationTapLock';

export const unstable_settings = {
  anchor: '(calendar)',
};

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="(calendar)"
      tabBar={() => null}
      screenListeners={{
        transitionStart: (event) => {
          noteTabSwitchTransitionStart(event.target);
        },
        transitionEnd: (event) => {
          noteTabSwitchTransitionEnd(event.target);
        },
      }}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
      }}
    />
  );
}
