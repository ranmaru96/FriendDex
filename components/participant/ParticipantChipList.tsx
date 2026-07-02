import { ScrollView, View } from 'react-native';
import { participantChipStyles as styles } from '@/utils/participantChipStyles';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';
import { ParticipantChip } from './ParticipantChip';

type ParticipantChipListProps = {
  chips: ParticipantChipDisplay[];
  compact?: boolean;
  layout?: 'scroll' | 'wrap';
  onPressProfile?: (friendId: string) => void;
  onChipPress?: (chip: ParticipantChipDisplay) => void;
  onRemoveChip?: (chipId: string) => void;
};

export function ParticipantChipList({
  chips,
  compact = false,
  layout = 'scroll',
  onPressProfile,
  onChipPress,
  onRemoveChip,
}: ParticipantChipListProps) {
  if (chips.length === 0) {
    return null;
  }

  const renderChip = (chip: ParticipantChipDisplay) => (
    <ParticipantChip
      key={chip.id}
      chip={chip}
      compact={compact}
      onPress={
        onChipPress
          ? () => onChipPress(chip)
          : chip.kind === 'individual' && chip.friendId && onPressProfile
            ? () => onPressProfile(chip.friendId!)
            : undefined
      }
      onRemove={onRemoveChip ? () => onRemoveChip(chip.id) : undefined}
    />
  );

  if (layout === 'wrap') {
    return <View style={styles.wrap}>{chips.map(renderChip)}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      {chips.map(renderChip)}
    </ScrollView>
  );
}
