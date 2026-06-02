import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabKey = 'home' | 'episode' | 'commonitems' | 'friends';

type BottomNavProps = {
  active: TabKey;
};

const TABS: {
  key: TabKey;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  route: '/' | '/episode' | '/commonitems' | '/friends';
}[] = [
  { key: 'home', label: '一覧', icon: 'people-outline', route: '/' },
  { key: 'episode', label: 'エピソード', icon: 'book-outline', route: '/episode' },
  { key: 'commonitems', label: '共通項目', icon: 'pricetag-outline', route: '/commonitems' },
  { key: 'friends', label: '友達', icon: 'people-circle-outline', route: '/friends' },
];

export default function BottomNav({ active }: BottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom / 2 + 8 }]}>
      <View style={styles.track}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#d8d8de',
    borderWidth: 1.5,
    borderColor: '#b8b8c4',
    borderBottomWidth: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    paddingTop: 8,
  },
  track: {
    marginHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#e0e0e6',
    padding: 3,
    flexDirection: 'row',
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
    backgroundColor: '#222222',
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
