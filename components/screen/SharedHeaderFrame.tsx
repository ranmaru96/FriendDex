import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { Theme } from '@/constants/theme';

const BAR_MIN_HEIGHT = 44;
const BORDER_BOTTOM = 1.5;

type SharedHeaderFrameProps = {
  children: ReactNode;
  backgroundColor?: string;
  borderColor?: string;
};

/** Home / Detail 共通の固定高さヘッダー枠（Preview 試作） */
export function SharedHeaderFrame({
  children,
  backgroundColor,
  borderColor,
}: SharedHeaderFrameProps) {
  const insets = useSafeAreaInsets();
  const appTheme = useAppThemeOptional();
  const resolvedBackground =
    backgroundColor ?? appTheme?.colors.headerBackground ?? Theme.surface;
  const resolvedBorder = borderColor ?? appTheme?.colors.headerBorder ?? Theme.border;

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingTop: insets.top,
          backgroundColor: resolvedBackground,
          borderBottomColor: resolvedBorder,
        },
      ]}
    >
      <View style={styles.bar}>{children}</View>
    </View>
  );
}

export const SHARED_HEADER_BAR_MIN_HEIGHT = BAR_MIN_HEIGHT;

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: BORDER_BOTTOM,
  },
  bar: {
    minHeight: BAR_MIN_HEIGHT,
    justifyContent: 'center',
  },
});
