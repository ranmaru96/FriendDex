import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FRIEND_HOME_CARD_GAP, FriendHomeCard } from '@/components/friend/FriendHomeCard';
import { PersonGlanceModal } from '@/components/friend/PersonGlanceModal';
import type { Friend } from '../../types';

type ShuffleResultCardsProps = {
  memberIds: string[];
  friendsById: Map<string, Friend>;
  myselfId?: string | null;
};

export function ShuffleResultCards({
  memberIds,
  friendsById,
  myselfId = null,
}: ShuffleResultCardsProps) {
  const [gridWidth, setGridWidth] = useState(0);
  const [glanceFriend, setGlanceFriend] = useState<Friend | null>(null);

  const friends = useMemo(
    () =>
      memberIds
        .map((memberId) => friendsById.get(memberId))
        .filter((friend): friend is Friend => Boolean(friend)),
    [friendsById, memberIds]
  );

  const cardWidth = useMemo(() => {
    if (gridWidth <= 0) {
      return 0;
    }
    return (gridWidth - FRIEND_HOME_CARD_GAP * 2) / 3;
  }, [gridWidth]);

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
