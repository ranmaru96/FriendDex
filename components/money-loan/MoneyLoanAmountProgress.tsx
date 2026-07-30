import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '@/constants/theme';
import { contentMutedTextStyle } from '@/utils/contentStyleHelpers';
import { formatYen } from '@/utils/moneyLoanHelpers';
import { useContentColors } from '@/utils/useContentColors';

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
  const content = useContentColors();
  const muted = contentMutedTextStyle(content);
  const isBatch = size === 'batch';

  if (registrationTotalAmount <= 0) {
    if (unpaidAmount <= 0) {
      return null;
    }
    return (
      <Text style={[isBatch ? styles.batchUnpaidAmount : styles.sessionUnpaidAmount]}>
        {formatYen(unpaidAmount)}
      </Text>
    );
  }

  if (settled || unpaidAmount <= 0) {
    return (
      <Text style={[isBatch ? styles.batchRegistrationOnly : styles.sessionRegistrationOnly, muted]}>
        {formatYen(registrationTotalAmount)}
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={[isBatch ? styles.batchPrefix : styles.sessionPrefix, muted]}>未返済 </Text>
      <Text style={isBatch ? styles.batchUnpaidAmount : styles.sessionUnpaidAmount}>
        {formatYen(unpaidAmount)}
      </Text>
      <Text style={[isBatch ? styles.batchSlash : styles.sessionSlash, muted]}>/</Text>
      <Text style={[isBatch ? styles.batchRegistrationAmount : styles.sessionRegistrationAmount, muted]}>
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
  },
  sessionUnpaidAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.accent,
  },
  sessionSlash: {
    fontSize: 12,
    fontWeight: '500',
  },
  sessionRegistrationAmount: {
    fontSize: 12,
    fontWeight: '600',
  },
  sessionRegistrationOnly: {
    fontSize: 13,
    fontWeight: '600',
  },
  batchPrefix: {
    fontSize: 10,
    fontWeight: '600',
  },
  batchUnpaidAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: Theme.accent,
  },
  batchSlash: {
    fontSize: 10,
    fontWeight: '500',
  },
  batchRegistrationAmount: {
    fontSize: 11,
    fontWeight: '600',
  },
  batchRegistrationOnly: {
    fontSize: 11,
    fontWeight: '600',
  },
});
