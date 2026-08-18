import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Spacing } from '@/constants/theme';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import type { MockSettlementRoom } from '@/types/settlementMock';

type SettlementGroupCardProps = {
  room: MockSettlementRoom;
  onPress: () => void;
  settled?: boolean;
};

export function SettlementGroupCard({ room, onPress, settled = false }: SettlementGroupCardProps) {
  const content = useContentColors();
  const memberCount = room.members.length;
  const ledgerPendingCount = room.members.filter((member) => !member.ledgerSynced).length;
  const expenseTotal = room.expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <OffsetCard brackets>
      <Pressable
        style={[styles.card, settled && styles.cardSettled]}
        onPress={onPress}
      >
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            contentTextStyle(content),
            settled && contentMutedTextStyle(content),
          ]}
          numberOfLines={1}
        >
          {room.title}
        </Text>
        <Text style={[styles.chevron, contentMutedTextStyle(content)]}>›</Text>
      </View>
      <Text style={[styles.meta, contentMutedTextStyle(content)]}>
        メンバー {memberCount}人（計算込み）
        {ledgerPendingCount > 0 ? ` · 台帳未反映 ${ledgerPendingCount}` : ''}
        {room.expenses.length > 0 ? ` · 支出 ${room.expenses.length}件` : ''}
        {settled ? ' · 清算済み' : ''}
      </Text>
      {expenseTotal > 0 ? (
        <Text
          style={[
            styles.total,
            contentTextStyle(content),
            settled && contentMutedTextStyle(content),
          ]}
        >
          {expenseTotal.toLocaleString('ja-JP')}円
        </Text>
      ) : (
        <Text style={[styles.emptyHint, contentMutedTextStyle(content)]}>支出はまだありません</Text>
      )}
    </Pressable>
    </OffsetCard>
  );
}

const styles = StyleSheet.create({
  card: {
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
  },
  chevron: {
    fontSize: 20,
  },
  meta: {
    fontSize: 12,
  },
  total: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  emptyHint: {
    fontSize: 12,
    marginTop: 2,
  },
});
