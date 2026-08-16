import { useLayoutEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Spacing } from '@/constants/theme';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';
import { useSharedHeaderChromeOptional } from '@/contexts/SharedHeaderChromeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useBottomNavScrollClearance } from '@/hooks/useBottomNavScrollClearance';

type SubToolScreenTemplateProps = {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  /** 中央タイトルの右側（編集ボタンなど） */
  titleTrailing?: ReactNode;
  /** トップバー直下（PillTabBar など） */
  header?: ReactNode;
  scrollable?: boolean;
  keyboardAware?: boolean;
  /** false のとき戻るリンク等を本文内に置く（appsettings など） */
  useTopBar?: boolean;
  /** false のとき横余白は画面側で制御 */
  useScreenPadding?: boolean;
  scrollContentStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  extraScrollHeight?: number;
};

export function SubToolScreenTemplate({
  children,
  title,
  onBack,
  right,
  titleTrailing,
  header,
  scrollable = true,
  keyboardAware = false,
  useTopBar = true,
  useScreenPadding = true,
  scrollContentStyle,
  contentStyle,
  extraScrollHeight = 20,
}: SubToolScreenTemplateProps) {
  const kit = useUiKit();
  const sharedHeaderApi = useSharedHeaderChromeOptional();
  const setSubToolHeader = sharedHeaderApi?.setSubToolHeader;
  const useSharedTopBar = Boolean(kit.sharedHeaderChrome && useTopBar && setSubToolHeader);
  const bottomNavClearance = useBottomNavScrollClearance();
  const horizontalPadding = useScreenPadding ? kit.subToolScreenPaddingHorizontal : 0;
  const bottomPadding = bottomNavClearance > 0 ? bottomNavClearance : Spacing.lg;

  useLayoutEffect(() => {
    if (!useSharedTopBar || !setSubToolHeader) return;
    setSubToolHeader({ title, onBack, right, titleTrailing });
    return () => setSubToolHeader(null);
  }, [useSharedTopBar, setSubToolHeader, title, onBack, right, titleTrailing]);

  const body = scrollable ? (
    keyboardAware ? (
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPadding },
          scrollContentStyle,
          { paddingBottom: bottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        enableResetScrollToCoords={false}
        extraScrollHeight={extraScrollHeight}
      >
        {children}
      </KeyboardAwareScrollView>
    ) : (
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: horizontalPadding },
          scrollContentStyle,
          { paddingBottom: bottomPadding },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    )
  ) : (
    <View
      style={[
        styles.content,
        { paddingHorizontal: horizontalPadding, paddingBottom: bottomPadding },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={useSharedTopBar ? (['left', 'right', 'bottom'] as const) : (['top', 'left', 'right', 'bottom'] as const)}
      style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}
    >
      {useTopBar && !useSharedTopBar ? (
        <ScreenTopBar title={title} onBack={onBack} right={right} titleTrailing={titleTrailing} />
      ) : null}
      {header}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
});
