import { StyleSheet, Text, View } from 'react-native';
import { Radius, Theme } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import { contentSurfaceStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
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
        <View key={`${assignment.roleName}-${index}`} style={[styles.roleBlock, contentSurfaceStyle(content)]}>
          <View style={styles.roleHeader}>
            <Text style={[styles.roleTitle, contentTextStyle(content)]}>{assignment.roleName}</Text>
            <Text style={styles.roleCount}>{assignment.memberIds.length}人</Text>
          </View>
          <ShuffleResultCards
            memberIds={assignment.memberIds}
            friendsById={friendsById}
            myselfId={myselfId}
          />
        </View>
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
    borderWidth: 1,
    borderRadius: Radius.md,
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
