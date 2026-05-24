import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  addCommonItemOption,
  createGroupOption,
  getAllFriends,
  getCommonItemOptionByKindAndLabel,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMergedCommonItemLabels,
  initializeDatabase,
  removeCommonItemLabel,
  renameCommonItemLabel,
  updateGroupOption,
} from '../db';
import { CommonItemKind, Friend } from '../types';

type CommonItemTabKey = '所属' | '経験' | '性格' | '公開先';
type Option = { label: string; value: string };

const TAB_ORDER: CommonItemTabKey[] = ['所属', '経験', '性格', '公開先'];

const TAB_KIND_MAP: Record<CommonItemTabKey, CommonItemKind> = {
  所属: 'affiliation',
  経験: 'experience',
  性格: 'personality',
  公開先: 'visibility_group',
};

const GROUP_KINDS: CommonItemKind[] = ['affiliation', 'experience', 'personality', 'visibility_group'];
const PERSON_COLUMNS = 3;
const PERSON_GAP = 6;
const GROUP_EDITOR_PADDING = 14;

const toOptions = (values: string[]): Option[] => values.map((v) => ({ label: v, value: v }));

function SelectField({ label, value, options, onValueChange }: {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((o) => o.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={styles.filterSelectContainer}>
      <Pressable style={styles.filterSelectButton} onPress={() => setVisible(true)}>
        <Text style={value ? styles.filterSelectValue : styles.filterSelectPlaceholder}>{displayLabel}</Text>
        <Text style={styles.filterSelectChevron}>▼</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.selectModalBackdrop}>
          <View style={styles.selectModalCard}>
            <Text style={styles.selectModalTitle}>{label}</Text>
            <ScrollView style={styles.selectModalOptions}>
              <Pressable
                style={[styles.selectModalOption, !value && styles.selectModalOptionSelected]}
                onPress={() => { onValueChange(''); setVisible(false); }}
              >
                <Text style={styles.selectModalOptionText}>指定なし</Text>
              </Pressable>
              {options.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.selectModalOption, opt.value === value && styles.selectModalOptionSelected]}
                  onPress={() => { onValueChange(opt.value); setVisible(false); }}
                >
                  <Text style={styles.selectModalOptionText}>{opt.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.selectModalCloseButton} onPress={() => setVisible(false)}>
              <Text style={styles.selectModalCloseButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function CommonItemsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CommonItemTabKey>('所属');
  const [mergedLabels, setMergedLabels] = useState<string[]>([]);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [editingOriginalLabel, setEditingOriginalLabel] = useState<string | null>(null);

  const [groupEditorVisible, setGroupEditorVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupEditingId, setGroupEditingId] = useState<string | null>(null);
  const [groupEditingOriginalLabel, setGroupEditingOriginalLabel] = useState<string | null>(null);
  const [allPersons, setAllPersons] = useState<Friend[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [personNameFilter, setPersonNameFilter] = useState('');
  const [personAffiliationFilter, setPersonAffiliationFilter] = useState('');
  const [personExperienceFilter, setPersonExperienceFilter] = useState('');
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);

  const activeKind = TAB_KIND_MAP[activeTab];
  const isGroupTab = GROUP_KINDS.includes(activeKind);

  const requireActiveKind = (): CommonItemKind => activeKind;

  const personCardWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const totalGap = PERSON_GAP * (PERSON_COLUMNS - 1);
    return (screenWidth - GROUP_EDITOR_PADDING * 2 - totalGap) / PERSON_COLUMNS;
  }, []);

  const refreshItems = useCallback(() => {
    initializeDatabase();
    setMergedLabels(getMergedCommonItemLabels(activeKind));
  }, [activeKind]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

  const filteredPersons = useMemo(() => {
    return allPersons.filter((p) => {
      if (personNameFilter.trim() && !p.name.toLowerCase().includes(personNameFilter.trim().toLowerCase())) return false;
      if (personAffiliationFilter) {
        const match = (p.affiliations ?? []).includes(personAffiliationFilter);
        if (!match) return false;
      }
      if (personExperienceFilter) {
        const match = (p.experiences ?? []).includes(personExperienceFilter);
        if (!match) return false;
      }
      return true;
    });
  }, [allPersons, personNameFilter, personAffiliationFilter, personExperienceFilter]);

  const openAddEditor = () => {
    if (isGroupTab) {
      openGroupEditorForCreate();
    } else {
      setEditingOriginalLabel(null);
      setEditorText('');
      setEditorVisible(true);
    }
  };

  const openEditEditor = (label: string) => {
    if (isGroupTab) {
      openGroupEditorForEdit(label);
    } else {
      setEditingOriginalLabel(label);
      setEditorText(label);
      setEditorVisible(true);
    }
  };

  const loadGroupEditorData = () => {
    initializeDatabase();
    setAllPersons(getAllFriends());
    setAffiliationOptions(toOptions(getDistinctAffiliations()));
    setExperienceOptions(toOptions(getDistinctExperiences()));
    setPersonNameFilter('');
    setPersonAffiliationFilter('');
    setPersonExperienceFilter('');
  };

  const openGroupEditorForCreate = () => {
    loadGroupEditorData();
    setGroupEditingId(null);
    setGroupEditingOriginalLabel(null);
    setGroupName('');
    setSelectedMemberIds(new Set());
    setGroupEditorVisible(true);
  };

  const openGroupEditorForEdit = (label: string) => {
    loadGroupEditorData();
    const option = getCommonItemOptionByKindAndLabel(requireActiveKind(), label);
    setGroupEditingId(option?.id ?? null);
    setGroupEditingOriginalLabel(label);
    setGroupName(label);
    setSelectedMemberIds(new Set(option?.members ?? []));
    setGroupEditorVisible(true);
  };

  const handleSaveEditor = () => {
    const normalized = editorText.trim();
    if (!normalized) {
      Alert.alert('入力エラー', `${activeTab}を入力してください。`);
      return;
    }
    if (!editingOriginalLabel) {
      const created = addCommonItemOption(requireActiveKind(), normalized);
      if (!created) {
        Alert.alert('登録失敗', '同じ項目が既に存在するか、入力値が不正です。');
        return;
      }
    } else {
      const ok = renameCommonItemLabel(requireActiveKind(), editingOriginalLabel, normalized);
      if (!ok) {
        Alert.alert('更新失敗', '同じ項目が既に存在するか、入力値が不正です。');
        return;
      }
    }
    setEditorVisible(false);
    refreshItems();
  };

  const handleSaveGroupEditor = () => {
    const normalized = groupName.trim();
    if (!normalized) {
      Alert.alert('入力エラー', `${activeTab}名を入力してください。`);
      return;
    }
    const memberIds = Array.from(selectedMemberIds);

    if (!groupEditingId) {
      const created = createGroupOption(requireActiveKind(), normalized, memberIds);
      if (!created) {
        Alert.alert('登録失敗', `同じ${activeTab}名が既に存在するか、入力値が不正です。`);
        return;
      }
    } else {
      const ok = updateGroupOption(groupEditingId, normalized, memberIds);
      if (!ok) {
        Alert.alert('更新失敗', `同じ${activeTab}名が既に存在するか、入力値が不正です。`);
        return;
      }
    }
    setGroupEditorVisible(false);
    refreshItems();
  };

  const toggleMember = (friendId: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  };

  const handleLongPressTag = (label: string) => {
    Alert.alert('項目操作', `「${label}」をどうしますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '編集',
        onPress: () => openEditEditor(label),
      },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            '削除確認',
            `「${label}」を削除します。\n関連する各Profileの同項目からも削除されます。`,
            [
              { text: 'キャンセル', style: 'cancel' },
              {
                text: '削除する',
                style: 'destructive',
                onPress: () => {
                  const ok = removeCommonItemLabel(requireActiveKind(), label);
                  if (!ok) {
                    Alert.alert('削除失敗', '削除処理に失敗しました。');
                    return;
                  }
                  refreshItems();
                },
              },
            ]
          );
        },
      },
    ]);
  };

  const renderPersonRow = ({ item }: { item: Friend }) => {
    const checked = selectedMemberIds.has(item.id);
    return (
      <Pressable style={[styles.personRow, { width: personCardWidth }]} onPress={() => toggleMember(item.id)}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.personName} numberOfLines={1}>{item.name}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topNavRow}>
          <Pressable style={styles.secondaryNavPill} onPress={() => router.push('/')}>
            <Text style={styles.secondaryNavText}>Profile一覧</Text>
          </Pressable>
          <Pressable style={styles.secondaryNavPill} onPress={() => router.push('/episode')}>
            <Text style={styles.secondaryNavText}>エピソード</Text>
          </Pressable>
          <View style={styles.navCurrent}>
            <Text style={styles.navCurrentText}>共通項目</Text>
          </View>
          <Pressable style={styles.secondaryNavPill} onPress={() => router.push('/friends')}>
            <Text style={styles.secondaryNavText}>友達</Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          <View style={styles.tabSection}>
            <View style={styles.tabRowContainer}>
              <View style={styles.tabButtonRow}>
                {TAB_ORDER.map((tab) => (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[styles.tabButton, activeTab === tab ? styles.tabButtonActive : styles.tabButtonInactive]}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        activeTab === tab ? styles.tabButtonTextActive : styles.tabButtonTextInactive,
                      ]}
                    >
                      {tab}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.tabContentArea}>
              <ScrollView contentContainerStyle={styles.tagsContainer}>
                {mergedLabels.map((label) => (
                  <Pressable
                    key={label}
                    style={styles.valueTag}
                    onLongPress={() => handleLongPressTag(label)}
                    delayLongPress={300}
                  >
                    <Text style={styles.valueTagText}>{label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.addButtonRow}>
                <Pressable style={styles.addButton} onPress={openAddEditor}>
                  <Text style={styles.addButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Simple editor for 経験/性格 */}
      <Modal visible={editorVisible} transparent animationType="fade" onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.editorOverlay}>
          <View style={styles.editorCard}>
            <Text style={styles.editorTitle}>{editingOriginalLabel ? `${activeTab}を編集` : `${activeTab}を追加`}</Text>
            <TextInput
              value={editorText}
              onChangeText={setEditorText}
              style={styles.editorInput}
              placeholder={`${activeTab}を入力`}
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              autoFocus
            />
            <View style={styles.editorActions}>
              <Pressable style={styles.editorCancelButton} onPress={() => setEditorVisible(false)}>
                <Text style={styles.editorCancelText}>キャンセル</Text>
              </Pressable>
              <Pressable style={styles.editorSaveButton} onPress={handleSaveEditor}>
                <Text style={styles.editorSaveText}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Group editor for 所属/公開範囲 */}
      <Modal visible={groupEditorVisible} transparent animationType="slide" onRequestClose={() => setGroupEditorVisible(false)}>
        <View style={styles.groupEditorOverlay}>
          <View style={styles.groupEditorCard}>
            {/* Header */}
            <View style={styles.groupHeaderRow}>
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                style={styles.groupNameInput}
                placeholder={`${activeTab}名`}
                placeholderTextColor="#6b7280"
                autoCapitalize="none"
              />
              <View style={styles.groupEditButtons}>
                <Pressable style={styles.groupCancelButton} onPress={() => setGroupEditorVisible(false)}>
                  <Text style={styles.groupCancelButtonText}>キャンセル</Text>
                </Pressable>
                <Pressable
                  style={[
                    groupEditingId ? styles.groupSaveButton : styles.groupCreateButton,
                    !groupName.trim() && styles.groupButtonDisabled,
                  ]}
                  onPress={handleSaveGroupEditor}
                  disabled={!groupName.trim()}
                >
                  <Text style={groupEditingId ? styles.groupSaveButtonText : styles.groupCreateButtonText}>
                    {groupEditingId ? '保存' : '作成'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Filter row */}
            <View style={styles.filterRow}>
              <View style={styles.filterNameContainer}>
                <TextInput
                  style={styles.filterNameInput}
                  value={personNameFilter}
                  onChangeText={setPersonNameFilter}
                  placeholder="名前"
                  placeholderTextColor="#6b7280"
                  autoCapitalize="none"
                />
              </View>
              <SelectField
                label="所属"
                value={personAffiliationFilter}
                options={affiliationOptions}
                onValueChange={setPersonAffiliationFilter}
              />
              <SelectField
                label="経験"
                value={personExperienceFilter}
                options={experienceOptions}
                onValueChange={setPersonExperienceFilter}
              />
            </View>

            {/* Person list */}
            <FlatList
              data={filteredPersons}
              keyExtractor={(item) => item.id}
              renderItem={renderPersonRow}
              style={styles.personList}
              contentContainerStyle={styles.personListContent}
              numColumns={PERSON_COLUMNS}
              columnWrapperStyle={styles.personColumnWrapper}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f2f5f8',
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  navCurrent: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#aaa',
    backgroundColor: '#3d3d3d',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCurrentText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  secondaryNavPill: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#aaa',
    backgroundColor: '#e5e5e5',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryNavText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  tabSection: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 12,
    backgroundColor: '#e9e9e9',
    padding: 10,
  },
  tabRowContainer: {
    backgroundColor: 'transparent',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    margin: 0,
  },
  tabButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  tabButton: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderColor: '#888',
    borderWidth: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    marginBottom: 0,
  },
  tabButtonInactive: {
    backgroundColor: '#cfcfcf',
    borderBottomWidth: 2,
  },
  tabButtonActive: {
    backgroundColor: '#efefef',
    borderBottomWidth: 0,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  tabButtonTextInactive: {
    color: '#5a5a5a',
  },
  tabButtonTextActive: {
    color: '#4a4a4a',
  },
  tabContentArea: {
    flex: 1,
    borderColor: '#888',
    borderWidth: 2,
    borderTopWidth: 0,
    borderRadius: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: '#efefef',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: 12,
  },
  valueTag: {
    borderWidth: 2,
    borderColor: '#d0d0d0',
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  valueTagText: {
    color: '#555',
    fontSize: 16,
    fontWeight: '700',
  },
  addButtonRow: {
    marginTop: 'auto',
    alignItems: 'flex-end',
    paddingTop: 10,
  },
  addButton: {
    minWidth: 84,
    borderWidth: 2,
    borderColor: '#039be5',
    borderRadius: 10,
    backgroundColor: '#b3e5fc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  addButtonText: {
    color: '#4b4b4b',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 36,
  },
  /* Simple editor (経験/性格) */
  editorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  editorCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#94a3b8',
    padding: 14,
    gap: 10,
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  editorInput: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  editorCancelButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editorCancelText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  editorSaveButton: {
    borderWidth: 1,
    borderColor: '#2e7d32',
    borderRadius: 8,
    backgroundColor: '#4caf50',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editorSaveText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Group editor (所属/公開範囲) */
  groupEditorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  groupEditorCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '90%',
    padding: GROUP_EDITOR_PADDING,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  groupNameInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#94a3b8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  groupEditButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  groupCancelButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  groupCancelButtonText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  groupCreateButton: {
    borderWidth: 2,
    borderColor: '#2e7d32',
    borderRadius: 8,
    backgroundColor: '#c8e6c9',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  groupCreateButtonText: {
    color: '#1b5e20',
    fontSize: 14,
    fontWeight: '700',
  },
  groupSaveButton: {
    borderWidth: 2,
    borderColor: '#2e7d32',
    borderRadius: 8,
    backgroundColor: '#4caf50',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  groupSaveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  groupButtonDisabled: {
    opacity: 0.4,
  },

  /* Filter row */
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
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  filterSelectContainer: {
    flex: 1,
  },
  filterSelectButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterSelectValue: {
    fontSize: 13,
    color: '#111827',
    flex: 1,
  },
  filterSelectPlaceholder: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  filterSelectChevron: {
    fontSize: 10,
    color: '#475569',
    marginLeft: 4,
  },
  selectModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  selectModalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    maxHeight: '70%',
  },
  selectModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  selectModalOptions: {
    marginBottom: 10,
  },
  selectModalOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  selectModalOptionSelected: {
    backgroundColor: '#e0f2fe',
  },
  selectModalOptionText: {
    fontSize: 14,
    color: '#1e293b',
  },
  selectModalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  selectModalCloseButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },

  /* Person list */
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
    borderRadius: 8,
    backgroundColor: '#fafafa',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#94a3b8',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  checkmark: {
    color: '#2e7d32',
    fontSize: 16,
    fontWeight: '900',
  },
  personName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});
