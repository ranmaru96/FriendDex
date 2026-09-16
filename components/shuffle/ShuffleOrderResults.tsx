import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radius } from '@/constants/theme';
import { ParticipantChip } from '@/components/participant/ParticipantChip';
import { PersonGlanceModal } from '@/components/friend/PersonGlanceModal';
import { useContentColors } from '@/utils/useContentColors';
import { contentSurfaceStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';
import type { Friend } from '../../types';

const COLUMN_GAP = 6;

type ShuffleOrderResultsProps = {
  memberIds: string[];
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  friendsById: Map<string, Friend>;
};

export function ShuffleOrderResults({
  memberIds,
  friendNameById,
  friendPhotoById,
  friendsById,
}: ShuffleOrderResultsProps) {
  const content = useContentColors();
  const [gridWidth, setGridWidth] = useState(0);
  const [glanceFriend, setGlanceFriend] = useState<Friend | null>(null);

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
    <>
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
          ? chips.map((chip, index) => {
              const friend = chip.friendId ? friendsById.get(chip.friendId) ?? null : null;
              return (
                <View
                  key={chip.id}
                  style={[styles.cell, contentSurfaceStyle(content), { width: columnWidth }]}
                >
                  <Text style={[styles.rank, contentTextStyle(content)]}>{index + 1}</Text>
                  <View style={styles.chipWrap}>
                    <ParticipantChip
                      chip={chip}
                      compact
                      onPress={friend ? () => setGlanceFriend(friend) : undefined}
                    />
                  </View>
                </View>
              );
            })
          : null}
      </View>
      <PersonGlanceModal
        visible={glanceFriend != null}
        friend={glanceFriend}
        onClose={() => setGlanceFriend(null)}
      />
    </>
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
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  rank: {
    width: 22,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  chipWrap: {
    flex: 1,
    minWidth: 0,
  },
});
