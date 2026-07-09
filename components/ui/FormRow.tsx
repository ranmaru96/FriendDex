import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useUiKit } from '@/contexts/UiPreviewContext';

export type FormRowContentLayout = 'fill' | 'compact' | 'action';

type FormRowProps = {
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** fill=入力欄いっぱい / compact=内容幅に合わせる / action=右寄せボタン */
  contentLayout?: FormRowContentLayout;
  labelWidth?: number;
};

export function FormRow({
  label,
  children,
  style,
  labelStyle,
  contentStyle,
  contentLayout = 'fill',
  labelWidth,
}: FormRowProps) {
  const kit = useUiKit();
  const isHorizontal = kit.formLayout === 'horizontal';
  const resolvedLabelWidth = labelWidth ?? (isHorizontal ? kit.formLabelWidth : undefined);

  return (
    <View
      style={[
        styles.base,
        { gap: kit.formRowGap },
        isHorizontal ? styles.rowHorizontal : styles.rowVertical,
        isHorizontal && contentLayout === 'compact' ? styles.rowHorizontalCompact : null,
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: kit.textSecondary,
            textAlign: kit.formLabelAlign,
            width: resolvedLabelWidth,
            flexShrink: isHorizontal ? 0 : undefined,
          },
          labelStyle,
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          contentLayout === 'fill' ? styles.contentFill : null,
          contentLayout === 'compact' ? styles.contentCompact : null,
          contentLayout === 'action' ? styles.contentAction : null,
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
  },
  rowHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowHorizontalCompact: {
    alignItems: 'center',
  },
  rowVertical: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  contentFill: {
    flex: 1,
    minWidth: 0,
  },
  contentCompact: {
    flexShrink: 1,
    alignSelf: 'flex-start',
  },
  contentAction: {
    flex: 1,
    alignItems: 'flex-end',
  },
});
