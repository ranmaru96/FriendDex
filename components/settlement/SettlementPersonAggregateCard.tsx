import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Radius, Spacing } from '@/constants/theme';
import type { SettlementPersonAggregate } from '@/utils/settlementPersonAggregates';
import { formatSettlementNetSignedAmount } from '@/utils/settlementPersonAggregates';

type SettlementPersonAggregateCardProps = {
  aggregate: SettlementPersonAggregate;
  isItemCompleted: (key: string) => boolean;
  onToggleItem: (key: string) => void;
  settled?: boolean;
};

export function SettlementPersonAggregateCard({
  aggregate,
  isItemCompleted,
  onToggleItem,
  settled = false,
}: SettlementPersonAggregateCardProps) {
  return (
    <View style={[styles.card, settled && styles.cardSettled]}>
      <View style={styles.header}>
        <Text style={[styles.personName, settled && styles.personNameSettled]} numberOfLines={1}>
          {aggregate.displayName}
        </Text>
        <Text style={[styles.personTotal, settled && styles.personTotalSettled]}>
          {formatSettlementNetSignedAmount(aggregate.netSignedAmount)}
        </Text>
      </View>
      {aggregate.items.length > 1 ? <Text style={styles.breakdownLabel}>内訳</Text> : null}
      {aggregate.items.map((item) => {
        const completed = isItemCompleted(item.key);
        return (
          <Pressable key={item.key} style={styles.breakdownRow} onPress={() => onToggleItem(item.key)}>
            <View style={[styles.check, completed && styles.checkCompleted]}>
              <Text style={[styles.checkText, completed && styles.checkTextCompleted]}>済</Text>
            </View>
            <View style={styles.breakdownBody}>
              <Text style={[styles.breakdownTitle, completed && styles.breakdownTitleCompleted]} numberOfLines={1}>
                {item.roomTitle}
              </Text>
              <Text style={styles.breakdownMeta}>{item.lineLabel}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.bgSurface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
  },
  cardSettled: {
    opacity: 0.72,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  personName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  personNameSettled: {
    color: Theme.textSecondary,
  },
  personTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimary,
    flexShrink: 0,
  },
  personTotalSettled: {
    color: Theme.textSecondary,
  },
  breakdownLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
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
  breakdownBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  breakdownTitleCompleted: {
    color: Theme.textSecondary,
    textDecorationLine: 'line-through',
  },
  breakdownMeta: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
});
