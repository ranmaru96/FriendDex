import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { SearchArea, SearchAreaDivider, SearchAreaRow, SearchAreaSelectTrigger, SearchAreaTextInputField } from '@/components/ui/SearchArea';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import { ListItemGroup } from '@/components/ui/ListItemGroup';
import { ListScreenTemplate } from '@/components/screen-templates';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  contentMutedTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { EpisodeFormOverlay } from '@/components/episode/EpisodeFormOverlay';
import { EpisodeListCard } from '@/components/episode/EpisodeListCard';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { AddCircleButton } from '@/components/AddCircleButton';
import type { Option } from '@/components/episode/types';
import { useEpisodeForm } from '@/hooks/useEpisodeForm';
import { usePersistedFilter, FILTER_KEYS } from '@/hooks/usePersistedFilter';
import {
  DEFAULT_EPISODE_LIST_FILTER,
  isEpisodeListFilterState,
} from '@/utils/persistedFilterTypes';
import {
  createEpisode,
  deleteEpisode,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeListPhotoUrisMap,
  getEpisodeParticipantFriendIds,
  getMergedEpisodeTagLabels,
  getMergedLocationTagLabels,
  getMyself,
  initializeDatabase,
  updateEpisode,
} from '../db';
import { Episode, EpisodeParticipant, Friend } from '../types';
import {
  buildParticipantChips,
  canManageEpisode,
  compareEpisodesByEventDateTime,
  friendsExcludingSelf,
  normalizeEpisodeTag,
  resolveEpisodeRecordOwnerId,
} from '../utils/episodeHelpers';
import {
  EVENT_CREATE_FAILED_MESSAGE,
  resolveEpisodeSaveEventId,
} from '../utils/episodeEventLinking';
import { registerSavedEpisodeTag, registerSavedLocationTag } from '../utils/episodeTagMaster';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';

type EpisodeRow = { episode: Episode; recordOwnerId: string };

function collectUniqueEpisodes(friends: Friend[]): EpisodeRow[] {
  const sortedFriends = [...friends].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const byId = new Map<string, EpisodeRow>();
  sortedFriends.forEach((friend) => {
    friend.episodes.forEach((episode) => {
      const existing = byId.get(episode.id);
      const candidateIsAuthor = Boolean(
        episode.authorFriendId && friend.id === episode.authorFriendId
      );
      if (!existing) {
        byId.set(episode.id, {
          episode,
          recordOwnerId: resolveEpisodeRecordOwnerId(episode, friend.id),
        });
        return;
      }
      const existingIsAuthor = Boolean(
        existing.episode.authorFriendId &&
          existing.recordOwnerId === existing.episode.authorFriendId
      );
      // 著者側のコピーを優先（他プロフィールに古い参加者一覧が残っていると絞り込みが効かない）
      if (candidateIsAuthor && !existingIsAuthor) {
        byId.set(episode.id, {
          episode,
          recordOwnerId: resolveEpisodeRecordOwnerId(episode, friend.id),
        });
        return;
      }
      if (
        !existingIsAuthor &&
        !candidateIsAuthor &&
        (episode.participantEntries?.length ?? 0) >
          (existing.episode.participantEntries?.length ?? 0)
      ) {
        byId.set(episode.id, {
          episode,
          recordOwnerId: resolveEpisodeRecordOwnerId(episode, friend.id),
        });
      }
    });
  });
  return Array.from(byId.values()).sort((a, b) =>
    compareEpisodesByEventDateTime(a.episode, b.episode)
  );
}

function buildFriendNameById(friends: Friend[]): Map<string, string> {
  return new Map(friends.map((f) => [f.id, f.name]));
}

function buildFriendPhotoById(friends: Friend[]): Map<string, string | null> {
  return new Map(friends.map((f) => [f.id, f.photoUri ?? null]));
}

export default function EpisodeScreen() {
  const kit = useUiKit();
  const content = useContentColors();
  const listItemEmbedded = kit.listItemStyle === 'panelSections';
  const isEdgeToEdge = kit.episodeListPaddingHorizontal === 0;
  const router = useRouter();
  const params = useLocalSearchParams<{
    editEpisodeId?: string;
    ownerId?: string;
    createForEventId?: string;
  }>();
  const pendingEditKeyRef = useRef<string | null>(null);
  const pendingCreateForEventKeyRef = useRef<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [episodeTagOptions, setEpisodeTagOptions] = useState<Option[]>([]);
  const [locationTagOptions, setLocationTagOptions] = useState<Option[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [photoUrisByEpisodeId, setPhotoUrisByEpisodeId] = useState<Map<string, string[]>>(
    () => new Map()
  );

  const [isFormVisible, setIsFormVisible] = useState(false);

  const [episodeListFilter, setEpisodeListFilter] = usePersistedFilter(
    FILTER_KEYS.episodeList,
    DEFAULT_EPISODE_LIST_FILTER,
    { validate: isEpisodeListFilterState }
  );
  const filterTitle = episodeListFilter.title;
  const filterTag = episodeListFilter.tag;
  const filterParticipants = episodeListFilter.participants;
  const setFilterTitle = useCallback(
    (title: string) => setEpisodeListFilter((prev) => ({ ...prev, title })),
    [setEpisodeListFilter]
  );
  const setFilterTag = useCallback(
    (tag: string) => setEpisodeListFilter((prev) => ({ ...prev, tag })),
    [setEpisodeListFilter]
  );
  const setFilterParticipants = useCallback(
    (participants: EpisodeParticipantDraft[]) =>
      setEpisodeListFilter((prev) => ({ ...prev, participants })),
    [setEpisodeListFilter]
  );

  const [tagFilterModalVisible, setTagFilterModalVisible] = useState(false);
  const [filterSelectorVisible, setFilterSelectorVisible] = useState(false);
  const [filterSelectorTab, setFilterSelectorTab] = useState<'individual' | 'group'>('individual');
  const [filterSelectedIndividualIds, setFilterSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [filterSelectedGroupValues, setFilterSelectedGroupValues] = useState<Set<string>>(new Set());
  const [filterSelectorNameFilter, setFilterSelectorNameFilter] = useState('');
  const [filterSelectorAffiliationFilter, setFilterSelectorAffiliationFilter] = useState('');
  const [filterSelectorExperienceFilter, setFilterSelectorExperienceFilter] = useState('');

  const hiddenParticipantIds = useMemo(
    () => (myselfId ? [myselfId] : []),
    [myselfId]
  );

  const selectorFriends = useMemo(
    () => friendsExcludingSelf(friends, myselfId),
    [friends, myselfId]
  );

  const episodeForm = useEpisodeForm({
    friends,
    hiddenParticipantIds,
  });

  const loadData = useCallback(() => {
    initializeDatabase();
    const nextFriends = getAllFriendsInDefaultOrder();
    setFriends(nextFriends);
    setAffiliationOptions(getDistinctAffiliations().map((v) => ({ label: v, value: v })));
    setExperienceOptions(getDistinctExperiences().map((v) => ({ label: v, value: v })));
    setEpisodeTagOptions(getMergedEpisodeTagLabels().map((v) => ({ label: v, value: v })));
    setLocationTagOptions(getMergedLocationTagLabels().map((v) => ({ label: v, value: v })));
    setMyselfId(getMyself());
    setPhotoUrisByEpisodeId(
      getEpisodeListPhotoUrisMap(collectUniqueEpisodes(nextFriends).map((row) => row.episode.id))
    );
  }, []);

  const pendingEditEpisodeId = useMemo(() => {
    if (Array.isArray(params.editEpisodeId)) return params.editEpisodeId[0] ?? '';
    return params.editEpisodeId ?? '';
  }, [params.editEpisodeId]);

  const pendingEditOwnerId = useMemo(() => {
    if (Array.isArray(params.ownerId)) return params.ownerId[0] ?? '';
    return params.ownerId ?? '';
  }, [params.ownerId]);

  const createForEventId = useMemo(() => {
    if (Array.isArray(params.createForEventId)) return params.createForEventId[0] ?? '';
    return params.createForEventId ?? '';
  }, [params.createForEventId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      if (!pendingEditEpisodeId || !pendingEditOwnerId) {
        pendingEditKeyRef.current = null;
      }
    }, [loadData, pendingEditEpisodeId, pendingEditOwnerId])
  );

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);
  const episodeRows = useMemo(() => collectUniqueEpisodes(friends), [friends]);

  const restoreFilterSelectorFromParticipants = useCallback((drafts: EpisodeParticipantDraft[]) => {
    const individuals = new Set<string>();
    const groups = new Set<string>();
    drafts.forEach((participant) => {
      if (!participant.value.trim()) return;
      if (participant.participantType === 'individual') {
        if (myselfId && participant.value === myselfId) {
          return;
        }
        individuals.add(participant.value);
      } else {
        groups.add(participant.value);
      }
    });
    setFilterSelectedIndividualIds(individuals);
    setFilterSelectedGroupValues(groups);
  }, [myselfId]);

  const openFilterParticipantSelector = useCallback(() => {
    restoreFilterSelectorFromParticipants(
      filterParticipants.filter((p) => p.participantType === 'individual')
    );
    setFilterSelectorTab('individual');
    setFilterSelectorNameFilter('');
    setFilterSelectorAffiliationFilter('');
    setFilterSelectorExperienceFilter('');
    setFilterSelectorVisible(true);
  }, [filterParticipants, restoreFilterSelectorFromParticipants]);

  const handleFilterSelectorCancel = useCallback(() => {
    setFilterSelectorVisible(false);
    setFilterSelectorNameFilter('');
    setFilterSelectorAffiliationFilter('');
    setFilterSelectorExperienceFilter('');
  }, []);

  const handleFilterSelectorConfirm = useCallback(() => {
    const nextParticipants: EpisodeParticipantDraft[] = [];
    filterSelectedIndividualIds.forEach((friendId) => {
      if (myselfId && friendId === myselfId) {
        return;
      }
      nextParticipants.push({ participantType: 'individual', value: friendId });
    });
    setFilterParticipants(nextParticipants);
    setFilterSelectedGroupValues(new Set());
    setFilterSelectorVisible(false);
    setFilterSelectorNameFilter('');
    setFilterSelectorAffiliationFilter('');
    setFilterSelectorExperienceFilter('');
  }, [filterSelectedIndividualIds, myselfId, setFilterParticipants]);

  const toggleFilterSelectorIndividual = useCallback((friendId: string) => {
    if (myselfId && friendId === myselfId) {
      return;
    }
    setFilterSelectedIndividualIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  }, [myselfId]);

  const toggleFilterSelectorGroup = useCallback((groupValue: string) => {
    setFilterSelectedGroupValues((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) next.delete(groupValue);
      else next.add(groupValue);
      return next;
    });
  }, []);

  const filterParticipantEntries = useMemo((): EpisodeParticipant[] => {
    return filterParticipants
      .filter((participant) => participant.value.trim().length > 0)
      .filter((participant) => !(myselfId && participant.participantType === 'individual' && participant.value === myselfId))
      .map((participant) => ({
        kind: participant.participantType,
        value: participant.value,
      }));
  }, [filterParticipants, myselfId]);

  const filteredEpisodeRows = useMemo(() => {
    const normalizedTitle = filterTitle.trim().toLowerCase();
    const normalizedFilterTag = normalizeEpisodeTag(filterTag);
    const filterFriendIds = new Set(
      getEpisodeParticipantFriendIds({ participantEntries: filterParticipantEntries })
    );
    return episodeRows.filter((row) => {
      if (normalizedTitle && !row.episode.title.toLowerCase().includes(normalizedTitle)) {
        return false;
      }
      if (normalizedFilterTag && normalizeEpisodeTag(row.episode.tag) !== normalizedFilterTag) {
        return false;
      }
      if (filterFriendIds.size > 0) {
        const episodeFriendIds = getEpisodeParticipantFriendIds(row.episode);
        const matches = [...filterFriendIds].every((id) => episodeFriendIds.includes(id));
        if (!matches) {
          return false;
        }
      }
      return true;
    });
  }, [episodeRows, filterParticipantEntries, filterTag, filterTitle]);

  const filterParticipantSummary = useMemo(() => {
    const labels = filterParticipants
      .filter((participant) => participant.value.trim().length > 0)
      .filter((participant) => !(myselfId && participant.participantType === 'individual' && participant.value === myselfId))
      .map((participant) =>
        participant.participantType === 'individual'
          ? friendNameById.get(participant.value) ?? participant.value
          : participant.value
      );
    if (labels.length === 0) {
      return '';
    }
    if (labels.length <= 2) {
      return labels.join('、');
    }
    return `${labels.length}件`;
  }, [filterParticipants, friendNameById, myselfId]);

  const openCreateForm = () => {
    if (!myselfId) {
      Alert.alert('案内', '本人が設定されていません。');
      return;
    }
    episodeForm.reset();
    setIsFormVisible(true);
  };

  const startEditEpisode = (row: EpisodeRow) => {
    episodeForm.loadFromEpisode(row.episode);
    setIsFormVisible(true);
  };

  useEffect(() => {
    if (!createForEventId || !myselfId) {
      return;
    }
    if (pendingCreateForEventKeyRef.current === createForEventId) {
      return;
    }
    const ok = episodeForm.prefillFromEvent(createForEventId);
    if (!ok) {
      Alert.alert('エラー', '予定が見つかりません。');
      return;
    }
    pendingCreateForEventKeyRef.current = createForEventId;
    setIsFormVisible(true);
    router.setParams({ createForEventId: undefined });
  }, [createForEventId, episodeForm, myselfId, router]);

  useEffect(() => {
    if (!pendingEditEpisodeId || !pendingEditOwnerId || episodeRows.length === 0) {
      return;
    }
    const key = `${pendingEditOwnerId}:${pendingEditEpisodeId}`;
    if (pendingEditKeyRef.current === key) {
      return;
    }
    const row = episodeRows.find(
      (item) => item.episode.id === pendingEditEpisodeId && item.recordOwnerId === pendingEditOwnerId
    );
    if (!row) {
      return;
    }
    pendingEditKeyRef.current = key;
    startEditEpisode(row);
  }, [episodeRows, pendingEditEpisodeId, pendingEditOwnerId]);

  const handleDeleteEpisode = (row: EpisodeRow) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const ownerId = resolveEpisodeRecordOwnerId(row.episode, row.recordOwnerId);
          const deleted = deleteEpisode(ownerId, row.episode.id);
          if (!deleted) {
            Alert.alert('エラー', 'エピソードの削除に失敗しました。');
            return;
          }
          if (episodeForm.editingEpisodeId === row.episode.id) {
            episodeForm.reset();
            setIsFormVisible(false);
          }
          loadData();
        },
      },
    ]);
  };

  const handleSaveEpisode = () => {
    if (!myselfId) {
      episodeForm.setFormError('本人が設定されていません。');
      return;
    }
    const payload = episodeForm.buildSavePayload();
    if (!payload) {
      return;
    }
    const resolved = resolveEpisodeSaveEventId(payload, () => {
      Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE);
      episodeForm.setFormError(EVENT_CREATE_FAILED_MESSAGE);
    });
    if (!resolved.ok) {
      return;
    }
    const { createLinkedEvent: _createLinkedEvent, eventId: _formEventId, ...episodeFields } =
      payload;
    const episodeInput = {
      ...episodeFields,
      eventId: resolved.eventId,
      pendingReview: false,
    };

    if (episodeForm.editingEpisodeId) {
      const updated = updateEpisode(myselfId, episodeForm.editingEpisodeId, episodeInput);
      if (!updated) {
        episodeForm.setFormError('エピソードの更新に失敗しました。');
        return;
      }
      registerSavedEpisodeTag(episodeInput.tag);
      registerSavedLocationTag(episodeInput.locationTag);
      episodeForm.persistPhotos(episodeForm.editingEpisodeId, true);
      episodeForm.reset();
      setIsFormVisible(false);
      loadData();
      return;
    }

    const created = createEpisode(episodeInput);
    if (!created) {
      episodeForm.setFormError('エピソードの追加に失敗しました。');
      return;
    }
    registerSavedEpisodeTag(episodeInput.tag);
    registerSavedLocationTag(episodeInput.locationTag);
    episodeForm.persistPhotos(created.id, false);
    episodeForm.reset();
    setIsFormVisible(false);
    loadData();
  };

  return (
    <>
      <ListScreenTemplate
        fab={
          <AddCircleButton
            style={styles.fab}
            onPress={openCreateForm}
            disabled={!myselfId}
            accessibilityLabel="エピソードを追加"
          />
        }
      >
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={[
            styles.mainScrollContent,
            { paddingHorizontal: kit.episodeListPaddingHorizontal, paddingBottom: 80 },
            isEdgeToEdge ? styles.mainScrollContentEdgeToEdge : null,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SearchArea style={isEdgeToEdge ? styles.searchAreaEdgeToEdge : undefined}>
            <SearchAreaRow>
              <SearchAreaTextInputField
                label="タイトル"
                value={filterTitle}
                onChangeText={setFilterTitle}
                autoCapitalize="none"
              />
              <SearchAreaSelectTrigger
                label="参加者"
                value={filterParticipantSummary ? 'set' : ''}
                displayText={filterParticipantSummary}
                onPress={openFilterParticipantSelector}
              />
              <SearchAreaSelectTrigger
                label="タグ"
                value={filterTag}
                displayText={filterTag}
                onPress={() => setTagFilterModalVisible(true)}
              />
            </SearchAreaRow>
          </SearchArea>
          <SearchAreaDivider />

          {!myselfId ? <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>本人が設定されていません</Text> : null}
          {filteredEpisodeRows.length === 0 ? (
            <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
              {episodeRows.length === 0
                ? '登録されたエピソードはありません。'
                : '条件に一致するエピソードはありません。'}
            </Text>
          ) : (
            <ListItemGroup gap={kit.episodeListCardGap}>
              {filteredEpisodeRows.map((row) => {
                const chips = buildParticipantChips(row.episode, friendNameById, {
                  excludeFriendIds: myselfId ? [myselfId] : [],
                  friendPhotoById,
                });
                const authorId = resolveEpisodeRecordOwnerId(row.episode, row.recordOwnerId);
                const canManage = canManageEpisode(row.episode, row.recordOwnerId, myselfId);
                const posterName = canManage
                  ? null
                  : friendNameById.get(row.episode.authorFriendId) ?? row.episode.authorFriendId;
                const openDetail = () =>
                  router.push({
                    pathname: '/episode-detail',
                    params: { episodeId: row.episode.id, ownerId: authorId },
                  });
                return (
                  <EpisodeListCard
                    key={row.episode.id}
                    embedded={listItemEmbedded}
                    title={row.episode.title}
                    date={row.episode.date}
                    episodeTag={row.episode.tag}
                    locationTag={row.episode.locationTag}
                    chips={chips}
                    visibilityMode={canManage ? row.episode.visibilityMode : undefined}
                    posterName={posterName}
                    photoUris={photoUrisByEpisodeId.get(row.episode.id) ?? []}
                    unfilled={row.episode.pendingReview === true}
                    onPress={openDetail}
                  />
                );
              })}
            </ListItemGroup>
          )}
        </ScrollView>
      </ListScreenTemplate>

      <EpisodeFormOverlay
        visible={isFormVisible}
        form={episodeForm}
        friends={friends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        episodeTagOptions={episodeTagOptions}
        locationTagOptions={locationTagOptions}
        onClose={() => {
          episodeForm.reset();
          setIsFormVisible(false);
        }}
        onSave={handleSaveEpisode}
        onPersonCreated={() => setFriends(getAllFriendsInDefaultOrder())}
      />

      <EntrySelectorModal
        visible={filterSelectorVisible}
        selectorTab={filterSelectorTab}
        onTabChange={setFilterSelectorTab}
        nameFilter={filterSelectorNameFilter}
        onNameFilterChange={setFilterSelectorNameFilter}
        affiliationFilter={filterSelectorAffiliationFilter}
        onAffiliationFilterChange={setFilterSelectorAffiliationFilter}
        experienceFilter={filterSelectorExperienceFilter}
        onExperienceFilterChange={setFilterSelectorExperienceFilter}
        friends={selectorFriends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={affiliationOptions}
        selectedIndividualIds={filterSelectedIndividualIds}
        selectedGroupValues={filterSelectedGroupValues}
        onToggleIndividual={toggleFilterSelectorIndividual}
        onToggleGroup={toggleFilterSelectorGroup}
        onCancel={handleFilterSelectorCancel}
        onConfirm={handleFilterSelectorConfirm}
        onPersonCreated={() => setFriends(getAllFriendsInDefaultOrder())}
        enableGroupTab={false}
      />

      <OptionPickerModal
        visible={tagFilterModalVisible}
        label="タグ"
        value={filterTag}
        options={episodeTagOptions}
        onValueChange={setFilterTag}
        onClose={() => setTagFilterModalVisible(false)}
        clearLabel="すべて"
      />
    </>
  );
}

const SELECTOR_GAP = 6;

const styles = StyleSheet.create({
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 120,
  },
  mainScrollContentEdgeToEdge: {
    gap: Spacing.sm,
  },
  searchAreaEdgeToEdge: {
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderRadius: 0,
  },
  emptyText: {
    fontSize: 14,
    color: Theme.textSecondary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
  },
  formOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f1f5f9',
    zIndex: 100,
    elevation: 100,
  },
  formOverlayScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  formOverlayScrollContent: {
    paddingBottom: 28,
  },
  formOverlayTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  episodeFormCard: {
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: 10,
    backgroundColor: Theme.inputBg,
  },
  episodeTitleDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  episodeInput: {
    minHeight: 38,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.bgSurface,
    color: '#0f172a',
    paddingHorizontal: 10,
    fontSize: 14,
  },
  episodeTitleInput: {
    flex: 1,
  },
  episodeDateInput: {
    width: 130,
    justifyContent: 'center',
  },
  episodeDateText: {
    fontSize: Typography.base,
    color: '#111827',
  },
  episodeDatePlaceholder: {
    fontSize: Typography.base,
    color: '#94a3b8',
  },
  datePickerWrap: {
    marginBottom: 8,
  },
  datePickerSelf: {
    alignSelf: 'flex-end',
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
    marginTop: 8,
  },
  datePickerDoneText: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: Typography.base,
  },
  ownerRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ownerRoleLabel: {
    fontSize: Typography.base,
    color: '#334155',
    fontWeight: '700',
  },
  roleToggleButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roleToggleButtonActive: {
    backgroundColor: '#67e8f9',
    borderColor: '#0891b2',
  },
  roleToggleButtonText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  roleToggleButtonTextActive: {
    color: '#083344',
  },
  episodeParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  episodeParticipantLabel: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
  },
  addParticipantButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addParticipantButtonText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  selectedEntryTagArea: {
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.bgSurface,
    padding: 8,
    marginBottom: 8,
  },
  selectedEntryTagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  selectedEntryEmptyText: {
    fontSize: Typography.base,
    color: '#94a3b8',
  },
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
  selectorTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
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
  selectorTabButtonActive: {
    backgroundColor: '#67e8f9',
    borderColor: '#0891b2',
  },
  selectorTabButtonText: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: '#0f172a',
  },
  selectorTabButtonTextActive: {
    color: '#083344',
  },
  selectorDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 10,
  },
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
  selectorFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  selectorFilterNameContainer: {
    flex: 1,
  },
  selectorFilterNameInput: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: Typography.base,
    color: '#111827',
  },
  selectorFilterSelectContainer: {
    flex: 1,
  },
  selectorFilterSelectButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectorFilterSelectValue: {
    fontSize: Typography.base,
    color: '#111827',
    flex: 1,
  },
  selectorFilterSelectPlaceholder: {
    fontSize: Typography.base,
    color: '#6b7280',
    flex: 1,
  },
  selectorFilterSelectChevron: {
    fontSize: 10,
    color: '#475569',
    marginLeft: 4,
  },
  eventLinkModalDescription: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 10,
    lineHeight: 18,
  },
  eventLinkOverlapText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  eventLinkModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  eventLinkSecondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
  },
  eventLinkSecondaryButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  selectorListScroll: {
    maxHeight: 320,
    marginBottom: 12,
  },
  selectorListContent: {
    paddingBottom: 8,
  },
  selectorColumnWrapper: {
    gap: SELECTOR_GAP,
    marginBottom: SELECTOR_GAP,
  },
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
  selectorPersonName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
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
  checkmark: {
    color: '#2e7d32',
    fontSize: 16,
    fontWeight: '900',
  },
  selectorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  selectorCancelButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectorCancelButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: Typography.base,
  },
  selectorOkButton: {
    backgroundColor: '#67e8f9',
    borderColor: '#0891b2',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectorOkButtonText: {
    color: '#083344',
    fontWeight: '700',
    fontSize: Typography.base,
  },
  participantItemCard: {
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    backgroundColor: Theme.bgSurface,
  },
  participantTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  participantTypeLabel: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
  participantItemTopRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  participantNameSelect: {
    flex: 1,
  },
  participantRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantRoleLabel: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
  episodePhotoSection: {
    marginBottom: 8,
  },
  episodePhotoThumbScroll: {
    marginBottom: 8,
  },
  episodePhotoThumbRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  episodePhotoThumbWrap: {
    position: 'relative',
    width: 72,
    height: 72,
  },
  episodePhotoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    backgroundColor: '#f1f5f9',
  },
  episodePhotoRemoveButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodePhotoRemoveButtonText: {
    color: Theme.bgSurface,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  episodePhotoAddButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodePhotoAddButtonDisabled: {
    opacity: 0.45,
    backgroundColor: '#e2e8f0',
    borderColor: Theme.inputBorder,
  },
  episodePhotoAddButtonText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  episodePhotoAddButtonTextDisabled: {
    color: '#94a3b8',
  },
  episodePhotoUpgradeHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#64748b',
  },
  episodeDescriptionInput: {
    minHeight: 86,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    textAlignVertical: 'top',
    color: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  episodeErrorText: {
    color: '#b91c1c',
    marginBottom: 8,
    fontSize: 12,
  },
  episodeFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  episodeCancelButton: {
    backgroundColor: 'transparent',
    borderColor: Theme.btnGhostBorder,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  episodeCancelButtonText: {
    color: Theme.btnGhostText,
    fontWeight: '700',
    fontSize: Typography.base,
  },
  episodeCreateButton: {
    backgroundColor: Theme.btnPrimaryBg,
    borderColor: Theme.btnPrimaryBg,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  episodeCreateButtonText: {
    color: Theme.btnPrimaryText,
    fontWeight: '700',
    fontSize: Typography.base,
  },
  episodeSelectButton: {
    minHeight: 38,
    backgroundColor: Theme.inputBg,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  episodeSelectText: {
    fontSize: Typography.base,
    color: '#0f172a',
  },
  episodeSelectPlaceholder: {
    fontSize: Typography.base,
    color: '#94a3b8',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.md,
    padding: 14,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  modalOptionsScroll: {
    maxHeight: 320,
    marginBottom: 10,
  },
  modalOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  modalOptionText: {
    fontSize: 14,
    color: '#1e293b',
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
  },
  modalCloseButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
});
