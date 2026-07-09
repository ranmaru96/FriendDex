import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { searchAreaStyles } from '@/utils/searchAreaStyles';
import { useUiKit } from '@/contexts/UiPreviewContext';

type SearchAreaProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type SearchAreaRowProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SearchArea({ children, style }: SearchAreaProps) {
  return <View style={[searchAreaStyles.area, style]}>{children}</View>;
}

export function SearchAreaRow({ children, style }: SearchAreaRowProps) {
  return <View style={[searchAreaStyles.row, style]}>{children}</View>;
}

export function SearchAreaDivider() {
  const kit = useUiKit();
  if (kit.searchAreaStyle === 'singleBorder') {
    return null;
  }
  return <View style={searchAreaStyles.areaDivider} />;
}

export { searchAreaStyles };
