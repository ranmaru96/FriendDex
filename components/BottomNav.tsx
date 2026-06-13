import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '@/constants/theme';

type TabKey = 'home' | 'commonitems' | 'episode' | 'tools' | 'friends';

type BottomNavProps = {
  active: TabKey;
};

const TABS: {
  key: TabKey;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  route: '/' | '/commonitems' | '/episode' | '/tools' | '/friends';
}[] = [
  { key: 'home', label: '一覧', icon: 'people-outline', route: '/' },
  { key: 'commonitems', label: '共通項目', icon: 'pricetag-outline', route: '/commonitems' },
  { key: 'episode', label: 'エピソード', icon: 'book-outline', route: '/episode' },
  { key: 'tools', label: 'その他', icon: 'ellipsis-horizontal-circle-outline', route: '/tools' },
  { key: 'friends', label: '友達', icon: 'people-circle-outline', route: '/friends' },
];

export default function BottomNav({ active }: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom / 2 + 8 }]}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabPill, isActive && styles.tabPillActive]}
            onPress={() => router.replace(tab.route)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={tab.icon}
              size={22}
              color={isActive ? '#ffffff' : '#888888'}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Theme.tabBarBase,
    borderTopWidth: 1.5,
    borderColor: Theme.tabBarBorder,
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
  tabPillActive: {
    backgroundColor: Theme.screenBase,
  },
  label: {
    fontSize: 9,
    fontWeight: '500',
    color: '#888888',
  },
  labelActive: {
    color: '#ffffff',
  },
});
