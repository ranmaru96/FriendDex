import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  FRIEND_HOME_CARD_GAP,
  FRIEND_HOME_CARD_NAME_FONT_SIZE,
  FriendHomeCard,
} from '@/components/friend/FriendHomeCard';
import { PersonGlanceModal } from '@/components/friend/PersonGlanceModal';
import {
  SHUFFLE_RESULT_COLUMNS_DEFAULT,
  clampShuffleResultColumns,
} from '@/utils/shuffleSession';
import type { Friend } from '../../types';

const MIN_SHUFFLE_NAME_FONT_SIZE = 8;

type ShuffleResultCardsProps = {
  memberIds: string[];
  friendsById: Map<string, Friend>;
  myselfId?: string | null;
  columns?: number;
};

export function ShuffleResultCards({
  memberIds,
  friendsById,
  myselfId = null,
  columns = SHUFFLE_RESULT_COLUMNS_DEFAULT,
}: ShuffleResultCardsProps) {
  const [gridWidth, setGridWidth] = useState(0);
  const [glanceFriend, setGlanceFriend] = useState<Friend | null>(null);
  const columnCount = clampShuffleResultColumns(columns);

  const friends = useMemo(
    () =>
      memberIds
        .map((memberId) => friendsById.get(memberId))
        .filter((friend): friend is Friend => Boolean(friend)),
    [friendsById, memberIds]
  );

  const { cardWidth, nameFontSize } = useMemo(() => {
    if (gridWidth <= 0) {
      return { cardWidth: 0, nameFontSize: FRIEND_HOME_CARD_NAME_FONT_SIZE };
    }
    const width = (gridWidth - FRIEND_HOME_CARD_GAP * (columnCount - 1)) / columnCount;
    const threeColWidth = (gridWidth - FRIEND_HOME_CARD_GAP * 2) / 3;
    const scale = threeColWidth > 0 ? width / threeColWidth : 1;
    return {
      cardWidth: width,
      nameFontSize: Math.max(MIN_SHUFFLE_NAME_FONT_SIZE, FRIEND_HOME_CARD_NAME_FONT_SIZE * scale),
    };
  }, [columnCount, gridWidth]);

  if (friends.length === 0) {
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
        {cardWidth > 0
          ? friends.map((friend) => (
              <FriendHomeCard
                key={friend.id}
                friend={friend}
                width={cardWidth}
                nameFontSize={nameFontSize}
                isMyself={myselfId === friend.id}
                onPress={() => setGlanceFriend(friend)}
              />
            ))
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
    gap: FRIEND_HOME_CARD_GAP,
  },
});
