import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Radius, Spacing } from '@/constants/theme';
import type { MockSettlementRoom } from '@/types/settlementMock';

type SettlementGroupCardProps = {
  room: MockSettlementRoom;
  onPress: () => void;
  settled?: boolean;
};

export function SettlementGroupCard({ room, onPress, settled = false }: SettlementGroupCardProps) {
  const memberCount = room.members.length;
  const ledgerPendingCount = room.members.filter((member) => !member.ledgerSynced).length;
  const expenseTotal = room.expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <Pressable style={[styles.card, settled && styles.cardSettled]} onPress={onPress}>
      <View style={styles.header}>
        <Text style={[styles.title, settled && styles.titleSettled]} numberOfLines={1}>
          {room.title}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>
      <Text style={styles.meta}>
        メンバー {memberCount}人（計算込み）
        {ledgerPendingCount > 0 ? ` · 台帳未反映 ${ledgerPendingCount}` : ''}
        {room.expenses.length > 0 ? ` · 支出 ${room.expenses.length}件` : ''}
        {settled ? ' · 清算済み' : ''}
      </Text>
      {expenseTotal > 0 ? (
        <Text style={[styles.total, settled && styles.totalSettled]}>
          {expenseTotal.toLocaleString('ja-JP')}円
        </Text>
      ) : (
        <Text style={styles.emptyHint}>支出はまだありません</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.bgSurface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
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
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  titleSettled: {
    color: Theme.textSecondary,
  },
  chevron: {
    fontSize: 20,
    color: Theme.textSecondary,
  },
  meta: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  total: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textPrimary,
    marginTop: 2,
  },
  totalSettled: {
    color: Theme.textSecondary,
  },
  emptyHint: {
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: 2,
  },
});
