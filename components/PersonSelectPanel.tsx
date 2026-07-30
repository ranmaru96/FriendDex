import { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { sortFriendsBySelectedId } from '@/utils/selectionSortHelpers';
import type { Option } from '@/components/episode/types';
import { Radius } from '@/constants/theme';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import type { Friend } from '@/types';

const PERSON_COLUMNS = 3;
const PERSON_GAP = 6;
const PANEL_PADDING = 14;

type SelectFieldProps = {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (value: string) => void;
};

function SelectField({ label, value, options, onValueChange }: SelectFieldProps) {
  const content = useContentColors();
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((option) => option.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={styles.fieldContainer}>
      <Pressable style={[styles.selectButton, contentInputStyle(content)]} onPress={() => setVisible(true)}>
        <Text
          style={[
            value ? styles.selectValue : styles.selectPlaceholder,
            value ? contentTextStyle(content) : contentMutedTextStyle(content),
          ]}
        >
          {displayLabel}
        </Text>
        <Text style={[styles.selectChevron, contentMutedTextStyle(content)]}>▼</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.modalTitle, contentTextStyle(content)]}>{label}</Text>
            <ScrollView style={styles.modalOptions}>
              <Pressable
                style={[
                  styles.modalOption,
                  !value
                    ? [{ backgroundColor: content.contentInputBg, borderColor: content.contentText, borderWidth: 1 }]
                    : null,
                ]}
                onPress={() => {
                  onValueChange('');
                  setVisible(false);
                }}
              >
                <Text style={[styles.modalOptionText, contentTextStyle(content)]}>指定なし</Text>
              </Pressable>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.modalOption,
                    option.value === value
                      ? [{ backgroundColor: content.contentInputBg, borderColor: content.contentText, borderWidth: 1 }]
                      : null,
                  ]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, contentTextStyle(content)]}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setVisible(false)}>
              <Text style={[styles.modalCloseButtonText, contentTextStyle(content)]}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export type PersonSelectPanelProps = {
  friends: Friend[];
  selectedId: string | null;
  onSelectId: (id: string) => void;
  blockedIds: Set<string>;
  highlightedIds: Set<string>;
  affiliationOptions: Option[];
  experienceOptions: Option[];
};

export function PersonSelectPanel({
  friends,
  selectedId,
  onSelectId,
  blockedIds,
  highlightedIds,
  affiliationOptions,
  experienceOptions,
}: PersonSelectPanelProps) {
  const content = useContentColors();
  const [nameFilter, setNameFilter] = useState('');
  const [affiliationFilter, setAffiliationFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('');

  const personCardWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const totalGap = PERSON_GAP * (PERSON_COLUMNS - 1);
    return (screenWidth - PANEL_PADDING * 2 - totalGap) / PERSON_COLUMNS;
  }, []);

  const filteredFriends = useMemo(() => {
    const filtered = friends.filter((friend) => {
      if (nameFilter.trim() && !friend.name.toLowerCase().includes(nameFilter.trim().toLowerCase())) {
        return false;
      }
      if (affiliationFilter && !(friend.affiliations ?? []).includes(affiliationFilter)) {
        return false;
      }
      if (experienceFilter && !(friend.experiences ?? []).includes(experienceFilter)) {
        return false;
      }
      return true;
    });
    return sortFriendsBySelectedId(filtered, selectedId);
  }, [affiliationFilter, experienceFilter, friends, nameFilter, selectedId]);

  const toggleSelect = (friendId: string) => {
    if (blockedIds.has(friendId)) return;
    onSelectId(selectedId === friendId ? '' : friendId);
  };

  const renderPersonRow = ({ item }: { item: Friend }) => {
    const checked = selectedId === item.id;
    const blocked = blockedIds.has(item.id);
    const highlighted = highlightedIds.has(item.id);
    return (
      <Pressable
        style={[
          styles.personRow,
          contentSurfaceStyle(content),
          { width: personCardWidth },
          highlighted && styles.personRowHighlighted,
          blocked && styles.personRowBlocked,
          checked && styles.personRowSelected,
        ]}
        onPress={() => toggleSelect(item.id)}
        disabled={blocked}
      >
        <View style={[styles.checkbox, contentSurfaceStyle(content), checked && styles.checkboxChecked, blocked && styles.checkboxBlocked]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <View style={styles.personTextWrap}>
          <Text style={[styles.personName, contentTextStyle(content), blocked && contentMutedTextStyle(content)]} numberOfLines={1}>
            {item.name}
          </Text>
          {blocked ? (
            <Text style={[styles.blockedHint, contentMutedTextStyle(content)]} numberOfLines={2}>
              別のカードと同期済み
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.panel}>
      <View style={styles.filterRow}>
        <View style={styles.filterNameContainer}>
          <TextInput
            style={[styles.filterNameInput, contentInputStyle(content)]}
            value={nameFilter}
            onChangeText={setNameFilter}
            placeholder="名前"
            placeholderTextColor={content.contentTextSecondary}
            autoCapitalize="none"
          />
        </View>
        <SelectField
          label="所属"
          value={affiliationFilter}
          options={affiliationOptions}
          onValueChange={setAffiliationFilter}
        />
        <SelectField
          label="経験"
          value={experienceFilter}
          options={experienceOptions}
          onValueChange={setExperienceFilter}
        />
      </View>
      <FlatList
        data={filteredFriends}
        keyExtractor={(item) => item.id}
        renderItem={renderPersonRow}
        style={styles.personList}
        contentContainerStyle={styles.personListContent}
        numColumns={PERSON_COLUMNS}
        columnWrapperStyle={styles.personColumnWrapper}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 240,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  filterNameContainer: {
    flex: 1,
  },
  filterNameInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  fieldContainer: {
    flex: 1,
  },
  selectButton: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    fontSize: 14,
    flex: 1,
  },
  selectPlaceholder: {
    fontSize: 14,
    flex: 1,
  },
  selectChevron: {
    fontSize: 10,
    marginLeft: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 14,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalOptions: {
    maxHeight: 320,
  },
  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  modalOptionSelected: {
    backgroundColor: '#e0f2fe',
  },
  modalOptionText: {
    fontSize: 15,
  },
  modalCloseButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalCloseButtonText: {
    fontWeight: '600',
  },
  personList: {
    flex: 1,
  },
  personListContent: {
    paddingBottom: 16,
  },
  personColumnWrapper: {
    gap: PERSON_GAP,
    marginBottom: PERSON_GAP,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  personRowHighlighted: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  personRowBlocked: {
    opacity: 0.55,
    backgroundColor: '#f1f5f9',
  },
  personRowSelected: {
    borderColor: '#4caf50',
    backgroundColor: '#f1f8f4',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#94a3b8',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  checkboxBlocked: {
    borderColor: '#cbd5e1',
    backgroundColor: '#e2e8f0',
  },
  checkmark: {
    color: '#2e7d32',
    fontSize: 16,
    fontWeight: '900',
  },
  personTextWrap: {
    flex: 1,
    gap: 2,
  },
  personName: {
    fontSize: 14,
    fontWeight: '600',
  },
  blockedHint: {
    fontSize: 10,
    lineHeight: 13,
  },
});
