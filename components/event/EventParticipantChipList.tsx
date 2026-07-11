import type { EventParticipantDisplay } from '@/utils/eventParticipantHelpers';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';

type EventParticipantChipListProps = {
  participants: EventParticipantDisplay[];
  compact?: boolean;
  layout?: 'scroll' | 'wrap';
  onPressProfile?: (friendId: string) => void;
  onRemoveProfile?: (profileId: string) => void;
};

export function EventParticipantChipList({
  participants,
  compact = false,
  layout = 'scroll',
  onPressProfile,
  onRemoveProfile,
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
    />
  );
}
