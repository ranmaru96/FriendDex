import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useDetailDesign } from '../contexts/DetailDesignContext';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { createDetailStyles } from '../utils/detailStyles';
import { bridgeDetailBundleForAppTheme } from '@/utils/bridgeDetailForAppTheme';
import { TabScreenTemplate } from '@/components/screen-templates';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
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
  updateGroupOption,
} from '../db';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import { CommonItemKind, Friend } from '../types';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { AddCircleButton } from '@/components/AddCircleButton';
import { INACTIVE_TAB_COLOR_ALPHA, withAlpha } from '@/utils/colorHelpers';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

/** 公開先は概念・データ種別として残し、導入までタブ表示のみ隠す。予定タグはカレンダー側管理のため除外。 */
type CommonItemTabKey = '所属' | '経験' | '性格' | '好物' | '苦手' | '公開先';
type Option = { label: string; value: string };

const TAGS_SCROLL_MAX_HEIGHT = Math.max(120, Dimensions.get('window').height - 280);
const TAB_TAG_DIVIDER_INSET = Spacing.md;

const VISIBLE_TAB_ORDER: CommonItemTabKey[] = ['所属', '経験', '性格', '好物', '苦手'];

const TAB_ICONS: Record<CommonItemTabKey, ComponentProps<typeof Ionicons>['name']> = {
  所属: 'people-outline',
  経験: 'school-outline',
  性格: 'happy-outline',
  好物: 'heart-outline',
  苦手: 'thumbs-down-outline',
  公開先: 'eye-outline',
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
};

const parseCommonItemTabParam = (value: unknown): CommonItemTabKey | null => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return null;
  }
  if ((VISIBLE_TAB_ORDER as string[]).includes(raw)) {
    return raw as CommonItemTabKey;
  }
  const byKind = (Object.entries(TAB_KIND_MAP) as [CommonItemTabKey, CommonItemKind][]).find(
    ([tab, kind]) => kind === raw && (VISIBLE_TAB_ORDER as CommonItemTabKey[]).includes(tab)
  );
  return byKind?.[0] ?? null;
};

const GROUP_KINDS: CommonItemKind[] = [
  'affiliation',
  'experience',
  'personality',
  'like',
  'dislike',
  'visibility_group',
];
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

export default function CommonItemsScreen() {
  const router = useRouter();
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
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab = parseCommonItemTabParam(params.tab) ?? '所属';
  const [activeTab, setActiveTab] = useState<CommonItemTabKey>(initialTab);

  useFocusEffect(
    useCallback(() => {
      const nextTab = parseCommonItemTabParam(params.tab);
      if (nextTab) {
        setActiveTab(nextTab);
      }
    }, [params.tab])
  );
  const [mergedLabels, setMergedLabels] = useState<string[]>([]);
  const [infoVisible, setInfoVisible] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [editingOriginalLabel, setEditingOriginalLabel] = useState<string | null>(null);

  const [groupEditorVisible, setGroupEditorVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupEditingId, setGroupEditingId] = useState<string | null>(null);
  const [groupEditingOriginalLabel, setGroupEditingOriginalLabel] = useState<string | null>(null);
  const [allPersons, setAllPersons] = useState<Friend[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [personNameFilter, setPersonNameFilter] = useState('');
  const [personAffiliationFilter, setPersonAffiliationFilter] = useState('');
  const [personExperienceFilter, setPersonExperienceFilter] = useState('');
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);

  const activeKind = TAB_KIND_MAP[activeTab];
  const isGroupTab = GROUP_KINDS.includes(activeKind);

  const requireActiveKind = (): CommonItemKind => activeKind;

  const refreshItems = useCallback(() => {
    initializeDatabase();
    setMergedLabels(getMergedCommonItemLabels(activeKind));
  }, [activeKind]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

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
      const created = addCommonItemOption(kind, normalized, null);
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

  const activeChipStyle = bundle.infoChipStyles[activeTab] ?? DEFAULT_CHIP_STYLE;

  const getTabAccentColor = (tab: CommonItemTabKey) =>
    bundle.infoChipStyles[tab]?.borderColor ?? themeColors.accent;

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
        {VISIBLE_TAB_ORDER.map((tab) => {
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
      <View style={[styles.bottomRow, { paddingHorizontal: contentPaddingHorizontal }]}>
        <Pressable
          style={styles.infoButton}
          onPress={() => setInfoVisible(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="共通項目についての説明"
        >
          <Ionicons
            name="information-circle-outline"
            size={28}
            color={content.contentTextSecondary}
          />
        </Pressable>
        <AddCircleButton onPress={openAddEditor} accessibilityLabel={`${activeTab}を追加`} />
      </View>
    </>
  );

  return (
    <>
      <TabScreenTemplate
        contentContainerStyle={styles.body}
        header={<ScreenTopBar title="共通項目" onBack={() => router.back()} />}
        safeAreaEdges={['top', 'right', 'bottom', 'left']}
      >
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

      <Modal
        transparent
        animationType="fade"
        visible={infoVisible}
        onRequestClose={() => setInfoVisible(false)}
      >
        <View style={styles.infoOverlay}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setInfoVisible(false)}
            accessibilityLabel="閉じる"
          />
          <View style={[styles.infoCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.infoTitle, contentTextStyle(content)]}>共通項目について</Text>
            <Text style={[styles.infoBody, contentMutedTextStyle(content)]}>
              {[
                '・人物プロフィールで使う所属・経験などの候補をまとめて管理します。',
                '・一覧の絞り込みや、プロフィール編集時の候補に使われます。',
                '・タグをタップすると編集できます。＋で新規追加できます。',
              ].join('\n')}
            </Text>
            <Pressable
              style={[styles.infoClose, contentInputStyle(content)]}
              onPress={() => setInfoVisible(false)}
            >
              <Text style={[styles.infoCloseText, contentTextStyle(content)]}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Simple editor */}
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

      {/* 所属などの対象者選択は、参加者選択と同じシートを使う。 */}
      <EntrySelectorModal
        visible={groupEditorVisible}
        selectorTab={selectorTab}
        onTabChange={setSelectorTab}
        nameFilter={personNameFilter}
        onNameFilterChange={setPersonNameFilter}
        affiliationFilter={personAffiliationFilter}
        onAffiliationFilterChange={setPersonAffiliationFilter}
        experienceFilter={personExperienceFilter}
        onExperienceFilterChange={setPersonExperienceFilter}
        friends={allPersons}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={[]}
        selectedIndividualIds={selectedMemberIds}
        selectedGroupValues={new Set<string>()}
        onToggleIndividual={toggleMember}
        onToggleGroup={() => undefined}
        onCancel={() => setGroupEditorVisible(false)}
        onConfirm={handleSaveGroupEditor}
        enableGroupTab={false}
        initialExpanded
        headerContent={
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            style={[styles.groupNameInputPreview, contentInputStyle(content)]}
            placeholder={`${activeTab}名`}
            placeholderTextColor={content.contentTextSecondary}
            autoCapitalize="none"
          />
        }
        footerContent={
          groupEditingId ? (
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
          ) : null
        }
      />
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
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
  },
  infoButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  infoCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  infoClose: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoCloseText: {
    fontSize: 13,
    fontWeight: '600',
  },
  /* Simple editor */
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

  /* EntrySelectorModal 内のグループ名入力 */
  groupNameInputPreview: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    minHeight: 40,
    marginBottom: 10,
  },
});
