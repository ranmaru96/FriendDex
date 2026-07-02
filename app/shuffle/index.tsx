import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, Radius, Spacing, ScreenHorizontalInset } from '@/constants/theme';
import { subScreenHeaderStyles } from '@/components/screen/subScreenHeaderStyles';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import { ShuffleLibraryPickerModal } from '@/components/shuffle/ShuffleLibraryPickerModal';
import { ShuffleOrderResults } from '@/components/shuffle/ShuffleOrderResults';
import { ShuffleResultCards } from '@/components/shuffle/ShuffleResultCards';
import { ShuffleRolePanel } from '@/components/shuffle/ShuffleRolePanel';
import { ShuffleTeamPanel } from '@/components/shuffle/ShuffleTeamPanel';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import {
  deleteShufflePool,
  getAllFriends,
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
import {
  buildDefaultShufflePoolLabel,
  buildShuffleMemberSetKey,
  memberIdsToParticipantEntries,
  pickRandomMembers,
  shuffleAllMemberIds,
} from '../../utils/shuffleHelpers';

type Option = { label: string; value: string };
type ShuffleMode = 'random' | 'order' | 'role' | 'team';

type ShufflePoolDraft = {
  memberIds: string[];
  label: string;
  labelIsCustom: boolean;
};

const SHUFFLE_MODE_ORDER: ShuffleMode[] = ['random', 'order', 'role', 'team'];

const SHUFFLE_MODE_LABELS: Record<ShuffleMode, string> = {
  random: 'ランダム選択',
  order: '並び替え',
  role: '役割分担',
  team: 'チーム分け',
};

function buildFriendPhotoById(friends: Friend[]): Map<string, string | null> {
  return new Map(friends.map((friend) => [friend.id, friend.photoUri ?? null]));
}

function buildDraftFromMemberIds(
  memberIds: string[],
  previous: ShufflePoolDraft | null,
  friendNameById: Map<string, string>
): ShufflePoolDraft {
  const memberSetChanged =
    previous !== null &&
    buildShuffleMemberSetKey(memberIds) !== buildShuffleMemberSetKey(previous.memberIds);
  const labelIsCustom = memberSetChanged ? false : (previous?.labelIsCustom ?? false);
  return {
    memberIds,
    label: labelIsCustom
      ? (previous?.label.trim() || buildDefaultShufflePoolLabel(memberIds, friendNameById))
      : buildDefaultShufflePoolLabel(memberIds, friendNameById),
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
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pools, setPools] = useState<ShufflePool[]>([]);
  const [poolDraft, setPoolDraft] = useState<ShufflePoolDraft | null>(null);
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
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>('random');
  const [pickCount, setPickCount] = useState(1);
  const [resultMemberIds, setResultMemberIds] = useState<string[] | null>(null);
  const [orderResultMemberIds, setOrderResultMemberIds] = useState<string[] | null>(null);
  const [shuffleError, setShuffleError] = useState('');
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

  useEffect(() => {
    if (!activePool) {
      setPickCount(1);
      setResultMemberIds(null);
      setOrderResultMemberIds(null);
      setShuffleError('');
      return;
    }
    setPickCount((current) => Math.min(Math.max(1, current), activePool.memberIds.length));
    setResultMemberIds(null);
    setOrderResultMemberIds(null);
    setShuffleError('');
  }, [activePool, draftMemberSetKey]);

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
    setFriends(getAllFriends());
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
      setFormError('参加者を1人以上選んでください。');
      setSelectorVisible(false);
      return;
    }

    setFormError('');
    setPoolDraft((previous) => buildDraftFromMemberIds(memberIds, previous, friendNameById));
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, [friendNameById, selectedGroupValues, selectedIndividualIds]);

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

  const handleImportPool = useCallback((pool: ShufflePool) => {
    setPoolDraft({
      memberIds: [...pool.memberIds],
      label: pool.label,
      labelIsCustom: pool.labelIsCustom,
    });
    setFormError('');
    setLibraryModalVisible(false);
  }, []);

  const handleDeletePool = useCallback(
    (pool: ShufflePool) => {
      Alert.alert('削除確認', `「${pool.label}」をライブラリから削除しますか？`, [
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
    setPoolDraft((previous) =>
      previous
        ? {
            ...previous,
            label: trimmed,
            labelIsCustom: true,
          }
        : null
    );
    setLabelEditVisible(false);
    setLabelError('');
  };

  const decrementPickCount = () => {
    setPickCount((current) => Math.max(1, current - 1));
    setShuffleError('');
  };

  const incrementPickCount = () => {
    if (!activePool) {
      return;
    }
    setPickCount((current) => Math.min(activePool.memberIds.length, current + 1));
    setShuffleError('');
  };

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
    setResultMemberIds(picked);
    setShuffleError('');
  }, [activePool, persistDraftToLibrary, pickCount]);

  const runOrderShuffle = useCallback(() => {
    if (!activePool) {
      setShuffleError('メンバーを選んでからシャッフルしてください。');
      return;
    }
    const ordered = shuffleAllMemberIds(activePool.memberIds);
    if (ordered.length === 0) {
      setShuffleError('シャッフルに失敗しました。');
      return;
    }
    persistDraftToLibrary();
    setOrderResultMemberIds(ordered);
    setShuffleError('');
  }, [activePool, persistDraftToLibrary]);

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
    <SafeAreaView style={styles.safeArea}>
      <View style={subScreenHeaderStyles.bar}>
        <Pressable style={subScreenHeaderStyles.sideBack} onPress={() => router.back()} hitSlop={8}>
          <Text style={subScreenHeaderStyles.backText}>‹ 戻る</Text>
        </Pressable>
        <Text style={subScreenHeaderStyles.title} numberOfLines={1}>
          人物カードシャッフル
        </Text>
        <View style={subScreenHeaderStyles.side} />
      </View>

      <View style={styles.modeHeader}>
        <View style={styles.tabRow}>
          {SHUFFLE_MODE_ORDER.map((mode) => {
            const selected = shuffleMode === mode;
            return (
              <Pressable
                key={mode}
                style={[styles.tabButton, selected && styles.tabButtonSelected]}
                onPress={() => setShuffleMode(mode)}
              >
                <Text
                  style={[styles.tabButtonText, selected && styles.tabButtonTextSelected]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {SHUFFLE_MODE_LABELS[mode]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.sectionCard}>
          {activePool ? (
            <>
              <View style={styles.poolHeaderRow}>
                <View style={styles.poolHeaderMain}>
                  <Text style={styles.poolLabel} numberOfLines={1}>
                    {activePool.label}
                  </Text>
                  <Pressable
                    onPress={openLabelEdit}
                    hitSlop={8}
                    accessibilityLabel="集団の名前を編集"
                    accessibilityRole="button"
                  >
                    <Ionicons name="create-outline" size={18} color={Theme.accent} />
                  </Pressable>
                  <Text style={styles.poolMemberCount}>· {activePool.memberIds.length}人</Text>
                </View>
              </View>
              <ParticipantChipList chips={activeMemberChips} compact layout="scroll" />
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>メンバー</Text>
              <Text style={styles.emptyHint}>
                参加者を選ぶか、ライブラリから引用してください。シャッフル実行時にライブラリへ保存されます。
              </Text>
            </>
          )}

          <View style={styles.memberActionsRow}>
            <Pressable style={styles.memberActionButton} onPress={openParticipantSelector}>
              <Ionicons name="people-outline" size={18} color={Theme.textPrimary} />
              <Text style={styles.memberActionButtonText}>参加者</Text>
            </Pressable>
            <Pressable style={styles.memberActionButton} onPress={openLibraryModal}>
              <Ionicons name="albums-outline" size={18} color={Theme.textPrimary} />
              <Text style={styles.memberActionButtonText}>ライブラリ</Text>
            </Pressable>
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        </View>

        <View style={styles.shuffleSection}>
          {shuffleMode === 'random' ? (
            <View style={styles.shuffleCard}>
              {!activePool ? (
                <Text style={styles.emptyHint}>メンバーを選ぶと、ここからランダム抽選できます。</Text>
              ) : (
                <>
                  <View style={styles.pickCountRow}>
                    <Text style={styles.pickCountLabel}>選ぶ人数</Text>
                    <View style={styles.stepper}>
                      <Pressable
                        style={[styles.stepperButton, pickCount <= 1 && styles.stepperButtonDisabled]}
                        onPress={decrementPickCount}
                        disabled={pickCount <= 1}
                      >
                        <Text style={styles.stepperButtonText}>−</Text>
                      </Pressable>
                      <Text style={styles.pickCountValue}>{pickCount}</Text>
                      <Pressable
                        style={[
                          styles.stepperButton,
                          pickCount >= activeMemberCount && styles.stepperButtonDisabled,
                        ]}
                        onPress={incrementPickCount}
                        disabled={pickCount >= activeMemberCount}
                      >
                        <Text style={styles.stepperButtonText}>＋</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.pickCountMeta}>／ {activeMemberCount}人</Text>
                  </View>

                  <Pressable style={styles.shuffleButton} onPress={runRandomShuffle}>
                    <Text style={styles.shuffleButtonText}>シャッフル</Text>
                  </Pressable>

                  {shuffleError ? <Text style={styles.formError}>{shuffleError}</Text> : null}

                  {resultMemberIds && resultMemberIds.length > 0 ? (
                    <View style={styles.resultSection}>
                      <Text style={styles.resultTitle}>
                        {resultMemberIds.length === 1 ? '選ばれた人' : `選ばれた${resultMemberIds.length}人`}
                      </Text>
                      <ShuffleResultCards
                        memberIds={resultMemberIds}
                        friendsById={friendsById}
                        myselfId={myselfId}
                      />
                      <Pressable style={styles.reshuffleButton} onPress={runRandomShuffle}>
                        <Text style={styles.reshuffleButtonText}>もう一度シャッフル</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : shuffleMode === 'order' ? (
            <View style={styles.shuffleCard}>
              {!activePool ? (
                <Text style={styles.emptyHint}>メンバーを選ぶと、ここから並び替えできます。</Text>
              ) : (
                <>
                  <Text style={styles.orderHint}>全員をランダムな順番に並べ替えます。</Text>
                  <Pressable style={styles.shuffleButton} onPress={runOrderShuffle}>
                    <Text style={styles.shuffleButtonText}>シャッフル</Text>
                  </Pressable>

                  {shuffleError ? <Text style={styles.formError}>{shuffleError}</Text> : null}

                  {orderResultMemberIds && orderResultMemberIds.length > 0 ? (
                    <View style={styles.resultSection}>
                      <Text style={styles.resultTitle}>並び順</Text>
                      <ShuffleOrderResults
                        memberIds={orderResultMemberIds}
                        friendNameById={friendNameById}
                        friendPhotoById={friendPhotoById}
                      />
                      <Pressable style={styles.reshuffleButton} onPress={runOrderShuffle}>
                        <Text style={styles.reshuffleButtonText}>もう一度シャッフル</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : shuffleMode === 'role' ? (
            <ShuffleRolePanel
              activePool={activePool}
              friendNameById={friendNameById}
              friendPhotoById={friendPhotoById}
              friendsById={friendsById}
              myselfId={myselfId}
              onShuffleComplete={handleRoleShuffleComplete}
            />
          ) : (
            <ShuffleTeamPanel
              activePool={activePool}
              friendNameById={friendNameById}
              friendPhotoById={friendPhotoById}
              friendsById={friendsById}
              myselfId={myselfId}
              onShuffleComplete={handleTeamShuffleComplete}
            />
          )}
        </View>
      </ScrollView>

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
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>集団の名前</Text>
            <Text style={styles.modalHint}>名前の変更は、シャッフル実行時にライブラリへ保存されます。</Text>
            <TextInput
              style={styles.textInput}
              value={labelDraft}
              onChangeText={setLabelDraft}
              placeholder="名前"
              placeholderTextColor={Theme.inputPlaceholder}
              autoFocus
            />
            {labelError ? <Text style={styles.formError}>{labelError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalButton} onPress={() => setLabelEditVisible(false)}>
                <Text style={styles.modalButtonText}>キャンセル</Text>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={handleSaveLabel}>
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>反映</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.screenBase,
  },
  modeHeader: {
    paddingHorizontal: ScreenHorizontalInset,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Theme.screenBase,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  scrollContent: {
    paddingHorizontal: ScreenHorizontalInset,
    paddingTop: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  sectionCard: {
    backgroundColor: Theme.bgSurface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 10,
  },
  poolHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  poolHeaderMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  memberActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  memberActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Theme.searchFieldBorder,
    borderRadius: Radius.sm,
    backgroundColor: Theme.card,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  memberActionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  poolLabel: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: Theme.textPrimary,
  },
  poolMemberCount: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  emptyHint: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  shuffleSection: {
    gap: 10,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Theme.searchFieldBorder,
    borderRadius: Radius.md,
    backgroundColor: Theme.card,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  tabButtonSelected: {
    borderColor: Theme.accent,
    backgroundColor: Theme.accentLight,
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  tabButtonTextSelected: {
    color: Theme.accent,
  },
  shuffleCard: {
    backgroundColor: Theme.bgSurface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 12,
  },
  orderHint: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  pickCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  pickCountLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textPrimary,
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
    borderColor: Theme.searchFieldBorder,
    backgroundColor: Theme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.4,
  },
  stepperButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: Theme.textPrimary,
    lineHeight: 22,
  },
  pickCountValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: Theme.textPrimary,
  },
  pickCountMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  shuffleButton: {
    backgroundColor: Theme.accent,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shuffleButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.onAccent,
  },
  resultSection: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.textPrimary,
    textAlign: 'center',
  },
  reshuffleButton: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: Theme.accent,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Theme.accentLight,
  },
  reshuffleButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.accent,
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
    backgroundColor: Theme.card,
    borderRadius: Radius.md,
    padding: 14,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  modalHint: {
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 17,
  },
  textInput: {
    backgroundColor: Theme.bgSurface,
    borderColor: Theme.searchFieldBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    color: Theme.textPrimary,
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
    color: Theme.textSecondary,
  },
  modalButtonTextPrimary: {
    color: Theme.accent,
  },
});
