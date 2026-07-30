import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Radius, Spacing } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import type { MockSettlementInvite } from '@/types/settlementMock';

type SettlementInviteCardProps = {
  invite: MockSettlementInvite;
  onAccept: () => void;
  onDecline: () => void;
};

export function SettlementInviteCard({ invite, onAccept, onDecline }: SettlementInviteCardProps) {
  const content = useContentColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: content.contentCard,
          borderColor: '#E8C96A',
        },
      ]}
    >
      <Text style={[styles.title, contentTextStyle(content)]}>管理台帳への追加</Text>
      <Text style={[styles.body, contentMutedTextStyle(content)]}>
        {invite.fromDisplayName} さんの「{invite.roomTitle}」を、あなたの清算台帳に載せますか？
        （グループの計算にはすでに含まれています）
      </Text>
      <View style={styles.actions}>
        <Pressable style={[styles.declineButton, contentSurfaceStyle(content)]} onPress={onDecline}>
          <Text style={[styles.declineText, contentMutedTextStyle(content)]}>辞退</Text>
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
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
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
  },
  declineText: {
    fontSize: 13,
    fontWeight: '600',
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
