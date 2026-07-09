import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Spacing } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';

type TabScreenTemplateProps = {
  children: ReactNode;
  scrollable?: boolean;
  keyboardAware?: boolean;
  /** false のとき横余白は画面側で制御（Detail ヒーローなど） */
  useScreenPadding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraScrollHeight?: number;
};

export function TabScreenTemplate({
  children,
  scrollable = false,
  keyboardAware = false,
  useScreenPadding = true,
  contentContainerStyle,
  extraScrollHeight = 18,
}: TabScreenTemplateProps) {
  const kit = useUiKit();
  const horizontalPadding = useScreenPadding ? kit.screenPaddingHorizontal : 0;

  if (scrollable && keyboardAware) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
        <KeyboardAwareScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding },
            contentContainerStyle,
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
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding },
            contentContainerStyle,
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
