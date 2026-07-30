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
import { Theme, Radius, Typography } from '@/constants/theme';
import type { Option } from '@/components/episode/types';
import type { Friend } from '@/types';
import { sortFriendsBySelectedIds, sortOptionsBySelectedValues } from '@/utils/selectionSortHelpers';

const SELECTOR_COLUMNS = 3;
const SELECTOR_GAP = 6;
const SELECTOR_CARD_PADDING = 14;

function SelectorFilterField({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((option) => option.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={styles.selectorFilterSelectContainer}>
      <Pressable style={styles.selectorFilterSelectButton} onPress={() => setVisible(true)}>
        <Text style={value ? styles.selectorFilterSelectValue : styles.selectorFilterSelectPlaceholder}>
          {displayLabel}
        </Text>
        <Text style={styles.selectorFilterSelectChevron}>▼</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.selectorFilterModalBackdrop}>
          <View style={styles.selectorFilterModalCard}>
            <Text style={styles.selectorFilterModalTitle}>{label}</Text>
            <ScrollView style={styles.selectorFilterModalOptions} keyboardShouldPersistTaps="handled">
              <Pressable
                style={[styles.selectorFilterModalOption, !value && styles.selectorFilterModalOptionSelected]}
                onPress={() => {
                  onValueChange('');
                  setVisible(false);
                }}
              >
                <Text style={styles.selectorFilterModalOptionText}>指定なし</Text>
              </Pressable>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.selectorFilterModalOption,
                    option.value === value && styles.selectorFilterModalOptionSelected,
                  ]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.selectorFilterModalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.selectorFilterModalCloseButton} onPress={() => setVisible(false)}>
              <Text style={styles.selectorFilterModalCloseButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export type EntrySelectorModalProps = {
  visible: boolean;
  selectorTab: 'individual' | 'group';
  onTabChange: (tab: 'individual' | 'group') => void;
  nameFilter: string;
  onNameFilterChange: (value: string) => void;
  affiliationFilter: string;
  onAffiliationFilterChange: (value: string) => void;
  experienceFilter: string;
  onExperienceFilterChange: (value: string) => void;
  friends: Friend[];
  affiliationOptions: Option[];
  experienceOptions: Option[];
  groupOptions: Option[];
  selectedIndividualIds: Set<string>;
  selectedGroupValues: Set<string>;
  onToggleIndividual: (friendId: string) => void;
  onToggleGroup: (groupValue: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function EntrySelectorModal({
  visible,
  selectorTab,
  onTabChange,
  nameFilter,
  onNameFilterChange,
  affiliationFilter,
  onAffiliationFilterChange,
  experienceFilter,
  onExperienceFilterChange,
  friends,
  affiliationOptions,
  experienceOptions,
  groupOptions,
  selectedIndividualIds,
  selectedGroupValues,
  onToggleIndividual,
  onToggleGroup,
  onCancel,
  onConfirm,
}: EntrySelectorModalProps) {
  const itemWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const totalGap = SELECTOR_GAP * (SELECTOR_COLUMNS - 1);
    return (screenWidth - SELECTOR_CARD_PADDING * 2 - totalGap) / SELECTOR_COLUMNS;
  }, []);

  const normalizedNameFilter = nameFilter.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    const filtered = friends.filter((friend) => {
      if (normalizedNameFilter && !friend.name.toLowerCase().includes(normalizedNameFilter)) {
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
    return sortFriendsBySelectedIds(filtered, selectedIndividualIds);
  }, [friends, normalizedNameFilter, affiliationFilter, experienceFilter, selectedIndividualIds]);
  const filteredGroups = useMemo(() => {
    const filtered = groupOptions.filter((option) =>
      normalizedNameFilter ? option.label.toLowerCase().includes(normalizedNameFilter) : true
    );
    return sortOptionsBySelectedValues(filtered, selectedGroupValues);
  }, [groupOptions, normalizedNameFilter, selectedGroupValues]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.selectorOverlay}>
        <View style={styles.selectorCard}>
          <View style={styles.selectorTabRow}>
            <Pressable
              style={[styles.selectorTabButton, selectorTab === 'individual' && styles.selectorTabButtonActive]}
              onPress={() => onTabChange('individual')}
            >
              <Text
                style={[
                  styles.selectorTabButtonText,
                  selectorTab === 'individual' && styles.selectorTabButtonTextActive,
                ]}
              >
                個人
              </Text>
            </Pressable>
            <Pressable
              style={[styles.selectorTabButton, selectorTab === 'group' && styles.selectorTabButtonActive]}
              onPress={() => onTabChange('group')}
            >
              <Text
                style={[styles.selectorTabButtonText, selectorTab === 'group' && styles.selectorTabButtonTextActive]}
              >
                所属
              </Text>
            </Pressable>
          </View>
          <View style={styles.selectorDivider} />
          {selectorTab === 'individual' ? (
            <View style={styles.selectorFilterRow}>
              <View style={styles.selectorFilterNameContainer}>
                <TextInput
                  style={styles.selectorFilterNameInput}
                  value={nameFilter}
                  onChangeText={onNameFilterChange}
                  placeholder="名前"
                  placeholderTextColor={Theme.inputPlaceholder}
                  autoCapitalize="none"
                />
              </View>
              <SelectorFilterField
                label="所属"
                value={affiliationFilter}
                options={affiliationOptions}
                onValueChange={onAffiliationFilterChange}
              />
              <SelectorFilterField
                label="経験"
                value={experienceFilter}
                options={experienceOptions}
                onValueChange={onExperienceFilterChange}
              />
            </View>
          ) : (
            <TextInput
              style={styles.selectorNameInput}
              value={nameFilter}
              onChangeText={onNameFilterChange}
              placeholder="名前"
              placeholderTextColor={Theme.inputPlaceholder}
              autoCapitalize="none"
            />
          )}
          <View style={styles.selectorDivider} />
          {selectorTab === 'individual' ? (
            <FlatList
              data={filteredFriends}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const checked = selectedIndividualIds.has(item.id);
                return (
                  <Pressable
                    style={[styles.selectorPersonRow, { width: itemWidth }]}
                    onPress={() => onToggleIndividual(item.id)}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <Text style={styles.selectorPersonName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
              numColumns={SELECTOR_COLUMNS}
              columnWrapperStyle={styles.selectorColumnWrapper}
              style={styles.selectorListScroll}
              contentContainerStyle={styles.selectorListContent}
              keyboardShouldPersistTaps="handled"
            />
          ) : (
            <FlatList
              data={filteredGroups}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const checked = selectedGroupValues.has(item.value);
                return (
                  <Pressable
                    style={[styles.selectorPersonRow, { width: itemWidth }]}
                    onPress={() => onToggleGroup(item.value)}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <Text style={styles.selectorPersonName} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
              numColumns={SELECTOR_COLUMNS}
              columnWrapperStyle={styles.selectorColumnWrapper}
              style={styles.selectorListScroll}
              contentContainerStyle={styles.selectorListContent}
              keyboardShouldPersistTaps="handled"
            />
          )}
          <View style={styles.selectorActions}>
            <Pressable style={styles.selectorCancelButton} onPress={onCancel}>
              <Text style={styles.selectorCancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable style={styles.selectorOkButton} onPress={onConfirm}>
              <Text style={styles.selectorOkButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  selectorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  selectorCard: {
    backgroundColor: Theme.bgSurface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 20,
    maxHeight: '85%',
  },
  selectorTabRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  selectorTabButton: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  selectorTabButtonActive: { backgroundColor: '#67e8f9', borderColor: '#0891b2' },
  selectorTabButtonText: { fontSize: Typography.base, fontWeight: '700', color: '#0f172a' },
  selectorTabButtonTextActive: { color: '#083344' },
  selectorDivider: { height: 1, backgroundColor: '#e2e8f0', marginBottom: 10 },
  selectorNameInput: {
    minHeight: 38,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.inputBg,
    color: '#0f172a',
    paddingHorizontal: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  selectorFilterRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  selectorFilterNameContainer: { flex: 1 },
  selectorFilterNameInput: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: Typography.base,
    color: '#111827',
  },
  selectorFilterSelectContainer: { flex: 1 },
  selectorFilterSelectButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectorFilterSelectValue: { fontSize: Typography.base, color: '#111827', flex: 1 },
  selectorFilterSelectPlaceholder: { fontSize: Typography.base, color: '#6b7280', flex: 1 },
  selectorFilterSelectChevron: { fontSize: 10, color: '#475569', marginLeft: 4 },
  selectorFilterModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  selectorFilterModalCard: {
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.md,
    padding: 14,
    maxHeight: '70%',
  },
  selectorFilterModalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  selectorFilterModalOptions: { marginBottom: 10 },
  selectorFilterModalOption: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radius.sm },
  selectorFilterModalOptionSelected: { backgroundColor: '#e0f2fe' },
  selectorFilterModalOptionText: { fontSize: 14, color: '#1e293b' },
  selectorFilterModalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
  },
  selectorFilterModalCloseButtonText: { color: '#0f172a', fontWeight: '600' },
  selectorListScroll: { maxHeight: 320, marginBottom: 12 },
  selectorListContent: { paddingBottom: 8 },
  selectorColumnWrapper: { gap: SELECTOR_GAP, marginBottom: SELECTOR_GAP },
  selectorPersonRow: {
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
  selectorPersonName: { flex: 1, fontSize: 12, fontWeight: '600', color: '#333' },
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
  checkboxChecked: { backgroundColor: '#e8f5e9', borderColor: '#4caf50' },
  checkmark: { color: '#2e7d32', fontSize: 16, fontWeight: '900' },
  selectorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  selectorCancelButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectorCancelButtonText: { color: '#0f172a', fontWeight: '700', fontSize: Typography.base },
  selectorOkButton: {
    backgroundColor: '#67e8f9',
    borderColor: '#0891b2',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectorOkButtonText: { color: '#083344', fontWeight: '700', fontSize: Typography.base },
});
