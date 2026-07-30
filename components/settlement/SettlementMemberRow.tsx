import { StyleSheet, Text, View } from 'react-native';
import { Theme, Radius } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import { contentMutedTextStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
import type { MockFollowRelation, MockSettlementMember } from '@/types/settlementMock';
import { MOCK_FOLLOW_RELATION_LABELS } from '@/utils/settlementMockHelpers';

type SettlementMemberRowProps = {
  member: MockSettlementMember;
  followRelation?: MockFollowRelation;
  isSelf?: boolean;
};

export function SettlementMemberRow({ member, followRelation, isSelf }: SettlementMemberRowProps) {
  const content = useContentColors();
  const statusLabel = isSelf
    ? '自分（台帳反映済）'
    : member.ledgerSynced
      ? '台帳自動反映'
      : '台帳未反映（通知済）';

  const statusStyle = isSelf
    ? styles.badgeSelf
    : member.ledgerSynced
      ? styles.badgeSynced
      : styles.badgePending;

  return (
    <View style={styles.row}>
      <View style={styles.nameCol}>
        <Text style={[styles.name, contentTextStyle(content)]} numberOfLines={1}>
          {member.displayName}
        </Text>
        {followRelation ? (
          <Text style={[styles.relation, contentMutedTextStyle(content)]}>
            {MOCK_FOLLOW_RELATION_LABELS[followRelation]}
          </Text>
        ) : isSelf ? (
          <Text style={[styles.relation, contentMutedTextStyle(content)]}>割り勘計算に含む</Text>
        ) : (
          <Text style={[styles.relation, contentMutedTextStyle(content)]}>割り勘計算に含む</Text>
        )}
      </View>
      <View style={[styles.badge, statusStyle]}>
        <Text style={[styles.badgeText, contentTextStyle(content)]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 6,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
  relation: {
    fontSize: 11,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeSelf: {
    backgroundColor: Theme.accentLight,
  },
  badgeSynced: {
    backgroundColor: '#E8F4EA',
  },
  badgePending: {
    backgroundColor: '#FFF3D6',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
