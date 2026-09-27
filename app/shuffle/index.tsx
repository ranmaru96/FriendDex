import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, Radius, Spacing } from '@/constants/theme';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { popCurrentTabScreen } from '@/utils/tabNavigation';
import { PillTabBar, type PillTabItem } from '@/components/screen/PillTabBar';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import { ShuffleLibraryPickerModal } from '@/components/shuffle/ShuffleLibraryPickerModal';
import { ShuffleExcludeToggle } from '@/components/shuffle/ShuffleExcludePicker';
import { friendsFromMemberIds, ShufflePoolMemberPicker } from '@/components/shuffle/ShufflePoolMemberPicker';
import { ShufflePanelHeader } from '@/components/shuffle/ShufflePanelHeader';
import { ShuffleModeInfoButton } from '@/components/shuffle/ShuffleModeInfoButton';
import { ShuffleOrderLayoutButton } from '@/components/shuffle/ShuffleOrderLayoutButton';
import { ShuffleOrderResults } from '@/components/shuffle/ShuffleOrderResults';
import { ShuffleColumnsCycleButton } from '@/components/shuffle/ShuffleColumnsCycleButton';
import { ShuffleResultCards } from '@/components/shuffle/ShuffleResultCards';
import { ShuffleResultTitle } from '@/components/shuffle/ShuffleResultTitle';
import { ShuffleRolePanel } from '@/components/shuffle/ShuffleRolePanel';
import { ShuffleTeamPanel } from '@/components/shuffle/ShuffleTeamPanel';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import {
  deleteShufflePool,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeParticipantFriendIds,
  getMyself,
  getShufflePools,
  initializeDatabase,
  updateShufflePoolLabel,
  upsertShufflePoolByMembers,
} from '../../db';
import type { Friend, ShufflePool } from '../../types';
import { buildParticipantChipDisplays } from '../../utils/episodeHelpers';
import { buildFriendNameById } from '../../utils/moneyLoanHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { useShuffleSession } from '@/hooks/useShuffleSession';
import {
  advanceShuffleRun,
  clampShuffleResultColumns,
  getShuffleRunLabel,
  resetShuffleResultsForMemberChange,
  type ShuffleMode,
  type ShuffleOrderLayout,
  type ShufflePoolDraft,
} from '@/utils/shuffleSession';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import {
  buildDefaultShufflePoolLabel,
  buildShuffleMemberSetKey,
  memberIdsToParticipantEntries,
  pickRandomMembers,
  shuffleAllMemberIds,
} from '../../utils/shuffleHelpers';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import { buildFriendPhotoById } from '@/utils/friendPhoto';

type Option = { label: string; value: string };

const SHUFFLE_MODE_LABELS: Record<ShuffleMode, string> = {
  random: 'ランダム選択',
  order: '並び替え',
  role: '役割分担',
  team: 'チーム分け',
};

const SHUFFLE_TABS: PillTabItem<ShuffleMode>[] = [
  { key: 'random', caption: SHUFFLE_MODE_LABELS.random, icon: 'shuffle-outline' },
  { key: 'order', caption: SHUFFLE_MODE_LABELS.order, icon: 'list-outline' },
  { key: 'role', caption: SHUFFLE_MODE_LABELS.role, icon: 'ribbon-outline' },
  { key: 'team', caption: SHUFFLE_MODE_LABELS.team, icon: 'people-outline' },
];

function buildDraftFromMemberIds(
  memberIds: string[],
  previous: ShufflePoolDraft | null,
  existingLabels: readonly string[]
): ShufflePoolDraft {
  const memberSetChanged =
    previous !== null &&
    buildShuffleMemberSetKey(memberIds) !== buildShuffleMemberSetKey(previous.memberIds);
  const labelIsCustom = memberSetChanged ? false : (previous?.labelIsCustom ?? false);
  return {
    memberIds,
    label: labelIsCustom
      ? (previous?.label.trim() || buildDefaultShufflePoolLabel(existingLabels))
      : buildDefaultShufflePoolLabel(existingLabels),
    labelIsCustom,
  };
}

function draftToActivePool(draft: ShufflePoolDraft | null): ShufflePool | null {
  if (!draft || draft.memberIds.length === 0) {
    return null;
  }
  return {
    id: 'draft',
    label: draft.label,
    labelIsCustom: draft.labelIsCustom,
    memberIds: draft.memberIds,
    createdAt: '',
    lastUsedAt: '',
  };
}

export default function ShuffleScreen() {
  const { colors: appTheme } = useAppTheme();
  const content = useContentColors();
  const [session, setSession] = useShuffleSession();
  const {
    poolDraft,
    shuffleMode,
    pickCount,
    resultColumns,
    resultMemberIds,
    orderResultMemberIds,
    orderLayout = 'wrap',
    orderExcludedMemberIds = [],
    roleDrafts,
    roleAssignments,
    teamCount,
    useRanks,
    rankTiers,
    memberRankById,
    teams,
  } = session;
  const randomRunLabel = getShuffleRunLabel(session, 'random');
  const orderRunLabel = getShuffleRunLabel(session, 'order');
  const roleRunLabel = getShuffleRunLabel(session, 'role');
  const teamRunLabel = getShuffleRunLabel(session, 'team');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pools, setPools] = useState<ShufflePool[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [libraryModalVisible, setLibraryModalVisible] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());
  const [labelEditVisible, setLabelEditVisible] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [labelError, setLabelError] = useState('');
  const [formError, setFormError] = useState('');
  const [shuffleError, setShuffleError] = useState('');
  const [orderExcludeOpen, setOrderExcludeOpen] = useState<boolean | undefined>(undefined);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const poolDraftRef = useRef<ShufflePoolDraft | null>(null);
  poolDraftRef.current = poolDraft;

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);
  const friendsById = useMemo(() => new Map(friends.map((friend) => [friend.id, friend])), [friends]);

  const activePool = useMemo(() => draftToActivePool(poolDraft), [poolDraft]);
  const activeMemberCount = activePool?.memberIds.length ?? 0;
  const draftMemberSetKey = useMemo(
    () =>
      poolDraft && poolDraft.memberIds.length > 0
        ? buildShuffleMemberSetKey(poolDraft.memberIds)
        : '',
    [poolDraft?.memberIds]
  );
  const previousMemberSetKeyRef = useRef(draftMemberSetKey);

  useEffect(() => {
    if (previousMemberSetKeyRef.current === draftMemberSetKey) {
      return;
    }
    previousMemberSetKeyRef.current = draftMemberSetKey;
    setSession((current) => resetShuffleResultsForMemberChange(current));
    setShuffleError('');
  }, [draftMemberSetKey, setSession]);

  useEffect(() => {
    setShuffleError('');
  }, [shuffleMode]);

  const activeMemberChips = useMemo(() => {
    if (!activePool) {
      return [];
    }
    return buildParticipantChipDisplays(
      memberIdsToParticipantEntries(activePool.memberIds),
      friendNameById,
      { friendPhotoById }
    );
  }, [activePool, friendNameById, friendPhotoById]);

  const loadData = useCallback(() => {
    initializeDatabase();
    setFriends(getAllFriendsInDefaultOrder());
    setMyselfId(getMyself());
    setPools(getShufflePools());
    setAffiliationOptions(getDistinctAffiliations().map((value) => ({ label: value, value })));
    setExperienceOptions(getDistinctExperiences().map((value) => ({ label: value, value })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const buildChipsForPool = useCallback(
    (pool: ShufflePool) =>
      buildParticipantChipDisplays(
        memberIdsToParticipantEntries(pool.memberIds),
        friendNameById,
        { friendPhotoById }
      ),
    [friendNameById, friendPhotoById]
  );

  const persistDraftToLibrary = useCallback((): ShufflePool | null => {
    initializeDatabase();
    const draft = poolDraftRef.current;
    if (!draft || draft.memberIds.length === 0) {
      return null;
    }
    const pool = upsertShufflePoolByMembers(draft.memberIds);
    if (!pool) {
      return null;
    }
    if (draft.labelIsCustom) {
      const trimmed = draft.label.trim();
      if (trimmed) {
        updateShufflePoolLabel(pool.id, trimmed);
      }
    }
    setPools(getShufflePools());
    return pool;
  }, []);

  const openLibraryModal = useCallback(() => {
    initializeDatabase();
    setPools(getShufflePools());
    setLibraryModalVisible(true);
  }, []);

  const restoreSelectorFromMemberIds = useCallback((memberIds: string[]) => {
    setSelectedIndividualIds(new Set(memberIds));
    setSelectedGroupValues(new Set());
  }, []);

  const openParticipantSelector = useCallback(() => {
    restoreSelectorFromMemberIds(activePool?.memberIds ?? []);
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  }, [activePool?.memberIds, restoreSelectorFromMemberIds]);

  const handleSelectorCancel = useCallback(() => {
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, []);

  const handleSelectorConfirm = useCallback(() => {
    const drafts: EpisodeParticipantDraft[] = [];
    selectedIndividualIds.forEach((friendId) => {
      drafts.push({ participantType: 'individual', value: friendId });
    });
    selectedGroupValues.forEach((groupValue) => {
      drafts.push({ participantType: 'group', value: groupValue });
    });
    const participantEntries = drafts
      .filter((participant) => participant.value.trim().length > 0)
      .map((participant) => ({
        kind: participant.participantType,
        value: participant.value,
      }));
    const memberIds = getEpisodeParticipantFriendIds({ participantEntries });
    if (memberIds.length === 0) {
      setFormError('');
      setSession((previous) => {
        if (!previous.poolDraft) {
          return previous;
        }
        return resetShuffleResultsForMemberChange({
          ...previous,
          poolDraft: null,
        });
      });
      setSelectorVisible(false);
      setSelectorNameFilter('');
      setSelectorAffiliationFilter('');
      setSelectorExperienceFilter('');
      return;
    }

    setFormError('');
    setSession((previous) => {
      const nextDraft = buildDraftFromMemberIds(
        memberIds,
        previous.poolDraft,
        pools.map((pool) => pool.label)
      );
      const next = { ...previous, poolDraft: nextDraft };
      const previousKey = previous.poolDraft
        ? buildShuffleMemberSetKey(previous.poolDraft.memberIds)
        : '';
      const nextKey = buildShuffleMemberSetKey(nextDraft.memberIds);
      return previousKey === nextKey ? next : resetShuffleResultsForMemberChange(next);
    });
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, [pools, selectedGroupValues, selectedIndividualIds, setSession]);

  const toggleSelectorIndividual = useCallback((friendId: string) => {
    setSelectedIndividualIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  }, []);

  const toggleSelectorGroup = useCallback((groupValue: string) => {
    setSelectedGroupValues((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) next.delete(groupValue);
      else next.add(groupValue);
      return next;
    });
  }, []);

  const handleSelectorReset = useCallback(() => {
    setSelectedIndividualIds(new Set());
    setSelectedGroupValues(new Set());
  }, []);

  const handleImportPool = useCallback((pool: ShufflePool) => {
    setSession((previous) => {
      const nextDraft = {
        memberIds: [...pool.memberIds],
        label: pool.label,
        labelIsCustom: pool.labelIsCustom,
      };
      const next = { ...previous, poolDraft: nextDraft };
      const previousKey = previous.poolDraft
        ? buildShuffleMemberSetKey(previous.poolDraft.memberIds)
        : '';
      const nextKey = buildShuffleMemberSetKey(nextDraft.memberIds);
      return previousKey === nextKey ? next : resetShuffleResultsForMemberChange(next);
    });
    setFormError('');
    setLibraryModalVisible(false);
  }, [setSession]);

  const handleDeletePool = useCallback(
    (pool: ShufflePool) => {
      Alert.alert('削除確認', `「${pool.label}」を履歴から削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            const ok = deleteShufflePool(pool.id);
            if (!ok) {
              Alert.alert('エラー', '削除に失敗しました。');
              return;
            }
            loadData();
          },
        },
      ]);
    },
    [loadData]
  );

  const openLabelEdit = () => {
    if (!poolDraft) {
      return;
    }
    setLabelDraft(poolDraft.label);
    setLabelError('');
    setLabelEditVisible(true);
  };

  const handleSaveLabel = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      setLabelError('名前を入力してください。');
      return;
    }
    setSession((previous) =>
      previous.poolDraft
        ? {
            ...previous,
            poolDraft: {
              ...previous.poolDraft,
              label: trimmed,
              labelIsCustom: true,
            },
          }
        : previous
    );
    setLabelEditVisible(false);
    setLabelError('');
  };

  const decrementPickCount = () => {
    setSession((previous) => ({
      ...previous,
      pickCount: Math.max(1, previous.pickCount - 1),
    }));
    setShuffleError('');
  };

  const incrementPickCount = () => {
    if (!activePool) {
      return;
    }
    setSession((previous) => ({
      ...previous,
      pickCount: Math.min(activePool.memberIds.length, previous.pickCount + 1),
    }));
    setShuffleError('');
  };

  const handleResultColumnsChange = useCallback((next: number) => {
    setSession((previous) => ({
      ...previous,
      resultColumns: clampShuffleResultColumns(next),
    }));
  }, [setSession]);

  const runRandomShuffle = useCallback(() => {
    if (!activePool) {
      setShuffleError('メンバーを選んでからシャッフルしてください。');
      return;
    }
    const maxCount = activePool.memberIds.length;
    if (pickCount < 1 || pickCount > maxCount) {
      setShuffleError(`人数は1〜${maxCount}の範囲で指定してください。`);
      return;
    }
    const picked = pickRandomMembers(activePool.memberIds, pickCount);
    if (picked.length === 0) {
      setShuffleError('シャッフルに失敗しました。');
      return;
    }
    persistDraftToLibrary();
    setSession((previous) =>
      advanceShuffleRun({ ...previous, resultMemberIds: picked }, 'random')
    );
    setShuffleError('');
  }, [activePool, persistDraftToLibrary, pickCount, setSession]);

  const orderExcludeEnabled = orderExcludeOpen ?? orderExcludedMemberIds.length > 0;

  const handleOrderExcludeMembersChange = useCallback((memberIds: string[]) => {
    setSession((previous) => ({ ...previous, orderExcludedMemberIds: memberIds }));
    setShuffleError('');
  }, [setSession]);

  const handleOrderExcludeOpenChange = useCallback((open: boolean) => {
    setOrderExcludeOpen(open);
    if (!open) {
      setSession((previous) => ({ ...previous, orderExcludedMemberIds: [] }));
    }
    setShuffleError('');
  }, [setSession]);

  const runOrderShuffle = useCallback(() => {
    if (!activePool) {
      setShuffleError('メンバーを選んでからシャッフルしてください。');
      return;
    }
    const excluded = new Set(orderExcludedMemberIds);
    const eligibleIds = activePool.memberIds.filter((memberId) => !excluded.has(memberId));
    if (eligibleIds.length === 0) {
      setShuffleError('対象者がいません。対象外を減らしてください。');
      return;
    }
    const ordered = shuffleAllMemberIds(eligibleIds);
    if (ordered.length === 0) {
      setShuffleError('シャッフルに失敗しました。');
      return;
    }
    persistDraftToLibrary();
    setSession((previous) =>
      advanceShuffleRun({ ...previous, orderResultMemberIds: ordered }, 'order')
    );
    setShuffleError('');
  }, [activePool, orderExcludedMemberIds, persistDraftToLibrary, setSession]);

  const handleRoleShuffleComplete = useCallback(() => {
    if (!activePool) {
      return;
    }
    persistDraftToLibrary();
  }, [activePool, persistDraftToLibrary]);

  const handleTeamShuffleComplete = useCallback(() => {
    if (!activePool) {
      return;
    }
    persistDraftToLibrary();
  }, [activePool, persistDraftToLibrary]);

  return (
    <>
      <SubToolScreenTemplate
        title="人物カードシャッフル"
        onBack={popCurrentTabScreen}
        titleTrailing={
          <ShuffleModeInfoButton compact accessibilityLabel="シャッフルの説明" />
        }
        scrollContentStyle={styles.scrollContent}
      >
        <View style={[styles.sectionCard, contentSurfaceStyle(content)]}>
          <View style={styles.poolHeaderRow}>
            <View style={styles.poolHeaderMain}>
              {activePool ? (
                <>
                  <Text style={[styles.poolLabel, contentTextStyle(content)]} numberOfLines={1}>
                    {activePool.label}
                  </Text>
                  <Pressable
                    onPress={openLabelEdit}
                    hitSlop={8}
                    accessibilityLabel="グループ名を編集"
                    accessibilityRole="button"
                  >
                    <Ionicons name="create-outline" size={16} color={content.contentText} />
                  </Pressable>
                  <Text style={[styles.poolMemberCount, contentMutedTextStyle(content)]}>
                    · {activePool.memberIds.length}人
                  </Text>
                </>
              ) : (
                <Text style={[styles.sectionTitle, { color: appTheme.onScreenText }]} numberOfLines={1}>
                  グループ
                </Text>
              )}
            </View>
            <View style={styles.memberActionsRow}>
              <Pressable
                style={[styles.memberActionButton, contentTagStyle(content)]}
                onPress={openParticipantSelector}
              >
                <Ionicons name="people-outline" size={15} color={content.contentText} />
                <Text
                  style={[styles.memberActionButtonText, contentTextStyle(content)]}
                  numberOfLines={1}
                >
                  参加者
                </Text>
              </Pressable>
              <Pressable
                style={[styles.memberActionButton, contentTagStyle(content)]}
                onPress={openLibraryModal}
                accessibilityRole="button"
                accessibilityLabel="履歴"
              >
                <Ionicons name="albums-outline" size={15} color={content.contentText} />
                <Text
                  style={[styles.memberActionButtonText, contentTextStyle(content)]}
                  numberOfLines={1}
                >
                  履歴
                </Text>
              </Pressable>
            </View>
          </View>

          {activePool ? (
            <ParticipantChipList chips={activeMemberChips} compact layout="scroll" />
          ) : (
            <Text style={[styles.emptyHint, contentMutedTextStyle(content)]}>
              参加者を選ぶか、履歴から引用してください。シャッフル実行時に履歴へ保存されます。
            </Text>
          )}

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        </View>

        <PillTabBar
          tabs={SHUFFLE_TABS}
          activeTab={shuffleMode}
          onTabChange={(mode) => setSession((previous) => ({ ...previous, shuffleMode: mode }))}
          padded={false}
        />

        <View style={styles.shuffleSection}>
          {shuffleMode === 'random' ? (
            <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
              <ShufflePanelHeader
                mode="random"
                onShuffle={activePool ? runRandomShuffle : undefined}
              >
                {activePool ? (
                  <>
                    <Text style={[styles.pickCountLabel, contentTextStyle(content)]}>選ぶ人数</Text>
                    <View style={styles.stepper}>
                      <Pressable
                        style={[
                          styles.stepperButton,
                          contentTagStyle(content),
                          pickCount <= 1 && styles.stepperButtonDisabled,
                        ]}
                        onPress={decrementPickCount}
                        disabled={pickCount <= 1}
                      >
                        <Text style={[styles.stepperButtonText, contentTextStyle(content)]}>−</Text>
                      </Pressable>
                      <Text style={[styles.pickCountValue, contentTextStyle(content)]}>{pickCount}</Text>
                      <Pressable
                        style={[
                          styles.stepperButton,
                          contentTagStyle(content),
                          pickCount >= activeMemberCount && styles.stepperButtonDisabled,
                        ]}
                        onPress={incrementPickCount}
                        disabled={pickCount >= activeMemberCount}
                      >
                        <Text style={[styles.stepperButtonText, contentTextStyle(content)]}>＋</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text style={[styles.emptyHintInHeader, contentMutedTextStyle(content)]}>
                    メンバーを選ぶと、ここからランダム抽選できます。
                  </Text>
                )}
              </ShufflePanelHeader>

              {activePool ? (
                <>
                  {shuffleError ? <Text style={styles.formError}>{shuffleError}</Text> : null}

                  {resultMemberIds && resultMemberIds.length > 0 ? (
                    <View style={[styles.resultSection, { borderTopColor: content.contentDivider }]}>
                      <ShuffleResultTitle
                        title={
                          resultMemberIds.length === 1
                            ? '選ばれた人'
                            : `選ばれた${resultMemberIds.length}人`
                        }
                        runLabel={randomRunLabel}
                        trailing={
                          <ShuffleColumnsCycleButton
                            value={resultColumns}
                            onChange={handleResultColumnsChange}
                          />
                        }
                      />
                      <ShuffleResultCards
                        memberIds={resultMemberIds}
                        friendsById={friendsById}
                        myselfId={myselfId}
                        columns={resultColumns}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : shuffleMode === 'order' ? (
            <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
              <ShufflePanelHeader
                mode="order"
                onShuffle={activePool ? runOrderShuffle : undefined}
                accessory={
                  activePool ? (
                    <ShuffleOrderLayoutButton
                      layout={orderLayout}
                      onChange={(next: ShuffleOrderLayout) =>
                        setSession((previous) => ({ ...previous, orderLayout: next }))
                      }
                    />
                  ) : null
                }
              >
                {activePool ? (
                  <ShuffleExcludeToggle
                    open={orderExcludeEnabled}
                    onOpenChange={handleOrderExcludeOpenChange}
                  />
                ) : (
                  <Text style={[styles.emptyHintInHeader, contentMutedTextStyle(content)]}>
                    メンバーを選ぶと、ここから並び替えできます。
                  </Text>
                )}
              </ShufflePanelHeader>

              {activePool ? (
                <>
                  {orderExcludeEnabled ? (
                    <ShufflePoolMemberPicker
                      buttonLabel="対象者選択"
                      eligibleFriends={friendsFromMemberIds(activePool.memberIds, friendsById)}
                      selectedMemberIds={orderExcludedMemberIds}
                      onChange={handleOrderExcludeMembersChange}
                    />
                  ) : null}

                  {shuffleError ? <Text style={styles.formError}>{shuffleError}</Text> : null}

                  {orderResultMemberIds && orderResultMemberIds.length > 0 ? (
                    <View style={[styles.resultSection, { borderTopColor: content.contentDivider }]}>
                      <ShuffleResultTitle title="並び順" runLabel={orderRunLabel} />
                      <ShuffleOrderResults
                        memberIds={orderResultMemberIds}
                        friendNameById={friendNameById}
                        friendPhotoById={friendPhotoById}
                        friendsById={friendsById}
                        layout={orderLayout}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : shuffleMode === 'role' ? (
            <ShuffleRolePanel
              activePool={activePool}
              friendNameById={friendNameById}
              friendPhotoById={friendPhotoById}
              friendsById={friendsById}
              myselfId={myselfId}
              onShuffleComplete={handleRoleShuffleComplete}
              roleDrafts={roleDrafts}
              onRoleDraftsChange={(next) =>
                setSession((previous) => ({
                  ...previous,
                  roleDrafts: typeof next === 'function' ? next(previous.roleDrafts) : next,
                }))
              }
              assignments={roleAssignments}
              onAssignmentsChange={(next) =>
                setSession((previous) =>
                  advanceShuffleRun({ ...previous, roleAssignments: next }, 'role')
                )
              }
              resultColumns={resultColumns}
              onResultColumnsChange={handleResultColumnsChange}
              runLabel={roleRunLabel}
            />
          ) : (
            <ShuffleTeamPanel
              activePool={activePool}
              friendNameById={friendNameById}
              friendPhotoById={friendPhotoById}
              friendsById={friendsById}
              myselfId={myselfId}
              onShuffleComplete={handleTeamShuffleComplete}
              teamCount={teamCount}
              onTeamCountChange={(next) =>
                setSession((previous) => ({
                  ...previous,
                  teamCount: typeof next === 'function' ? next(previous.teamCount) : next,
                }))
              }
              useRanks={useRanks}
              onUseRanksChange={(next) => setSession((previous) => ({ ...previous, useRanks: next }))}
              rankTiers={rankTiers}
              onRankTiersChange={(next) =>
                setSession((previous) => ({
                  ...previous,
                  rankTiers: typeof next === 'function' ? next(previous.rankTiers) : next,
                }))
              }
              memberRankById={memberRankById}
              onMemberRankByIdChange={(next) =>
                setSession((previous) => ({
                  ...previous,
                  memberRankById: typeof next === 'function' ? next(previous.memberRankById) : next,
                }))
              }
              teams={teams}
              onTeamsChange={(next) =>
                setSession((previous) => advanceShuffleRun({ ...previous, teams: next }, 'team'))
              }
              resultColumns={resultColumns}
              onResultColumnsChange={handleResultColumnsChange}
              runLabel={teamRunLabel}
            />
          )}
        </View>
      </SubToolScreenTemplate>

      <EntrySelectorModal
        visible={selectorVisible}
        selectorTab={selectorTab}
        onTabChange={setSelectorTab}
        nameFilter={selectorNameFilter}
        onNameFilterChange={setSelectorNameFilter}
        affiliationFilter={selectorAffiliationFilter}
        onAffiliationFilterChange={setSelectorAffiliationFilter}
        experienceFilter={selectorExperienceFilter}
        onExperienceFilterChange={setSelectorExperienceFilter}
        friends={friends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={affiliationOptions}
        selectedIndividualIds={selectedIndividualIds}
        selectedGroupValues={selectedGroupValues}
        onToggleIndividual={toggleSelectorIndividual}
        onToggleGroup={toggleSelectorGroup}
        onCancel={handleSelectorCancel}
        onConfirm={handleSelectorConfirm}
        onResetSelection={handleSelectorReset}
        onPersonCreated={() => setFriends(getAllFriendsInDefaultOrder())}
        enableGroupTab={false}
      />

      <ShuffleLibraryPickerModal
        visible={libraryModalVisible}
        pools={pools}
        onSelect={handleImportPool}
        onDelete={handleDeletePool}
        onClose={() => setLibraryModalVisible(false)}
        buildChipsForPool={buildChipsForPool}
      />

      <Modal
        visible={labelEditVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLabelEditVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.modalTitle, contentTextStyle(content)]}>グループ名</Text>
            <Text style={[styles.modalHint, contentMutedTextStyle(content)]}>
              名前の変更は、シャッフル実行時に履歴へ保存されます。
            </Text>
            <TextInput
              style={[styles.textInput, contentInputStyle(content)]}
              value={labelDraft}
              onChangeText={setLabelDraft}
              placeholder="名前"
              placeholderTextColor={content.contentTextSecondary}
              autoFocus
            />
            {labelError ? <Text style={styles.formError}>{labelError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalButton} onPress={() => setLabelEditVisible(false)}>
                <Text style={[styles.modalButtonText, contentMutedTextStyle(content)]}>キャンセル</Text>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={handleSaveLabel}>
                <Text style={[styles.modalButtonText, contentTextStyle(content)]}>反映</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 10,
  },
  poolHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  poolHeaderMain: {
    flexGrow: 3,
    flexShrink: 1,
    flexBasis: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  memberActionsRow: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    minWidth: 0,
  },
  memberActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 32,
  },
  memberActionButtonText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  poolLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '800',
  },
  poolMemberCount: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyHintInHeader: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  shuffleSection: {
    gap: 10,
  },
  shuffleCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 12,
  },
  pickCountLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.4,
  },
  stepperButtonText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  pickCountValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
  },
  resultSection: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  formError: {
    fontSize: 12,
    color: '#b91c1c',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 13,
    minHeight: 38,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
