import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { HomeCardElevation } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { PanelSection } from '@/components/ui/Panel';

type FormScreenSectionProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** multiCard 時に一覧カード風のシャドウを付ける */
  elevated?: boolean;
};

export function FormScreenSection({ children, style, elevated = false }: FormScreenSectionProps) {
  const kit = useUiKit();

  if (kit.formContainer === 'singlePanel') {
    return <PanelSection style={style}>{children}</PanelSection>;
  }

  return (
    <View
      style={[
        styles.multiCard,
        elevated ? styles.elevated : null,
        {
          backgroundColor: kit.panelBackground,
          borderColor: kit.panelBorderColor,
          borderWidth: kit.panelBorderWidth,
          borderRadius: kit.panelBorderRadius,
          paddingHorizontal: kit.sectionPaddingHorizontal,
          paddingVertical: kit.sectionPaddingVertical,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  multiCard: {
    gap: 6,
  },
  elevated: {
    ...HomeCardElevation,
  },
});
