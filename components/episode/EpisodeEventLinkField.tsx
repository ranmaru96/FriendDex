import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Radius, Theme, Typography } from '@/constants/theme';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import { getEvent } from '@/db';
import { getEventCalendarColor } from '@/utils/calendarEventColors';
import type { EventLinkTimeScope } from '@/utils/eventEpisodeSync';
import type { EpisodeEventLinkMode } from '@/hooks/useEpisodeForm';
import { EpisodeEventPickModal } from '@/components/episode/EpisodeEventPickModal';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';

type EpisodeEventLinkFieldProps = {
  dateKey: string;
  mode: EpisodeEventLinkMode;
  linkedEventId: string | null;
  onModeChange: (mode: EpisodeEventLinkMode) => void;
  onSelectEvent: (eventId: string) => void;
  fieldCorner?: StyleProp<ViewStyle>;
  /** 選択バーの縦幅を約8割にする */
  compact?: boolean;
  /** Override default mode hints (episode copy). */
  hints?: Partial<Record<'create_new' | 'none', string>>;
  eventTimeScope?: EventLinkTimeScope;
};

const MODE_OPTIONS: { value: EpisodeEventLinkMode; label: string }[] = [
  { value: 'existing', label: '既存予定' },
  { value: 'create_new', label: '新規作成' },
  { value: 'none', label: '予定なし' },
];

const DEFAULT_HINTS: Record<'create_new' | 'none', string> = {
  create_new: '保存時に、このエピソードと同じ日付・参加者の予定を新しく作ります。',
  none: 'カレンダー予定には紐づけません（日記など）。',
};

/** Right-side content only. The parent FormRow supplies the label. */
export function EpisodeEventLinkField({
  dateKey,
  mode,
  linkedEventId,
  onModeChange,
  onSelectEvent,
  fieldCorner,
  compact = false,
  hints,
  eventTimeScope = 'pastOrToday',
}: EpisodeEventLinkFieldProps) {
  const content = useContentColors();
  const [pickVisible, setPickVisible] = useState(false);
  const pickedInSessionRef = useRef(false);
  const createNewHint = hints?.create_new ?? DEFAULT_HINTS.create_new;
  const noneHint = hints?.none ?? DEFAULT_HINTS.none;

  const selectedEvent = useMemo(() => {
    const id = linkedEventId?.trim();
    if (!id) {
      return null;
    }
    return getEvent(id);
  }, [linkedEventId]);
  const selectedEventTitle = selectedEvent?.title.trim() || (linkedEventId?.trim() ? '選択中の予定' : '');

  const openPick = () => {
    dismissKeyboardFocus();
    pickedInSessionRef.current = false;
    setPickVisible(true);
  };

  const handlePick = (eventId: string) => {
    pickedInSessionRef.current = true;
    onSelectEvent(eventId);
  };

  const handlePickClose = () => {
    setPickVisible(false);
    if (!pickedInSessionRef.current && !linkedEventId?.trim()) {
      onModeChange('none');
    }
    pickedInSessionRef.current = false;
  };

  const handleModePress = (next: EpisodeEventLinkMode) => {
    if (next === 'existing') {
      onModeChange('existing');
      openPick();
      return;
    }
    onModeChange(next);
  };

  return (
    <View style={styles.wrap}>
      <SlidingSegmentedControl
        options={MODE_OPTIONS}
        value={mode}
        onChange={handleModePress}
        compact={compact}
      />

      {mode === 'create_new' ? (
        <Text style={[styles.hint, contentMutedTextStyle(content)]}>{createNewHint}</Text>
      ) : null}

      {mode === 'none' ? (
        <Text style={[styles.hint, contentMutedTextStyle(content)]}>{noneHint}</Text>
      ) : null}

      {mode === 'existing' ? (
        selectedEventTitle ? (
          <View style={styles.selectedRow}>
            <View
              style={[
                styles.eventChip,
                { backgroundColor: getEventCalendarColor(selectedEvent?.episodeTag) },
              ]}
            >
              <Text style={styles.eventChipText} numberOfLines={1}>
                {selectedEventTitle}
              </Text>
            </View>
            <Pressable
              style={[styles.changeButton, fieldCorner, contentInputStyle(content)]}
              onPress={openPick}
              accessibilityRole="button"
              accessibilityLabel="予定を変更"
            >
              <Text style={[styles.changeButtonText, contentTextStyle(content)]}>変更</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.pickButton, fieldCorner, contentInputStyle(content)]}
            onPress={openPick}
          >
            <Text style={[styles.pickButtonText, contentTextStyle(content)]}>予定を選択</Text>
          </Pressable>
        )
      ) : null}

      <EpisodeEventPickModal
        visible={pickVisible}
        dateKey={dateKey}
        selectedEventId={linkedEventId}
        timeScope={eventTimeScope}
        onSelect={handlePick}
        onClose={handlePickClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 8,
  },
  hint: {
    fontSize: Typography.sm,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventChip: {
    flexShrink: 1,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 2,
    justifyContent: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  eventChipText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    color: '#ffffff',
  },
  changeButton: {
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  changeButtonText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  pickButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickButtonText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
});
