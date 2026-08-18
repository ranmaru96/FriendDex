import { StyleSheet, Text, View } from 'react-native';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { Theme } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import { contentTextStyle } from '@/utils/contentStyleHelpers';
import { ShuffleResultCards } from './ShuffleResultCards';
import type { Friend } from '../../types';
import type { ShuffleRoleAssignment } from '../../utils/shuffleHelpers';

type ShuffleRoleResultsProps = {
  assignments: ShuffleRoleAssignment[];
  friendsById: Map<string, Friend>;
  myselfId?: string | null;
};

export function ShuffleRoleResults({
  assignments,
  friendsById,
  myselfId = null,
}: ShuffleRoleResultsProps) {
  const content = useContentColors();

  if (assignments.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {assignments.map((assignment, index) => (
        <OffsetCard key={`${assignment.roleName}-${index}`} brackets contentStyle={styles.roleBlock}>
          <View style={styles.roleHeader}>
            <Text style={[styles.roleTitle, contentTextStyle(content)]}>{assignment.roleName}</Text>
            <Text style={styles.roleCount}>{assignment.memberIds.length}人</Text>
          </View>
          <ShuffleResultCards
            memberIds={assignment.memberIds}
            friendsById={friendsById}
            myselfId={myselfId}
          />
        </OffsetCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  roleBlock: {
    gap: 10,
    padding: 10,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
  },
  roleTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  roleCount: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.accent,
    flexShrink: 0,
  },
});
