import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { Theme } from '@/constants/theme';

type ScreenShellProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  includeTopInset?: boolean;
  includeBottomInset?: boolean;
};

export function ScreenShell({
  children,
  style,
  backgroundColor,
  includeTopInset = true,
  includeBottomInset = false,
}: ScreenShellProps) {
  const insets = useSafeAreaInsets();
  const appTheme = useAppThemeOptional();
  const resolvedBackground =
    backgroundColor ?? appTheme?.colors.screenBackground ?? Theme.screenBase;

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: resolvedBackground,
          paddingTop: includeTopInset ? insets.top : 0,
          paddingBottom: includeBottomInset ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
