import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Spacing } from '@/constants/theme';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';
import { subScreenHeaderStyles } from '@/components/screen/subScreenHeaderStyles';
import { useUiKit } from '@/contexts/UiPreviewContext';

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
}: FormScreenTemplateProps) {
  const kit = useUiKit();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      {titleAlign === 'left' ? (
        <View style={subScreenHeaderStyles.bar}>
          <Text style={subScreenHeaderStyles.titleLeft} numberOfLines={1}>
            {title ?? ''}
          </Text>
          <View style={styles.titleSideRight}>{right ?? null}</View>
        </View>
      ) : (
        <ScreenTopBar title={title} onBack={onBack} left={left} right={right} />
      )}

      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: kit.screenPaddingHorizontal },
          scrollContentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={extraScrollHeight}
      >
        {children}
      </KeyboardAwareScrollView>

      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
