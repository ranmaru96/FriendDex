import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Radius } from '@/constants/theme';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { Option } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import type { Friend } from '@/types';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';
import { memberIdsToParticipantEntries } from '@/utils/shuffleHelpers';
import {
  contentMutedTextStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const EMPTY_GROUP_VALUES = new Set<string>();

function uniqueSortedOptions(values: string[]): Option[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map((value) => ({ label: value, value }));
}

function optionsFromFriends(friends: Friend[]): {
  affiliationOptions: Option[];
  experienceOptions: Option[];
} {
  const affiliations: string[] = [];
  const experiences: string[] = [];
  friends.forEach((friend) => {
    (friend.affiliations ?? []).forEach((value) => affiliations.push(value));
    (friend.experiences ?? []).forEach((value) => experiences.push(value));
  });
  return {
    affiliationOptions: uniqueSortedOptions(affiliations),
    experienceOptions: uniqueSortedOptions(experiences),
  };
}

export function friendsFromMemberIds(
  memberIds: readonly string[],
  friendsById: Map<string, Friend>
): Friend[] {
  const next: Friend[] = [];
  memberIds.forEach((memberId) => {
    const friend = friendsById.get(memberId);
    if (friend) {
      next.push(friend);
    }
  });
  return next;
}

type ShufflePoolMemberPickerProps = {
  buttonLabel: string;
  eligibleFriends: Friend[];
  selectedMemberIds: readonly string[];
  onChange: (memberIds: string[]) => void;
  /** ボタンを役割名などと同じ行に置く */
  inlineLeading?: ReactNode;
  inlineTrailing?: ReactNode;
};

export function ShufflePoolMemberPicker({
  buttonLabel,
  eligibleFriends,
  selectedMemberIds,
  onChange,
  inlineLeading,
  inlineTrailing,
}: ShufflePoolMemberPickerProps) {
  const content = useContentColors();
  const [visible, setVisible] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [nameFilter, setNameFilter] = useState('');
  const [affiliationFilter, setAffiliationFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('');
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());

  const { affiliationOptions, experienceOptions } = useMemo(
    () => optionsFromFriends(eligibleFriends),
    [eligibleFriends]
  );

  const friendNameById = useMemo(
    () => new Map(eligibleFriends.map((friend) => [friend.id, friend.name])),
    [eligibleFriends]
  );
  const friendPhotoById = useMemo(
    () => new Map(eligibleFriends.map((friend) => [friend.id, friend.photoUri ?? null])),
    [eligibleFriends]
  );

  const selectedChips = useMemo(
    () =>
      buildParticipantChipDisplays(
        memberIdsToParticipantEntries([...selectedMemberIds]),
        friendNameById,
        { friendPhotoById }
      ),
    [friendNameById, friendPhotoById, selectedMemberIds]
  );

  const resetFilters = useCallback(() => {
    setNameFilter('');
    setAffiliationFilter('');
    setExperienceFilter('');
    setSelectorTab('individual');
  }, []);

  const openPicker = useCallback(() => {
    setDraftIds(new Set(selectedMemberIds));
    resetFilters();
    setVisible(true);
  }, [resetFilters, selectedMemberIds]);

  const closePicker = useCallback(() => {
    setVisible(false);
    resetFilters();
  }, [resetFilters]);

  const confirmPicker = useCallback(() => {
    onChange(Array.from(draftIds));
    closePicker();
  }, [closePicker, draftIds, onChange]);

  const toggleDraft = useCallback((friendId: string) => {
    setDraftIds((current) => {
      const next = new Set(current);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  }, []);

  const removeSelected = useCallback(
    (memberId: string) => {
      onChange(selectedMemberIds.filter((id) => id !== memberId));
    },
    [onChange, selectedMemberIds]
  );

  const inline = inlineLeading != null || inlineTrailing != null;
  const button = (
    <Pressable
      style={[
        styles.button,
        inline ? styles.buttonInline : styles.buttonStretch,
        contentTagStyle(content),
        styles.buttonShadow,
      ]}
      onPress={openPicker}
      accessibilityRole="button"
      accessibilityLabel={buttonLabel}
    >
      <Text style={[styles.buttonText, contentTextStyle(content)]}>{buttonLabel}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {inline ? (
        <View style={styles.inlineRow}>
          <View style={styles.inlineLeading}>{inlineLeading}</View>
          <View style={styles.inlineActions}>
            {button}
            {inlineTrailing}
          </View>
        </View>
      ) : (
        button
      )}

      {selectedChips.length > 0 ? (
        <>
          <ParticipantChipList
            chips={selectedChips}
            compact
            layout="wrap"
            onChipPress={(chip) => {
              if (chip.friendId) {
                removeSelected(chip.friendId);
              }
            }}
          />
          <Text style={[styles.hint, contentMutedTextStyle(content)]}>タップで外す</Text>
        </>
      ) : null}

      <EntrySelectorModal
        visible={visible}
        selectorTab={selectorTab}
        onTabChange={setSelectorTab}
        nameFilter={nameFilter}
        onNameFilterChange={setNameFilter}
        affiliationFilter={affiliationFilter}
        onAffiliationFilterChange={setAffiliationFilter}
        experienceFilter={experienceFilter}
        onExperienceFilterChange={setExperienceFilter}
        friends={eligibleFriends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={[]}
        selectedIndividualIds={draftIds}
        selectedGroupValues={EMPTY_GROUP_VALUES}
        onToggleIndividual={toggleDraft}
        onToggleGroup={() => undefined}
        onCancel={closePicker}
        onConfirm={confirmPicker}
        enableGroupTab={false}
        allowCreate={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    overflow: 'visible',
  },
  button: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonStretch: {
    alignSelf: 'stretch',
  },
  buttonInline: {
    flexShrink: 0,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  hint: {
    fontSize: 11,
    lineHeight: 15,
  },
});
