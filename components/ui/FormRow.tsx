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
  /** vertical のときラベルの下に入力を置く（説明欄など） */
  layout?: 'horizontal' | 'vertical';
  labelWidth?: number;
  labelNumberOfLines?: number;
  /** 未入力など、この行が保存エラーの対象であるとき内容の枠を強調する */
  error?: boolean;
};

export function FormRow({
  label,
  children,
  style,
  labelStyle,
  contentStyle,
  contentLayout = 'fill',
  layout,
  labelWidth,
  labelNumberOfLines = 1,
  error = false,
}: FormRowProps) {
  const kit = useUiKit();
  const isHorizontal = (layout ?? kit.formLayout) === 'horizontal';
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
        numberOfLines={labelNumberOfLines}
        style={[
          styles.label,
          {
            color: kit.textPrimary,
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
          contentLayout === 'fill' ? (isHorizontal ? styles.contentFill : styles.contentFillVertical) : null,
          contentLayout === 'compact' ? styles.contentCompact : null,
          contentLayout === 'action' ? styles.contentAction : null,
          contentStyle,
          error ? styles.contentError : null,
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
  contentFillVertical: {
    width: '100%',
    alignSelf: 'stretch',
  },
  contentCompact: {
    flexShrink: 1,
    alignSelf: 'flex-start',
  },
  contentAction: {
    flex: 1,
    alignItems: 'flex-end',
  },
  contentError: {
    borderWidth: 1.5,
    borderColor: '#b91c1c',
    borderRadius: 8,
    padding: 2,
  },
});
