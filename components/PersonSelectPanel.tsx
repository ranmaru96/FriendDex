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
import type { Option } from '@/components/episode/types';
import { Radius, Theme } from '@/constants/theme';
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
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((option) => option.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={styles.fieldContainer}>
      <Pressable style={styles.selectButton} onPress={() => setVisible(true)}>
        <Text style={value ? styles.selectValue : styles.selectPlaceholder}>{displayLabel}</Text>
        <Text style={styles.selectChevron}>▼</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={styles.modalOptions}>
              <Pressable
                style={[styles.modalOption, !value && styles.modalOptionSelected]}
                onPress={() => {
                  onValueChange('');
                  setVisible(false);
                }}
              >
                <Text style={styles.modalOptionText}>指定なし</Text>
              </Pressable>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.modalOption, option.value === value && styles.modalOptionSelected]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setVisible(false)}>
              <Text style={styles.modalCloseButtonText}>閉じる</Text>
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
  const [nameFilter, setNameFilter] = useState('');
  const [affiliationFilter, setAffiliationFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('');

  const personCardWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const totalGap = PERSON_GAP * (PERSON_COLUMNS - 1);
    return (screenWidth - PANEL_PADDING * 2 - totalGap) / PERSON_COLUMNS;
  }, []);

  const filteredFriends = useMemo(() => {
    return friends.filter((friend) => {
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
  }, [affiliationFilter, experienceFilter, friends, nameFilter]);

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
          { width: personCardWidth },
          highlighted && styles.personRowHighlighted,
          blocked && styles.personRowBlocked,
          checked && styles.personRowSelected,
        ]}
        onPress={() => toggleSelect(item.id)}
        disabled={blocked}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked, blocked && styles.checkboxBlocked]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <View style={styles.personTextWrap}>
          <Text style={[styles.personName, blocked && styles.personNameBlocked]} numberOfLines={1}>
            {item.name}
          </Text>
          {blocked ? (
            <Text style={styles.blockedHint} numberOfLines={2}>
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
            style={styles.filterNameInput}
            value={nameFilter}
            onChangeText={setNameFilter}
            placeholder="名前"
            placeholderTextColor={Theme.inputPlaceholder}
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
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    backgroundColor: Theme.bgSurface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  fieldContainer: {
    flex: 1,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    backgroundColor: Theme.bgSurface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  selectPlaceholder: {
    fontSize: 14,
    color: Theme.inputPlaceholder,
    flex: 1,
  },
  selectChevron: {
    fontSize: 10,
    color: '#64748b',
    marginLeft: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#94a3b8',
    padding: 14,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
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
    color: '#111827',
  },
  modalCloseButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalCloseButtonText: {
    color: '#0f172a',
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
    borderColor: '#d0d0d0',
    borderRadius: Radius.sm,
    backgroundColor: '#fafafa',
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
    backgroundColor: Theme.bgSurface,
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
    color: '#333',
  },
  personNameBlocked: {
    color: '#64748b',
  },
  blockedHint: {
    fontSize: 10,
    color: '#64748b',
    lineHeight: 13,
  },
});
