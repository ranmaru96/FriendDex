import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Radius, Spacing } from '@/constants/theme';
import type { MockSettlementInvite } from '@/types/settlementMock';

type SettlementInviteCardProps = {
  invite: MockSettlementInvite;
  onAccept: () => void;
  onDecline: () => void;
};

export function SettlementInviteCard({ invite, onAccept, onDecline }: SettlementInviteCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>管理台帳への追加</Text>
      <Text style={styles.body}>
        {invite.fromDisplayName} さんの「{invite.roomTitle}」を、あなたの清算台帳に載せますか？
        （グループの計算にはすでに含まれています）
      </Text>
      <View style={styles.actions}>
        <Pressable style={styles.declineButton} onPress={onDecline}>
          <Text style={styles.declineText}>辞退</Text>
        </Pressable>
        <Pressable style={styles.acceptButton} onPress={onAccept}>
          <Text style={styles.acceptText}>参加</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF8E8',
    borderWidth: 1,
    borderColor: '#E8C96A',
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A6A00',
  },
  body: {
    fontSize: 14,
    color: Theme.textPrimary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  declineButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.card,
  },
  declineText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  acceptButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Theme.accent,
  },
  acceptText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.topBarText,
  },
});
