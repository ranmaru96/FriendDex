import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import type { BottomNavTabKey } from '@/utils/bottomNavVisibility';
import { switchBottomTab } from '@/utils/tabNavigation';
import { isTabRootPath } from '@/utils/tabStacks';
import { setNextTabAnimation } from '@/utils/tabTransition';

type BottomNavProps = {
  active: BottomNavTabKey | null;
};

const TABS: {
  key: BottomNavTabKey;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'calendar', label: 'カレンダー', icon: 'calendar-outline' },
  { key: 'episode', label: 'エピソード', icon: 'book-outline' },
  { key: 'home', label: '一覧', icon: 'people-outline' },
  { key: 'tasks', label: 'タスク', icon: 'checkbox-outline' },
  { key: 'tools', label: 'ツール', icon: 'construct-outline' },
];

export default function BottomNav({ active }: BottomNavProps) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const appTheme = useAppThemeOptional();
  const tabBarBackground = appTheme?.colors.tabBarBackground ?? Theme.tabBarBase;
  const tabBarBorder = appTheme?.colors.tabBarBorder ?? Theme.tabBarBorder;
  const tabBarInactive = appTheme?.colors.tabBarInactive ?? Theme.tabBarInactiveIcon;
  const tabBarActivePill = appTheme?.colors.tabBarActivePill ?? Theme.tabBarActivePill;
  const tabBarActiveText = appTheme?.colors.tabBarActiveText ?? '#ffffff';

  const handleTabPress = (tab: (typeof TABS)[number]) => {
    if (isTabRootPath(pathname, tab.key)) {
      return;
    }
    const fromIndex = active == null ? -1 : TABS.findIndex((item) => item.key === active);
    const toIndex = TABS.findIndex((item) => item.key === tab.key);
    setNextTabAnimation(toIndex > fromIndex ? 'slide_from_right' : 'slide_from_left');
    switchBottomTab(tab.key, pathname);
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom / 2 + 8,
          backgroundColor: tabBarBackground,
          borderColor: tabBarBorder,
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tabPill,
              isActive ? { backgroundColor: tabBarActivePill } : null,
            ]}
            onPress={() => handleTabPress(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={tab.icon}
              size={22}
              color={isActive ? tabBarActiveText : tabBarInactive}
            />
            <Text
              style={[
                styles.label,
                { color: isActive ? tabBarActiveText : tabBarInactive },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    gap: 3,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 9,
    fontWeight: '500',
  },
});
