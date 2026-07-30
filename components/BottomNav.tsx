import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { setNextTabAnimation } from '@/utils/tabTransition';

type TabKey = 'home' | 'commonitems' | 'calendar' | 'episode' | 'tools' | 'friends';

type BottomNavProps = {
  active: TabKey;
};

const TABS: {
  key: TabKey;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  route: '/' | '/commonitems' | '/calendar' | '/episode' | '/tools' | '/friends';
}[] = [
  { key: 'home', label: '一覧', icon: 'people-outline', route: '/' },
  { key: 'commonitems', label: '共通項目', icon: 'pricetag-outline', route: '/commonitems' },
  { key: 'calendar', label: 'カレンダー', icon: 'calendar-outline', route: '/calendar' },
  { key: 'episode', label: 'エピソード', icon: 'book-outline', route: '/episode' },
  { key: 'tools', label: 'ツール', icon: 'construct-outline', route: '/tools' },
  { key: 'friends', label: '友達', icon: 'people-circle-outline', route: '/friends' },
];

export default function BottomNav({ active }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const appTheme = useAppThemeOptional();
  const tabBarBackground = appTheme?.colors.tabBarBackground ?? Theme.tabBarBase;
  const tabBarBorder = appTheme?.colors.tabBarBorder ?? Theme.tabBarBorder;
  const tabBarInactive = appTheme?.colors.tabBarInactive ?? Theme.tabBarInactiveIcon;
  const tabBarActivePill = appTheme?.colors.tabBarActivePill ?? Theme.tabBarActivePill;
  const tabBarActiveText = appTheme?.colors.tabBarActiveText ?? '#ffffff';

  const handleTabPress = (tab: (typeof TABS)[number]) => {
    if (active === tab.key) {
      return;
    }
    const fromIndex = TABS.findIndex((item) => item.key === active);
    const toIndex = TABS.findIndex((item) => item.key === tab.key);
    setNextTabAnimation(toIndex > fromIndex ? 'slide_from_right' : 'slide_from_left');
    router.replace(tab.route);
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
