import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useKeyboardBottomInset } from '@/utils/useKeyboardBottomInset';

const TOP_CONTENT_PADDING = 12;

type FormOverlayTemplateProps = {
  children: ReactNode;
  title: string;
  titleStyle?: StyleProp<TextStyle>;
  extraScrollHeight?: number;
  scrollContentStyle?: StyleProp<ViewStyle>;
};

export function FormOverlayTemplate({
  children,
  title,
  titleStyle,
  extraScrollHeight = 24,
  scrollContentStyle,
}: FormOverlayTemplateProps) {
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const insets = useSafeAreaInsets();
  const keyboardBottomInset = useKeyboardBottomInset();
  const screenBackground = appTheme?.colors.screenBackground ?? Theme.background;
  const titleColor = appTheme?.colors.onScreenText ?? Theme.textPrimary;

  return (
    <View style={[styles.overlay, { backgroundColor: screenBackground }]}>
      <View style={[styles.body, { paddingBottom: keyboardBottomInset }]}>
        <KeyboardAwareScrollView
          style={[
            styles.scroll,
            {
              paddingTop: insets.top + TOP_CONTENT_PADDING,
              paddingHorizontal: kit.screenPaddingHorizontal,
            },
          ]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(Spacing.lg, insets.bottom + Spacing.md) },
            scrollContentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          enableResetScrollToCoords={false}
          enableOnAndroid={false}
          contentInset={{ bottom: 0 }}
          extraScrollHeight={extraScrollHeight}
        >
          <Text style={[styles.title, { color: titleColor }, titleStyle]}>{title}</Text>
          {children}
        </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Theme.background,
    zIndex: 100,
    elevation: 100,
  },
  body: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {},
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
});
