import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useUiKit } from '@/contexts/UiPreviewContext';

type PanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type PanelSectionProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type SectionDividerProps = {
  style?: StyleProp<ViewStyle>;
};

export function Panel({ children, style }: PanelProps) {
  const kit = useUiKit();

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: kit.panelBackground,
          borderColor: kit.panelBorderColor,
          borderWidth: kit.panelBorderWidth,
          borderRadius: kit.panelBorderRadius,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PanelSection({ children, style }: PanelSectionProps) {
  const kit = useUiKit();

  return (
    <View
      style={[
        {
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

export function SectionDivider({ style }: SectionDividerProps) {
  const kit = useUiKit();

  return (
    <View
      style={[
        styles.divider,
        {
          backgroundColor: kit.inputBorder,
          marginHorizontal: kit.sectionDividerInset,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
