import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Radius } from '@/constants/theme';
import { formatYen } from '@/utils/moneyLoanHelpers';
import type { SettlementTransferDisplay } from '@/utils/settlementTransferHelpers';

type SettlementTransferRowProps = {
  transfer: SettlementTransferDisplay;
  isCompleted: boolean;
  onToggle: () => void;
};

export function SettlementTransferRow({ transfer, isCompleted, onToggle }: SettlementTransferRowProps) {
  return (
    <Pressable style={styles.row} onPress={onToggle}>
      <View style={[styles.check, isCompleted && styles.checkCompleted]}>
        <Text style={[styles.checkText, isCompleted && styles.checkTextCompleted]}>済</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.line, isCompleted && styles.lineCompleted]}>
          {transfer.fromName} → {transfer.toName} : {formatYen(transfer.amount)}
        </Text>
        <Text style={styles.status}>{isCompleted ? '完了' : '未完了'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Theme.searchFieldBorder,
    backgroundColor: Theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCompleted: {
    borderColor: Theme.accent,
    backgroundColor: Theme.accentLight,
  },
  checkText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  checkTextCompleted: {
    color: Theme.accent,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  line: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  lineCompleted: {
    color: Theme.textSecondary,
    textDecorationLine: 'line-through',
  },
  status: {
    fontSize: 11,
    color: Theme.textMuted,
  },
});
