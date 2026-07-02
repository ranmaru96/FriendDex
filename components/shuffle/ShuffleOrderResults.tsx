import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radius, Theme } from '@/constants/theme';
import { ParticipantChip } from '@/components/participant/ParticipantChip';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';

type ShuffleOrderResultsProps = {
  memberIds: string[];
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
};

export function ShuffleOrderResults({
  memberIds,
  friendNameById,
  friendPhotoById,
}: ShuffleOrderResultsProps) {
  const chips = useMemo(
    () =>
      buildParticipantChipDisplays(
        memberIds.map((memberId) => ({ kind: 'individual' as const, value: memberId })),
        friendNameById,
        { friendPhotoById }
      ),
    [friendNameById, friendPhotoById, memberIds]
  );

  if (chips.length === 0) {
    return null;
  }

  return (
    <View style={styles.list}>
      {chips.map((chip, index) => (
        <View key={chip.id} style={styles.row}>
          <Text style={styles.rank}>{index + 1}</Text>
          <ParticipantChip chip={chip} compact />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.card,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  rank: {
    width: 22,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: Theme.accent,
  },
});
