import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Radius, Spacing } from '@/constants/theme';
import { MoneyLoanAmountProgress } from '@/components/money-loan/MoneyLoanAmountProgress';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';
import {
  formatBatchCardCountLabel,
  formatMoneyLoanDateLabel,
  type MoneyLoanSessionSummary,
} from '@/utils/moneyLoanHelpers';

type MoneyLoanSessionCardProps = {
  summary: MoneyLoanSessionSummary;
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  settled?: boolean;
  showBatchDates?: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

export function MoneyLoanSessionCard({
  summary,
  friendNameById,
  friendPhotoById,
  settled = false,
  showBatchDates = false,
  onPress,
  onLongPress,
}: MoneyLoanSessionCardProps) {
  const sessionMeta = settled
    ? `登録 ${summary.batchCount}件 · 完済`
    : `登録 ${summary.batchCount}件 · 未返済 ${summary.unpaidLoanCount}人 · 返済 ${summary.repaidLoanCount}人`;

  return (
    <Pressable
      style={[styles.sessionCard, settled && styles.sessionCardSettled]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
    >
      <View style={styles.sessionCardHeader}>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {summary.session.title}
        </Text>
        <Text style={styles.sessionEditHint}>編集</Text>
      </View>

      <Text style={styles.sessionMeta}>{sessionMeta}</Text>

      {summary.registrationTotalAmount > 0 ? (
        <MoneyLoanAmountProgress
          registrationTotalAmount={summary.registrationTotalAmount}
          unpaidAmount={summary.unpaidAmount}
          settled={settled}
          size="session"
        />
      ) : null}

      {summary.batches.map((batch) => {
        const unpaidChips = buildParticipantChipDisplays(
          batch.unpaidFriendIds.map((friendId) => ({ kind: 'individual' as const, value: friendId })),
          friendNameById,
          { friendPhotoById }
        );
        const repaidChips = buildParticipantChipDisplays(
          batch.repaidFriendIds.map((friendId) => ({ kind: 'individual' as const, value: friendId })),
          friendNameById,
          { friendPhotoById }
        ).map((chip) => ({ ...chip, label: `${chip.label}(済)` }));

        return (
          <View key={batch.groupId} style={styles.batchBlock}>
            <Text style={styles.batchMeta}>
              {showBatchDates ? `${formatMoneyLoanDateLabel(batch.createdAt)} ` : ''}
              {formatBatchCardCountLabel(batch)}
            </Text>
            {summary.batchCount > 1 && batch.registrationTotalAmount > 0 ? (
              <MoneyLoanAmountProgress
                registrationTotalAmount={batch.registrationTotalAmount}
                unpaidAmount={batch.unpaidAmount}
                settled={settled}
                size="batch"
              />
            ) : null}
            {unpaidChips.length > 0 ? (
              <ParticipantChipList chips={unpaidChips} compact layout="wrap" />
            ) : null}
            {repaidChips.length > 0 ? (
              <View style={styles.repaidChipWrap}>
                <ParticipantChipList chips={repaidChips} compact layout="wrap" />
              </View>
            ) : null}
          </View>
        );
      })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sessionCard: {
    backgroundColor: Theme.bgSurface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 6,
  },
  sessionCardSettled: {
    opacity: 0.85,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sessionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  sessionEditHint: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.accent,
    flexShrink: 0,
  },
  sessionMeta: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
  batchBlock: {
    gap: 4,
    paddingTop: 2,
  },
  batchMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  repaidChipWrap: {
    opacity: 0.65,
  },
});
