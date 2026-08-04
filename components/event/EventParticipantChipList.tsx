import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';
import type { EventParticipantDisplay } from '@/utils/eventParticipantHelpers';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

type EventParticipantChipListProps = {
  participants: EventParticipantDisplay[];
  compact?: boolean;
  layout?: 'scroll' | 'wrap';
  onPressProfile?: (friendId: string) => void;
  onRemoveProfile?: (profileId: string) => void;
  /** タグタップ時（指定時はプロフィール遷移より優先） */
  onChipPress?: (chip: ParticipantChipDisplay) => void;
  onScrollBeginDrag?: ScrollHandler;
  onScrollEndDrag?: ScrollHandler;
  onMomentumScrollEnd?: ScrollHandler;
};

export function EventParticipantChipList({
  participants,
  compact = false,
  layout = 'scroll',
  onPressProfile,
  onRemoveProfile,
  onChipPress,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollEnd,
}: EventParticipantChipListProps) {
  if (participants.length === 0) {
    return null;
  }

  const chips = participants.map((participant) => ({
    id: participant.profileId,
    kind: 'individual' as const,
    label: participant.name,
    friendId: participant.friendId,
    photoUri: participant.photoUri,
  }));

  return (
    <ParticipantChipList
      chips={chips}
      compact={compact}
      layout={layout}
      onPressProfile={onPressProfile}
      onRemoveChip={onRemoveProfile}
      onChipPress={onChipPress}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
    />
  );
}
