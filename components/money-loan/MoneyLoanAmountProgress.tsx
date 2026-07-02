import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '@/constants/theme';
import { formatYen } from '@/utils/moneyLoanHelpers';

type MoneyLoanAmountProgressProps = {
  registrationTotalAmount: number;
  unpaidAmount: number;
  settled?: boolean;
  size?: 'session' | 'batch';
};

export function MoneyLoanAmountProgress({
  registrationTotalAmount,
  unpaidAmount,
  settled = false,
  size = 'session',
}: MoneyLoanAmountProgressProps) {
  const isBatch = size === 'batch';

  if (registrationTotalAmount <= 0) {
    if (unpaidAmount <= 0) {
      return null;
    }
    return <Text style={isBatch ? styles.batchUnpaidAmount : styles.sessionUnpaidAmount}>{formatYen(unpaidAmount)}</Text>;
  }

  if (settled || unpaidAmount <= 0) {
    return (
      <Text style={isBatch ? styles.batchRegistrationOnly : styles.sessionRegistrationOnly}>
        {formatYen(registrationTotalAmount)}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={isBatch ? styles.batchPrefix : styles.sessionPrefix}>未返済 </Text>
      <Text style={isBatch ? styles.batchUnpaidAmount : styles.sessionUnpaidAmount}>
        {formatYen(unpaidAmount)}
      </Text>
      <Text style={isBatch ? styles.batchSlash : styles.sessionSlash}>/</Text>
      <Text style={isBatch ? styles.batchRegistrationAmount : styles.sessionRegistrationAmount}>
        {formatYen(registrationTotalAmount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 0,
  },
  sessionPrefix: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  sessionUnpaidAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.accent,
  },
  sessionSlash: {
    fontSize: 12,
    fontWeight: '500',
    color: Theme.textSecondary,
  },
  sessionRegistrationAmount: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  sessionRegistrationOnly: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  batchPrefix: {
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  batchUnpaidAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.accent,
  },
  batchSlash: {
    fontSize: 10,
    fontWeight: '500',
    color: Theme.textSecondary,
  },
  batchRegistrationAmount: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  batchRegistrationOnly: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
});
