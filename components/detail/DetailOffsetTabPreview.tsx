import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { DetailTabDef } from '@/constants/detailThemes/types';
import { useContentColors } from '@/utils/useContentColors';

type DetailInkTabBarProps = {
  tabs: DetailTabDef[];
  activeTab: string;
  onTabPress?: (key: DetailTabDef['key']) => void;
  activeColor: string;
  inactiveColor: string;
  iconColor: string;
};

export function DetailInkTabBar({
  tabs,
  activeTab,
  onTabPress,
  activeColor,
  inactiveColor,
  iconColor,
}: DetailInkTabBarProps) {
  const content = useContentColors();

  return (
    <View style={[styles.inkRow, { borderBottomColor: content.contentBorder }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const color = isActive ? activeColor : inactiveColor;
        const body = (
          <>
            {tab.iconSet === 'material' ? (
              <MaterialCommunityIcons
                name={tab.icon as ComponentProps<typeof MaterialCommunityIcons>['name']}
                size={16}
                color={color}
              />
            ) : (
              <Ionicons
                name={tab.icon as ComponentProps<typeof Ionicons>['name']}
                size={16}
                color={isActive ? activeColor : iconColor}
              />
            )}
            <Text
              style={[styles.inkCaption, { color: isActive ? activeColor : inactiveColor }]}
              numberOfLines={1}
            >
              {tab.caption}
            </Text>
          </>
        );
        const itemStyle = [styles.inkItem, isActive ? { borderBottomColor: activeColor } : null];
        if (!onTabPress) {
          return (
            <View key={tab.key} style={itemStyle}>
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            style={itemStyle}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.key}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  inkRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 2,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inkItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
    gap: 3,
  },
  inkCaption: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
