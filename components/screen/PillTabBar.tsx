import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, Spacing } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { contentSearchAreaStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

export type PillTabItem<T extends string> = {
  key: T;
  caption: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  color?: string;
  accessibilityLabel?: string;
};

type PillTabBarProps<T extends string> = {
  tabs: PillTabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  perTabColors?: boolean;
};

export function PillTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  perTabColors = false,
}: PillTabBarProps<T>) {
  const kit = useUiKit();
  const content = useContentColors();

  return (
    <View
      style={[
        styles.tabSection,
        { paddingHorizontal: kit.subToolScreenPaddingHorizontal, backgroundColor: kit.screenBackground },
      ]}
    >
      <View style={[styles.tabTrack, contentSearchAreaStyle(content)]}>
        <View style={styles.tabInner}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const activeColor = perTabColors && tab.color ? tab.color : Theme.accent;
            const inactiveIconBg = perTabColors && tab.color ? tab.color : Theme.tabInactive;
            return (
              <Pressable
                key={tab.key}
                onPress={() => onTabChange(tab.key)}
                style={[
                  styles.tabPill,
                  isActive && {
                    borderColor: activeColor,
                    backgroundColor: activeColor,
                  },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.accessibilityLabel ?? tab.caption}
              >
                <View style={styles.tabPillContent}>
                  <View
                    style={[
                      styles.tabPillIconCircle,
                      isActive
                        ? styles.tabPillIconCircleActive
                        : { backgroundColor: inactiveIconBg },
                    ]}
                  >
                    <Ionicons name={tab.icon} size={16} color={Theme.onAccent} />
                  </View>
                  <Text
                    style={[
                      styles.tabPillCaption,
                      isActive ? styles.tabPillCaptionActive : [styles.tabPillCaptionInactive, contentTextStyle(content)],
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {tab.caption}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabSection: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  tabTrack: {
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.searchFieldBorder,
    paddingVertical: 1.5,
    paddingHorizontal: 3,
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 2,
    width: '100%',
  },
  tabPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 1,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabPillContent: {
    alignItems: 'center',
    gap: 3,
    width: '100%',
  },
  tabPillCaption: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
    maxWidth: '100%',
    textAlign: 'center',
  },
  tabPillCaptionInactive: {
    color: Theme.tabInactive,
  },
  tabPillCaptionActive: {
    color: Theme.tabActiveText,
  },
  tabPillIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillIconCircleActive: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});
