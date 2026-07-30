import { StyleSheet, Text, View } from 'react-native';
import { Radius, Theme } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { ShuffleResultCards } from './ShuffleResultCards';
import type { Friend } from '../../types';
import type { ShuffleTeamAssignment } from '../../utils/shuffleHelpers';

type ShuffleTeamResultsProps = {
  teams: ShuffleTeamAssignment[];
  friendsById: Map<string, Friend>;
  myselfId?: string | null;
};

export function ShuffleTeamResults({
  teams,
  friendsById,
  myselfId = null,
}: ShuffleTeamResultsProps) {
  const content = useContentColors();

  if (teams.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {teams.map((team) => (
        <View key={team.teamName} style={[styles.teamBlock, contentSurfaceStyle(content)]}>
          <View style={styles.teamHeader}>
            <Text style={[styles.teamTitle, contentTextStyle(content)]}>{team.teamName}</Text>
            <Text style={styles.teamCount}>{team.memberIds.length}人</Text>
          </View>
          {team.memberIds.length > 0 ? (
            <ShuffleResultCards
              memberIds={team.memberIds}
              friendsById={friendsById}
              myselfId={myselfId}
            />
          ) : (
            <Text style={[styles.emptyTeamText, contentMutedTextStyle(content)]}>メンバーなし</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  teamBlock: {
    gap: 10,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
  },
  teamTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  teamCount: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.accent,
    flexShrink: 0,
  },
  emptyTeamText: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
