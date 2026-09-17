import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ParticipantChip } from '@/components/participant/ParticipantChip';
import { PersonGlanceModal } from '@/components/friend/PersonGlanceModal';
import { useContentColors } from '@/utils/useContentColors';
import { contentTextStyle } from '@/utils/contentStyleHelpers';
import { buildParticipantChipDisplays, type ParticipantChipDisplay } from '@/utils/episodeHelpers';
import type { ShuffleOrderLayout } from '@/utils/shuffleSession';
import type { Friend } from '../../types';

const COLUMN_GAP = 6;

type ShuffleOrderResultsProps = {
  memberIds: string[];
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  friendsById: Map<string, Friend>;
  layout?: ShuffleOrderLayout;
};

type RankedChip = {
  chip: ParticipantChipDisplay;
  rank: number;
};

export function ShuffleOrderResults({
  memberIds,
  friendNameById,
  friendPhotoById,
  friendsById,
  layout = 'wrap',
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

  const rankedChips = useMemo<RankedChip[]>(
    () => chips.map((chip, index) => ({ chip, rank: index + 1 })),
    [chips]
  );

  const splitColumns = useMemo(() => {
    const leftCount = Math.ceil(rankedChips.length / 2);
    return {
      left: rankedChips.slice(0, leftCount),
      right: rankedChips.slice(leftCount),
    };
  }, [rankedChips]);

  const columnWidth = gridWidth > 0 ? (gridWidth - COLUMN_GAP) / 2 : 0;

  const renderRow = (item: RankedChip, width?: number) => {
    const friend = item.chip.friendId ? friendsById.get(item.chip.friendId) ?? null : null;
    return (
      <View key={item.chip.id} style={[styles.row, width != null ? { width } : styles.rowFill]}>
        <Text style={[styles.rank, contentTextStyle(content)]}>{item.rank}</Text>
        <View style={styles.chipWrap}>
          <ParticipantChip
            chip={item.chip}
            compact
            onPress={friend ? () => setGlanceFriend(friend) : undefined}
          />
        </View>
      </View>
    );
  };

  if (rankedChips.length === 0) {
    return null;
  }

  return (
    <>
      {layout === 'split' ? (
        <View style={styles.split}>
          <View style={styles.splitColumn}>{splitColumns.left.map((item) => renderRow(item))}</View>
          <View style={styles.splitColumn}>{splitColumns.right.map((item) => renderRow(item))}</View>
        </View>
      ) : (
        <View
          style={styles.grid}
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width;
            if (nextWidth > 0 && nextWidth !== gridWidth) {
              setGridWidth(nextWidth);
            }
          }}
        >
          {columnWidth > 0 ? rankedChips.map((item) => renderRow(item, columnWidth)) : null}
        </View>
      )}
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
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: COLUMN_GAP,
  },
  splitColumn: {
    flex: 1,
    minWidth: 0,
    gap: COLUMN_GAP,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  rowFill: {
    alignSelf: 'stretch',
  },
  rank: {
    width: 22,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 0,
  },
  chipWrap: {
    flex: 1,
    minWidth: 0,
  },
});
