import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import { useDetailDesign } from '../contexts/DetailDesignContext';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { createDetailStyles } from '../utils/detailStyles';
import { bridgeDetailBundleForAppTheme } from '@/utils/bridgeDetailForAppTheme';
import { EpisodeTagChip } from '@/components/episode/EpisodeTagChip';
import { TabScreenTemplate } from '@/components/screen-templates';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  addCommonItemOption,
  createGroupOption,
  deleteCommonItemOption,
  getCommonItemOptionByKindAndLabel,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMergedCommonItemLabels,
  initializeDatabase,
  reconcileGroupOptionMembers,
  removeCommonItemLabel,
  renameCommonItemLabel,
  setCommonItemOptionColor,
  updateGroupOption,
} from '../db';
import { sortFriendsBySelectedIds } from '@/utils/selectionSortHelpers';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import { CommonItemKind, Friend } from '../types';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { AddCircleButton } from '@/components/AddCircleButton';
import {
  EPISODE_TAG_COLOR_PALETTE,
  getHashedEpisodeTagColor,
} from '@/utils/calendarEventColors';
import { INACTIVE_TAB_COLOR_ALPHA, withAlpha } from '@/utils/colorHelpers';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

type CommonItemTabKey = '所属' | '経験' | '性格' | '好物' | '苦手' | '公開先' | 'エピソードタグ';
type Option = { label: string; value: string };

const TAGS_SCROLL_MAX_HEIGHT = Math.max(120, Dimensions.get('window').height - 280);
const TAB_TAG_DIVIDER_INSET = Spacing.md;

const TAB_ORDER: CommonItemTabKey[] = ['所属', '経験', '性格', '好物', '苦手', '公開先', 'エピソードタグ'];

const TAB_ICONS: Record<CommonItemTabKey, ComponentProps<typeof Ionicons>['name']> = {
  所属: 'people-outline',
  経験: 'school-outline',
  性格: 'happy-outline',
  好物: 'heart-outline',
  苦手: 'thumbs-down-outline',
  公開先: 'eye-outline',
  エピソードタグ: 'pricetags-outline',
};

const DEFAULT_CHIP_STYLE = {
  backgroundColor: 'transparent' as const,
  borderColor: '#b8b8c4',
  color: '#888888',
  borderWidth: 1.5,
};

const TAB_KIND_MAP: Record<CommonItemTabKey, CommonItemKind> = {
  所属: 'affiliation',
  経験: 'experience',
  性格: 'personality',
  好物: 'like',
  苦手: 'dislike',
  公開先: 'visibility_group',
  エピソードタグ: 'episode_tag',
};

const GROUP_KINDS: CommonItemKind[] = [
  'affiliation',
  'experience',
  'personality',
  'like',
  'dislike',
  'visibility_group',
];
const PERSON_COLUMNS = 3;
const PERSON_GAP = 6;
const GROUP_EDITOR_PADDING = 14;

const toOptions = (values: string[]): Option[] => values.map((v) => ({ label: v, value: v }));

function EditorActionButtons({
  onCancel,
  onSave,
  saveDisabled = false,
  saveAccessibilityLabel = '保存',
}: {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  saveAccessibilityLabel?: string;
}) {
  const content = useContentColors();
  return (
    <View style={styles.editorActionButtons}>
      <Pressable
        style={[styles.editorIconButton, contentSurfaceStyle(content)]}
        onPress={onCancel}
        accessibilityLabel="キャンセル"
        accessibilityRole="button"
      >
        <Ionicons name="close-outline" size={20} color={content.contentText} />
      </Pressable>
      <Pressable
        style={[
          styles.editorIconButton,
          contentSurfaceStyle(content),
          styles.editorIconButtonPrimary,
          { borderColor: content.contentText, backgroundColor: content.contentPersonTagBg },
          saveDisabled && styles.editorIconButtonDisabled,
        ]}
        onPress={onSave}
        disabled={saveDisabled}
        accessibilityLabel={saveAccessibilityLabel}
        accessibilityRole="button"
      >
        <Ionicons
          name="checkmark-outline"
          size={20}
          color={saveDisabled ? content.contentTextSecondary : content.contentText}
        />
      </Pressable>
    </View>
  );
}

function SelectField({ label, value, options, onValueChange }: {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (v: string) => void;
}) {
  const content = useContentColors();
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((o) => o.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={styles.filterSelectContainer}>
      <Pressable style={[styles.filterSelectButton, contentInputStyle(content)]} onPress={() => setVisible(true)}>
        <Text style={[value ? styles.filterSelectValue : styles.filterSelectPlaceholder, value ? contentTextStyle(content) : contentMutedTextStyle(content)]}>{displayLabel}</Text>
        <Text style={[styles.filterSelectChevron, contentMutedTextStyle(content)]}>▼</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.selectModalBackdrop}>
          <View style={[styles.selectModalCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.selectModalTitle, contentTextStyle(content)]}>{label}</Text>
            <ScrollView style={styles.selectModalOptions}>
              <Pressable
                style={[
                  styles.selectModalOption,
                  !value ? contentSelectedOptionStyle(content) : null,
                ]}
                onPress={() => { onValueChange(''); setVisible(false); }}
              >
                <Text style={[styles.selectModalOptionText, contentTextStyle(content)]}>指定なし</Text>
              </Pressable>
              {options.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.selectModalOption,
                    opt.value === value ? contentSelectedOptionStyle(content) : null,
                  ]}
                  onPress={() => { onValueChange(opt.value); setVisible(false); }}
                >
                  <Text style={[styles.selectModalOptionText, contentTextStyle(content)]}>{opt.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.selectModalCloseButton, contentTagStyle(content)]}
              onPress={() => setVisible(false)}
            >
              <Text style={[styles.selectModalCloseButtonText, contentTextStyle(content)]}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function CommonItemsScreen() {
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const flushTop = isMonochromeAppTheme(appTheme?.variant);
  const { bundle: rawBundle } = useDetailDesign();
  const bundle = useMemo(
    () =>
      bridgeDetailBundleForAppTheme(
        rawBundle,
        appTheme?.variant ?? 'default',
        content,
        appTheme?.colors.screenBackground ?? content.contentCard
      ),
    [appTheme?.colors.screenBackground, appTheme?.variant, content, rawBundle]
  );
  const detailStyles = useMemo(() => createDetailStyles(bundle.colors), [bundle.colors]);
  const isFlatCommonItemsPanel = kit.commonItemsPanelBorderRadius === 0;
  const commonItemsPanelStyle = useMemo(
    () =>
      isFlatCommonItemsPanel
        ? {
            borderRadius: 0,
            borderLeftWidth: 0,
            borderRightWidth: 0,
            ...(flushTop ? { borderTopWidth: 0 } : null),
          }
        : { borderRadius: kit.commonItemsPanelBorderRadius },
    [flushTop, isFlatCommonItemsPanel, kit.commonItemsPanelBorderRadius]
  );
  const contentPaddingHorizontal = isFlatCommonItemsPanel
    ? kit.commonItemsContentPaddingHorizontal
    : TAB_TAG_DIVIDER_INSET;
  const themeColors = bundle.colors;
  const [activeTab, setActiveTab] = useState<CommonItemTabKey>('所属');
  const [mergedLabels, setMergedLabels] = useState<string[]>([]);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [editorColor, setEditorColor] = useState<string>(EPISODE_TAG_COLOR_PALETTE[0]);
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
  const isEpisodeTagTab = activeKind === 'episode_tag';

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
    const filtered = allPersons.filter((p) => {
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
    return sortFriendsBySelectedIds(filtered, selectedMemberIds);
  }, [allPersons, personNameFilter, personAffiliationFilter, personExperienceFilter, selectedMemberIds]);

  const openAddEditor = () => {
    if (isGroupTab) {
      openGroupEditorForCreate();
    } else {
      setEditingOriginalLabel(null);
      setEditorText('');
      setEditorColor(EPISODE_TAG_COLOR_PALETTE[0]);
      setEditorVisible(true);
    }
  };

  const openEditEditor = (label: string) => {
    if (isGroupTab) {
      openGroupEditorForEdit(label);
    } else {
      setEditingOriginalLabel(label);
      setEditorText(label);
      if (activeKind === 'episode_tag') {
        const option = getCommonItemOptionByKindAndLabel('episode_tag', label);
        setEditorColor(option?.color ?? getHashedEpisodeTagColor(label));
      }
      setEditorVisible(true);
    }
  };

  const loadGroupEditorData = () => {
    initializeDatabase();
    setAllPersons(getAllFriendsInDefaultOrder());
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
    const kind = requireActiveKind();
    const members = reconcileGroupOptionMembers(kind, label);
    const option = getCommonItemOptionByKindAndLabel(kind, label);
    setGroupEditingId(option?.id ?? null);
    setGroupEditingOriginalLabel(label);
    setGroupName(label);
    setSelectedMemberIds(new Set(members));
    setGroupEditorVisible(true);
  };

  const handleSaveEditor = () => {
    const normalized = editorText.trim();
    if (!normalized) {
      Alert.alert('入力エラー', `${activeTab}を入力してください。`);
      return;
    }
    const kind = requireActiveKind();
    if (!editingOriginalLabel) {
      const created = addCommonItemOption(
        kind,
        normalized,
        kind === 'episode_tag' ? editorColor : null
      );
      if (!created) {
        Alert.alert('登録失敗', '同じ項目が既に存在するか、入力値が不正です。');
        return;
      }
    } else {
      const ok = renameCommonItemLabel(kind, editingOriginalLabel, normalized);
      if (!ok) {
        Alert.alert('更新失敗', '同じ項目が既に存在するか、入力値が不正です。');
        return;
      }
      if (kind === 'episode_tag') {
        setCommonItemOptionColor(kind, normalized, editorColor);
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

  const confirmDeleteLabel = (label: string, onDeleted?: () => void) => {
    Alert.alert(
      '削除確認',
      `「${label}」を削除します。\n関連する各Profileの同項目からも削除されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => {
            const kind = requireActiveKind();
            const option = getCommonItemOptionByKindAndLabel(kind, label);
            const ok = option?.id
              ? deleteCommonItemOption(option.id)
              : removeCommonItemLabel(kind, label);
            if (!ok) {
              Alert.alert('削除失敗', '削除処理に失敗しました。');
              return;
            }
            onDeleted?.();
            refreshItems();
          },
        },
      ]
    );
  };

  const handleDeleteSimpleEditor = () => {
    if (!editingOriginalLabel) return;
    confirmDeleteLabel(editingOriginalLabel, () => setEditorVisible(false));
  };

  const handleDeleteGroupEditor = () => {
    const label = groupEditingOriginalLabel ?? groupName.trim();
    if (!label) return;
    confirmDeleteLabel(label, () => setGroupEditorVisible(false));
  };

  const handlePressTag = (label: string) => {
    openEditEditor(label);
  };

  const simpleEditorTitle = editingOriginalLabel ? `${activeTab}を編集` : `${activeTab}を追加`;

  const renderEpisodeTagColorPicker = () => {
    if (!isEpisodeTagTab) return null;
    return (
      <View style={styles.colorPickerSection}>
        <Text style={[styles.colorPickerLabel, contentMutedTextStyle(content)]}>カレンダーの色</Text>
        <View style={styles.colorPickerRow}>
          {EPISODE_TAG_COLOR_PALETTE.map((swatch) => {
            const selected = editorColor.toUpperCase() === swatch.toUpperCase();
            return (
              <Pressable
                key={swatch}
                onPress={() => setEditorColor(swatch)}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: swatch },
                  selected ? styles.colorSwatchSelected : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`色 ${swatch}`}
              />
            );
          })}
        </View>
      </View>
    );
  };

  const activeChipStyle = bundle.infoChipStyles[activeTab] ?? DEFAULT_CHIP_STYLE;

  const getTabAccentColor = (tab: CommonItemTabKey) =>
    bundle.infoChipStyles[tab]?.borderColor ?? themeColors.accent;

  const renderPersonRow = ({ item }: { item: Friend }) => {
    const checked = selectedMemberIds.has(item.id);
    return (
      <Pressable style={[styles.personRow, contentSurfaceStyle(content), { width: personCardWidth }]} onPress={() => toggleMember(item.id)}>
        <View
          style={[
            styles.checkbox,
            contentSurfaceStyle(content),
            checked
              ? {
                  backgroundColor: content.contentInputBg,
                  borderColor: '#4caf50',
                }
              : null,
          ]}
        >
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={[styles.personName, contentTextStyle(content)]} numberOfLines={1}>{item.name}</Text>
      </Pressable>
    );
  };

  const renderTabInner = () => (
    <View
      style={[
        styles.tabAreaFrame,
        {
          borderColor: themeColors.tabTrackBorder,
          backgroundColor: themeColors.tabTrackBg,
          marginHorizontal: contentPaddingHorizontal,
        },
      ]}
    >
      <View style={detailStyles.tabInner}>
        {TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab;
          const tabColor = getTabAccentColor(tab);
          const inactiveIconBg = withAlpha(tabColor, INACTIVE_TAB_COLOR_ALPHA);
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                detailStyles.tabPill,
                isActive && {
                  borderColor: tabColor,
                  backgroundColor: tabColor,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab}
            >
              <View style={detailStyles.tabPillContent}>
                <View
                  style={[
                    detailStyles.tabPillIconCircle,
                    isActive
                      ? detailStyles.tabPillIconCircleActive
                      : { backgroundColor: inactiveIconBg },
                  ]}
                >
                  <Ionicons name={TAB_ICONS[tab]} size={16} color={themeColors.onAccent} />
                </View>
                <Text
                  style={[
                    detailStyles.tabPillCaption,
                    isActive ? detailStyles.tabPillCaptionActive : detailStyles.tabPillCaptionInactive,
                  ]}
                  numberOfLines={1}
                >
                  {tab}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderTagsSection = () => (
    <>
      <View
        style={[
          styles.tagsFrame,
          {
            borderColor: themeColors.tabTrackBorder,
            backgroundColor: themeColors.tabPaneBackground,
            marginHorizontal: contentPaddingHorizontal,
          },
        ]}
      >
        <ScrollView
          style={[styles.tagsScroll, { maxHeight: TAGS_SCROLL_MAX_HEIGHT }]}
          contentContainerStyle={styles.tagsContainer}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {mergedLabels.map((label) => {
            if (isEpisodeTagTab) {
              return (
                <Pressable
                  key={label}
                  onPress={() => handlePressTag(label)}
                >
                  <EpisodeTagChip
                    label={label}
                    chipStyle={{
                      backgroundColor: 'transparent',
                      color: activeChipStyle.color,
                    }}
                    style={styles.commonItemTagChip}
                    textStyle={styles.commonItemTagText}
                  />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={label}
                style={[
                  styles.valueChip,
                  {
                    backgroundColor: 'transparent',
                    borderColor: activeChipStyle.borderColor,
                    borderWidth: activeChipStyle.borderWidth,
                  },
                ]}
                onPress={() => handlePressTag(label)}
              >
                <Text style={[styles.valueChipText, { color: activeChipStyle.color }]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View style={[styles.addButtonRow, { paddingHorizontal: contentPaddingHorizontal }]}>
        <AddCircleButton onPress={openAddEditor} accessibilityLabel={`${activeTab}を追加`} />
      </View>
    </>
  );

  return (
    <>
      <TabScreenTemplate contentContainerStyle={styles.body}>
        <View style={[detailStyles.tabSection, styles.tabSectionFill, styles.tabSectionNoFrame]}>
          <View
            style={[
              detailStyles.tabTrack,
              styles.tabTrackAligned,
              contentSurfaceStyle(content),
              styles.itemsPanel,
              commonItemsPanelStyle,
              isFlatCommonItemsPanel ? styles.tabTrackFlatPreview : null,
            ]}
          >
            {renderTabInner()}
            {renderTagsSection()}
          </View>
        </View>
      </TabScreenTemplate>

      {/* Simple editor（エピソードタグなど） */}
      <Modal visible={editorVisible} transparent animationType="fade" onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.editorOverlay}>
          <View style={[styles.editorCard, contentSurfaceStyle(content), styles.editorCardPreview]}>
            <>
                <View style={styles.editorHeaderPreview}>
                  <Text style={[styles.editorTitlePreview, contentTextStyle(content)]} numberOfLines={1}>
                    {simpleEditorTitle}
                  </Text>
                  <EditorActionButtons
                    onCancel={() => setEditorVisible(false)}
                    onSave={handleSaveEditor}
                  />
                </View>
                <TextInput
                  value={editorText}
                  onChangeText={setEditorText}
                  style={[styles.editorInput, contentInputStyle(content)]}
                  placeholder={`${activeTab}を入力`}
                  placeholderTextColor={content.contentTextSecondary}
                  autoCapitalize="none"
                  autoFocus
                />
                {renderEpisodeTagColorPicker()}
                {editingOriginalLabel ? (
                  <Pressable
                    style={[
                      styles.editorDeleteButton,
                      {
                        backgroundColor: 'rgba(248, 113, 113, 0.18)',
                        borderColor: 'rgba(248, 113, 113, 0.55)',
                      },
                    ]}
                    onPress={handleDeleteSimpleEditor}
                  >
                    <Text style={styles.editorDeleteText}>削除</Text>
                  </Pressable>
                ) : null}
            </>
          </View>
        </View>
      </Modal>

      {/* Group editor（所属/公開先など） */}
      <Modal visible={groupEditorVisible} transparent animationType="slide" onRequestClose={() => setGroupEditorVisible(false)}>
        <View style={styles.groupEditorOverlay}>
          <View style={[styles.groupEditorCard, contentSurfaceStyle(content)]}>
            <>
                <View style={styles.groupHeaderRowPreview}>
                  <TextInput
                    value={groupName}
                    onChangeText={setGroupName}
                    style={[styles.groupNameInputPreview, contentInputStyle(content)]}
                    placeholder={`${activeTab}名`}
                    placeholderTextColor={content.contentTextSecondary}
                    autoCapitalize="none"
                  />
                  <EditorActionButtons
                    onCancel={() => setGroupEditorVisible(false)}
                    onSave={handleSaveGroupEditor}
                    saveDisabled={!groupName.trim()}
                    saveAccessibilityLabel={groupEditingId ? '保存' : '作成'}
                  />
                </View>

                <View style={styles.filterRow}>
                  <View style={styles.filterNameContainer}>
                    <TextInput
                      style={[styles.filterNameInput, contentInputStyle(content)]}
                      value={personNameFilter}
                      onChangeText={setPersonNameFilter}
                      placeholder="名前"
                      placeholderTextColor={content.contentTextSecondary}
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

                <FlatList
                  data={filteredPersons}
                  keyExtractor={(item) => item.id}
                  renderItem={renderPersonRow}
                  style={styles.personList}
                  contentContainerStyle={styles.personListContent}
                  numColumns={PERSON_COLUMNS}
                  columnWrapperStyle={styles.personColumnWrapper}
                />

                {groupEditingId ? (
                  <Pressable
                    style={[
                      styles.editorDeleteButton,
                      {
                        backgroundColor: 'rgba(248, 113, 113, 0.18)',
                        borderColor: 'rgba(248, 113, 113, 0.55)',
                      },
                    ]}
                    onPress={handleDeleteGroupEditor}
                  >
                    <Text style={styles.editorDeleteText}>削除</Text>
                  </Pressable>
                ) : null}
            </>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    marginBottom: Spacing.md,
  },
  tabSectionFill: {
    flex: 1,
    alignItems: 'stretch',
  },
  tabSectionNoFrame: {
    backgroundColor: 'transparent',
  },
  tabTrackAligned: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: Theme.card,
    borderWidth: 0,
  },
  tabTrackFlatPreview: {
    paddingHorizontal: 0,
  },
  itemsPanel: {
    alignSelf: 'stretch',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  tabAreaFrame: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  tagsFrame: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  tagsScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: 4,
    rowGap: 8,
  },
  valueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  valueChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  /** 約1.1倍（共通項目一覧のみ。EpisodeTagChip 既定は他画面用に据え置き） */
  commonItemTagChip: {
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  commonItemTagText: {
    fontSize: 12,
  },
  colorPickerSection: {
    gap: 8,
  },
  colorPickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  colorPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#0f172a',
  },
  addButtonRow: {
    alignItems: 'flex-end',
    paddingTop: Spacing.sm,
  },
  /* Simple editor (経験/性格) */
  editorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  editorCard: {
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#94a3b8',
    padding: 14,
    gap: 10,
  },
  editorCardPreview: {
    paddingTop: 8,
    paddingBottom: 14,
  },
  editorHeaderPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editorTitlePreview: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  editorActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editorIconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: Theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorIconButtonPrimary: {
    borderColor: Theme.accent,
  },
  editorIconButtonDisabled: {
    opacity: 0.45,
  },
  editorDeleteButton: {
    alignSelf: 'center',
    marginTop: 12,
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorDeleteText: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: '#f87171',
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  editorInput: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
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
    borderRadius: Radius.sm,
    backgroundColor: Theme.bgSurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editorCancelText: {
    color: '#0f172a',
    fontSize: Typography.base,
    fontWeight: '700',
  },
  editorSaveButton: {
    borderWidth: 1,
    borderColor: '#2e7d32',
    borderRadius: Radius.sm,
    backgroundColor: '#4caf50',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editorSaveText: {
    color: Theme.bgSurface,
    fontSize: Typography.base,
    fontWeight: '700',
  },

  /* Group editor (所属/公開範囲) */
  groupEditorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  groupEditorCard: {
    backgroundColor: Theme.bgSurface,
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
  groupHeaderRowPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  groupNameInputPreview: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    minHeight: 40,
  },
  groupNameInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
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
    borderRadius: Radius.sm,
    backgroundColor: Theme.bgSurface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  groupCancelButtonText: {
    color: '#0f172a',
    fontSize: Typography.base,
    fontWeight: '700',
  },
  groupCreateButton: {
    borderWidth: 2,
    borderColor: '#2e7d32',
    borderRadius: Radius.sm,
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
    borderRadius: Radius.sm,
    backgroundColor: '#4caf50',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  groupSaveButtonText: {
    color: Theme.bgSurface,
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
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: Typography.base,
    color: '#111827',
  },
  filterSelectContainer: {
    flex: 1,
  },
  filterSelectButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterSelectValue: {
    fontSize: Typography.base,
    color: '#111827',
    flex: 1,
  },
  filterSelectPlaceholder: {
    fontSize: Typography.base,
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
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.md,
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
    borderRadius: Radius.sm,
  },
  selectModalOptionText: {
    fontSize: 14,
  },
  selectModalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selectModalCloseButtonText: {
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
    borderRadius: Radius.sm,
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
  },
  checkmark: {
    color: '#4caf50',
    fontSize: 16,
    fontWeight: '900',
  },
  personName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
});
