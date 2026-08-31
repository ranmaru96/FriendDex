import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { Spacing } from '@/constants/theme';

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

/** 画面の一塊。図鑑／コーデックスは OffsetCard、モノクロームは枠なし。 */
export function Panel({ children, style }: PanelProps) {
  const patternId = useAppThemeOptional()?.patternId;
  if (usesOffsetChrome(patternId)) {
    return <OffsetCard style={style}>{children}</OffsetCard>;
  }
  return <View style={style}>{children}</View>;
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
  const isBold = kit.sectionDividerStyle === 'bold2px';

  return (
    <View
      style={[
        isBold ? styles.boldDivider : styles.hairlineDivider,
        {
          backgroundColor: kit.inputBorder,
          marginHorizontal: isBold ? Spacing.sm : kit.sectionDividerInset,
          opacity: isBold ? 0.7 : 1,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  hairlineDivider: {
    height: StyleSheet.hairlineWidth,
  },
  boldDivider: {
    height: 1,
  },
});
