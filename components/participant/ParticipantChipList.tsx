import { ScrollView, View } from 'react-native';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { participantChipStyles as styles } from '@/utils/participantChipStyles';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';
import { ParticipantChip } from './ParticipantChip';

type ParticipantChipListProps = {
  chips: ParticipantChipDisplay[];
  compact?: boolean;
  layout?: 'scroll' | 'wrap';
  chipBackgroundColor?: string;
  chipStyle?: 'default' | 'fitted';
  onPressProfile?: (friendId: string) => void;
  onChipPress?: (chip: ParticipantChipDisplay) => void;
  onRemoveChip?: (chipId: string) => void;
};

export function ParticipantChipList({
  chips,
  compact = false,
  layout = 'scroll',
  chipBackgroundColor,
  chipStyle,
  onPressProfile,
  onChipPress,
  onRemoveChip,
}: ParticipantChipListProps) {
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const resolvedChipStyle = chipStyle ?? kit.participantChipStyle;
  const resolvedChipBackground = chipBackgroundColor
    ?? (isMonochromeAppTheme(appTheme?.variant) ? undefined : kit.participantChipBackground);

  if (chips.length === 0) {
    return null;
  }

  const renderChip = (chip: ParticipantChipDisplay) => (
    <ParticipantChip
      key={chip.id}
      chip={chip}
      compact={compact}
      chipBackgroundColor={resolvedChipBackground}
      chipStyle={resolvedChipStyle}
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
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      {chips.map(renderChip)}
    </ScrollView>
  );
}
