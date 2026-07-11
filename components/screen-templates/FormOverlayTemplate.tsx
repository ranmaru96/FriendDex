import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, Theme } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';

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
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.overlay}>
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
        enableOnAndroid
        extraScrollHeight={extraScrollHeight}
      >
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {children}
      </KeyboardAwareScrollView>
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
