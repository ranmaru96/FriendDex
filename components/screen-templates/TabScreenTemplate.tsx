import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { Spacing } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
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
  /** AppHeader 下では top を付けない（二重余白防止）。未指定時は左右のみ。 */
  safeAreaEdges?: readonly Edge[];
};

export function TabScreenTemplate({
  children,
  scrollable = false,
  keyboardAware = false,
  useScreenPadding = true,
  contentContainerStyle,
  extraScrollHeight = 18,
  header,
  safeAreaEdges,
}: TabScreenTemplateProps) {
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const flushTop = isMonochromeAppTheme(appTheme?.variant);
  const bottomNavClearance = useBottomNavScrollClearance();
  const horizontalPadding = useScreenPadding ? kit.screenPaddingHorizontal : 0;
  const bottomPadding = bottomNavClearance > 0 ? bottomNavClearance : Spacing.lg;
  const topPadding = flushTop ? 0 : Spacing.sm;
  /** AppHeader / BottomNav が外枠を担う画面向け。top/bottom はデフォルトで取らない。 */
  const edges = safeAreaEdges ?? (['right', 'left'] as const);

  if (scrollable && keyboardAware) {
    return (
      <SafeAreaView
        edges={edges}
        style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}
      >
        {header}
        <KeyboardAwareScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding, paddingTop: topPadding },
            contentContainerStyle,
            { paddingBottom: bottomPadding },
          ]}
          enableOnAndroid
          enableResetScrollToCoords={false}
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
      <SafeAreaView
        edges={edges}
        style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}
      >
        {header}
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalPadding, paddingTop: topPadding },
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
    <SafeAreaView
      edges={edges}
      style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}
    >
      {header}
      <View
        style={[
          styles.body,
          { paddingHorizontal: horizontalPadding, paddingTop: topPadding },
          contentContainerStyle,
        ]}
      >
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
  },
  scrollContent: {
    paddingBottom: Spacing.lg,
    gap: 10,
  },
});
