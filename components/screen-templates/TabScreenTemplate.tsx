import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Spacing } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useBottomNavScrollClearance } from '@/hooks/useBottomNavScrollClearance';

type TabScreenTemplateProps = {
  children: ReactNode;
  scrollable?: boolean;
  keyboardAware?: boolean;
  /** false のとき横余白は画面側で制御（Detail ヒーローなど） */
  useScreenPadding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraScrollHeight?: number;
  /** SafeArea 内・スクロール外に置くヘッダー（ScreenTopBar など） */
  header?: ReactNode;
};

export function TabScreenTemplate({
  children,
  scrollable = false,
  keyboardAware = false,
  useScreenPadding = true,
  contentContainerStyle,
  extraScrollHeight = 18,
  header,
}: TabScreenTemplateProps) {
  const kit = useUiKit();
  const bottomNavClearance = useBottomNavScrollClearance();
  const horizontalPadding = useScreenPadding ? kit.screenPaddingHorizontal : 0;
  const bottomPadding = bottomNavClearance > 0 ? bottomNavClearance : Spacing.lg;

  if (scrollable && keyboardAware) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
        {header}
        <KeyboardAwareScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding },
            contentContainerStyle,
            { paddingBottom: bottomPadding },
          ]}
          enableOnAndroid
          extraScrollHeight={extraScrollHeight}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  if (scrollable) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
        {header}
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding },
            contentContainerStyle,
            { paddingBottom: bottomPadding },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      {header}
      <View style={[styles.body, { paddingHorizontal: horizontalPadding }, contentContainerStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingTop: Spacing.sm,
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: 10,
  },
});
