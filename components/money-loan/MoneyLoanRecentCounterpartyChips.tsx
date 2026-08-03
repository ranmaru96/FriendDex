import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { useMoneyLoanFormStyles } from '@/components/money-loan/moneyLoanFormStyles';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';

type MoneyLoanRecentCounterpartyChipsProps = {
  friendIds: string[];
  selectedFriendIds: Set<string>;
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  onAdd: (friendId: string) => void;
};

export function MoneyLoanRecentCounterpartyChips({
  friendIds,
  selectedFriendIds,
  friendNameById,
  friendPhotoById,
  onAdd,
}: MoneyLoanRecentCounterpartyChipsProps) {
  const formStyles = useMoneyLoanFormStyles();
  const addableFriendIds = useMemo(
    () => friendIds.filter((friendId) => !selectedFriendIds.has(friendId)),
    [friendIds, selectedFriendIds]
  );

  const chips = useMemo(
    () =>
      buildParticipantChipDisplays(
        addableFriendIds.map((friendId) => ({ kind: 'individual' as const, value: friendId })),
        friendNameById,
        { friendPhotoById }
      ),
    [addableFriendIds, friendNameById, friendPhotoById]
  );

  if (chips.length === 0) {
    return null;
  }

  return (
    <View style={formStyles.recentCounterpartySection}>
      <Text style={formStyles.recentCounterpartyLabel}>最近の相手</Text>
      <ParticipantChipList
        chips={chips}
        compact
        layout="scroll"
        onChipPress={(chip) => {
          if (chip.friendId) {
            onAdd(chip.friendId);
          }
        }}
      />
    </View>
  );
}
