import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';

type ListScreenTemplateProps = {
  children: ReactNode;
  fab?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ListScreenTemplate({ children, fab, style }: ListScreenTemplateProps) {
  const kit = useUiKit();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      <View style={[styles.container, style]}>{children}</View>
      {fab}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingTop: Spacing.sm,
  },
});
