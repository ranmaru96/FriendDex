import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { Spacing } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useMoneyLoanFormStyles } from '@/components/money-loan/moneyLoanFormStyles';

export function MoneyLoanFormCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const formStyles = useMoneyLoanFormStyles();
  const patternId = useAppThemeOptional()?.patternId;
  if (usesOffsetChrome(patternId)) {
    return (
      <OffsetCard contentStyle={[{ padding: Spacing.md, gap: 6 }, style]}>{children}</OffsetCard>
    );
  }
  return <View style={[formStyles.formCard, style]}>{children}</View>;
}
