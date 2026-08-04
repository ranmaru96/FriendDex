import type { ReactNode } from 'react';
import {
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { participantChipStyles as styles } from '@/utils/participantChipStyles';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';
import { ParticipantChip } from './ParticipantChip';

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

type ParticipantChipListProps = {
  chips: ParticipantChipDisplay[];
  compact?: boolean;
  layout?: 'scroll' | 'wrap';
  chipBackgroundColor?: string;
  chipStyle?: 'default' | 'fitted';
  /** wrap / scroll 時、タグ列の末尾に並べる（例: 追加ボタン） */
  trailing?: ReactNode;
  onPressProfile?: (friendId: string) => void;
  onChipPress?: (chip: ParticipantChipDisplay) => void;
  onRemoveChip?: (chipId: string) => void;
  onScrollBeginDrag?: ScrollHandler;
  onScrollEndDrag?: ScrollHandler;
  onMomentumScrollEnd?: ScrollHandler;
};

export function ParticipantChipList({
  chips,
  compact = false,
  layout = 'scroll',
  chipBackgroundColor,
  chipStyle,
  trailing,
  onPressProfile,
  onChipPress,
  onRemoveChip,
  onScrollBeginDrag,
  onScrollEndDrag,
  onMomentumScrollEnd,
}: ParticipantChipListProps) {
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const resolvedChipStyle = chipStyle ?? kit.participantChipStyle;
  const resolvedChipBackground = chipBackgroundColor
    ?? (isMonochromeAppTheme(appTheme?.variant) ? undefined : kit.participantChipBackground);

  if (chips.length === 0 && !trailing) {
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
    return (
      <View style={[styles.wrap, trailing ? styles.wrapWithTrailing : null]}>
        {chips.map(renderChip)}
        {trailing}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
    >
      {chips.map(renderChip)}
      {trailing}
    </ScrollView>
  );
}
