import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Radius, Theme, Typography } from '@/constants/theme';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import { getEvent } from '@/db';
import {
  formatEpisodeEventMatchLabel,
  type EventLinkTimeScope,
} from '@/utils/eventEpisodeSync';
import type { EpisodeEventLinkMode } from '@/hooks/useEpisodeForm';
import { EpisodeEventPickModal } from '@/components/episode/EpisodeEventPickModal';

type EpisodeEventLinkFieldProps = {
  dateKey: string;
  mode: EpisodeEventLinkMode;
  linkedEventId: string | null;
  onModeChange: (mode: EpisodeEventLinkMode) => void;
  onSelectEvent: (eventId: string) => void;
  fieldCorner?: StyleProp<ViewStyle>;
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

/** Right-side content only — wrap with FormRow label="対応する予定". */
export function EpisodeEventLinkField({
  dateKey,
  mode,
  linkedEventId,
  onModeChange,
  onSelectEvent,
  fieldCorner,
  hints,
  eventTimeScope = 'pastOrToday',
}: EpisodeEventLinkFieldProps) {
  const content = useContentColors();
  const [pickVisible, setPickVisible] = useState(false);
  const createNewHint = hints?.create_new ?? DEFAULT_HINTS.create_new;
  const noneHint = hints?.none ?? DEFAULT_HINTS.none;

  const selectedLabel = useMemo(() => {
    const id = linkedEventId?.trim();
    if (!id) {
      return null;
    }
    const event = getEvent(id);
    if (!event) {
      return '選択中の予定';
    }
    const labelDate = dateKey.trim() || event.startAt.slice(0, 10);
    return formatEpisodeEventMatchLabel(event, labelDate);
  }, [linkedEventId, dateKey]);

  const openPick = () => {
    dismissKeyboardFocus();
    setPickVisible(true);
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
      <View style={styles.modeRow}>
        {MODE_OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <Pressable
              key={option.value}
              style={[
                styles.modeChip,
                fieldCorner,
                contentInputStyle(content),
                selected ? contentSelectedOptionStyle(content) : null,
              ]}
              onPress={() => handleModePress(option.value)}
            >
              <Text style={[styles.modeChipText, contentTextStyle(content)]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'create_new' ? (
        <Text style={[styles.hint, contentMutedTextStyle(content)]}>{createNewHint}</Text>
      ) : null}

      {mode === 'none' ? (
        <Text style={[styles.hint, contentMutedTextStyle(content)]}>{noneHint}</Text>
      ) : null}

      {mode === 'existing' ? (
        selectedLabel ? (
          <Pressable
            style={[styles.selectedCard, fieldCorner, contentSurfaceStyle(content)]}
            onPress={openPick}
          >
            <Text style={[styles.selectedValue, contentTextStyle(content)]}>{selectedLabel}</Text>
            <Text style={[styles.changeHint, contentMutedTextStyle(content)]}>タップして変更</Text>
          </Pressable>
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
        onSelect={onSelectEvent}
        onClose={() => setPickVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 8,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeChip: {
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modeChipText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Theme.textPrimary,
  },
  hint: {
    fontSize: Typography.sm,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  selectedCard: {
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.md,
    padding: 10,
  },
  selectedValue: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  changeHint: {
    marginTop: 6,
    fontSize: 11,
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
