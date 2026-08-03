import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing } from '@/constants/theme';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';
import { useSubScreenHeaderStyles } from '@/components/screen/subScreenHeaderStyles';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useKeyboardBottomInset } from '@/utils/useKeyboardBottomInset';

type FormScreenTemplateProps = {
  children: ReactNode;
  title?: string;
  titleAlign?: 'center' | 'left';
  onBack?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  footer?: ReactNode;
  extraScrollHeight?: number;
  scrollContentStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
};

export function FormScreenTemplate({
  children,
  title,
  titleAlign = 'center',
  onBack,
  left,
  right,
  footer,
  extraScrollHeight = 20,
  scrollContentStyle,
  scrollEnabled = true,
}: FormScreenTemplateProps) {
  const kit = useUiKit();
  const headerStyles = useSubScreenHeaderStyles();
  const insets = useSafeAreaInsets();
  const keyboardBottomInset = useKeyboardBottomInset();
  // SafeAreaView already clears the home indicator; only pad the keyboard overlap beyond that.
  const bodyKeyboardPad = Math.max(0, keyboardBottomInset - insets.bottom);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      {titleAlign === 'left' ? (
        <View style={headerStyles.bar}>
          <Text style={headerStyles.titleLeft} numberOfLines={1}>
            {title ?? ''}
          </Text>
          <View style={styles.titleSideRight}>{right ?? null}</View>
        </View>
      ) : (
        <ScreenTopBar title={title} onBack={onBack} left={left} right={right} />
      )}

      <View style={[styles.body, { paddingBottom: bodyKeyboardPad }]}>
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: kit.screenPaddingHorizontal },
            scrollContentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          // Parent already shrinks by keyboard height; avoid a second keyboard spacer.
          enableOnAndroid={false}
          contentInset={{ bottom: 0 }}
          extraScrollHeight={extraScrollHeight}
          scrollEnabled={scrollEnabled}
        >
          {children}
        </KeyboardAwareScrollView>

        {footer}
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
  scroll: {
    flex: 1,
  },
  titleSideRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: 6,
  },
});
