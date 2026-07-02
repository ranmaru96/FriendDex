import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radius, Theme } from '@/constants/theme';
import { ParticipantChip } from '@/components/participant/ParticipantChip';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';

const COLUMN_GAP = 6;

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
  const [gridWidth, setGridWidth] = useState(0);

  const chips = useMemo(
    () =>
      buildParticipantChipDisplays(
        memberIds.map((memberId) => ({ kind: 'individual' as const, value: memberId })),
        friendNameById,
        { friendPhotoById }
      ),
    [friendNameById, friendPhotoById, memberIds]
  );

  const columnWidth = gridWidth > 0 ? (gridWidth - COLUMN_GAP) / 2 : 0;

  if (chips.length === 0) {
    return null;
  }

  return (
    <View
      style={styles.grid}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > 0 && nextWidth !== gridWidth) {
          setGridWidth(nextWidth);
        }
      }}
    >
      {columnWidth > 0
        ? chips.map((chip, index) => (
            <View key={chip.id} style={[styles.cell, { width: columnWidth }]}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.chipWrap}>
                <ParticipantChip chip={chip} compact />
              </View>
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: COLUMN_GAP,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.card,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  rank: {
    width: 18,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: Theme.accent,
    flexShrink: 0,
  },
  chipWrap: {
    flex: 1,
    minWidth: 0,
  },
});
