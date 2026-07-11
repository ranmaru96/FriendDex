import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { SearchArea, SearchAreaDivider, SearchAreaRow, SearchAreaSelectTrigger, SearchAreaTextInputField } from '@/components/ui/SearchArea';
import { ListItemGroup } from '@/components/ui/ListItemGroup';
import { ListScreenTemplate } from '@/components/screen-templates';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { EpisodeFormOverlay } from '@/components/episode/EpisodeFormOverlay';
import { EpisodeEventLinkModal } from '@/components/episode/EpisodeEventLinkModal';
import { EpisodeListCard } from '@/components/episode/EpisodeListCard';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { AddCircleButton } from '@/components/AddCircleButton';
import type { Option } from '@/components/episode/types';
import { useEpisodeForm, type EpisodeSavePayload } from '@/hooks/useEpisodeForm';
import { usePersistedFilter, FILTER_KEYS } from '@/hooks/usePersistedFilter';
import {
  DEFAULT_EPISODE_LIST_FILTER,
  isEpisodeListFilterState,
} from '@/utils/persistedFilterTypes';
import {
  createEpisode,
  deleteEpisode,
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeById,
  getEpisodeCoverPhotoUriMap,
  getEpisodeParticipantFriendIds,
  getMergedEpisodeTagLabels,
  getMyself,
  initializeDatabase,
  updateEpisode,
} from '../db';
import { Episode, EpisodeParticipant, Friend } from '../types';
import {
  buildParticipantChips,
  canManageEpisode,
  normalizeEpisodeTag,
  resolveEpisodeRecordOwnerId,
} from '../utils/episodeHelpers';
import {
  applyEventIdToEpisode,
  buildEpisodeEventLinkInput,
  buildEpisodeEventLinkInputFromSavePayload,
  createEventAndLinkEpisode,
  createEventIdForEpisodeInput,
  EVENT_CREATE_FAILED_MESSAGE,
  runEpisodeEventLinkFlow,
  runNewEpisodeEventLinkFlow,
} from '../utils/episodeEventLinking';
import type { EpisodeEventMatch } from '../utils/eventEpisodeSync';

type EpisodeRow = { episode: Episode; recordOwnerId: string };

function collectUniqueEpisodes(friends: Friend[]): EpisodeRow[] {
  const sortedFriends = [...friends].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const byId = new Map<string, EpisodeRow>();
  sortedFriends.forEach((friend) => {
    friend.episodes.forEach((episode) => {
      if (!byId.has(episode.id)) {
        byId.set(episode.id, {
          episode,
          recordOwnerId: resolveEpisodeRecordOwnerId(episode, friend.id),
        });
      }
    });
  });
  return Array.from(byId.values()).sort((a, b) => {
    const d = b.episode.date.localeCompare(a.episode.date);
    return d !== 0 ? d : b.episode.id.localeCompare(a.episode.id);
  });
}

function buildFriendNameById(friends: Friend[]): Map<string, string> {
  return new Map(friends.map((f) => [f.id, f.name]));
}

function buildFriendPhotoById(friends: Friend[]): Map<string, string | null> {
  return new Map(friends.map((f) => [f.id, f.photoUri ?? null]));
}

export default function EpisodeScreen() {
  const kit = useUiKit();
  const listItemEmbedded = kit.listItemStyle === 'panelSections';
  const isEdgeToEdge = kit.episodeListPaddingHorizontal === 0;
  const router = useRouter();
  const params = useLocalSearchParams<{ editEpisodeId?: string; ownerId?: string }>();
  const pendingEditKeyRef = useRef<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [episodeTagOptions, setEpisodeTagOptions] = useState<Option[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [coverPhotoUriByEpisodeId, setCoverPhotoUriByEpisodeId] = useState<Map<string, string>>(
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

  const [createLinkModalVisible, setCreateLinkModalVisible] = useState(false);
  const [createLinkCandidates, setCreateLinkCandidates] = useState<EpisodeEventMatch[]>([]);
  const [editLinkModalVisible, setEditLinkModalVisible] = useState(false);
  const [editLinkCandidates, setEditLinkCandidates] = useState<EpisodeEventMatch[]>([]);
  const [editLinkTarget, setEditLinkTarget] = useState<{ episode: Episode; authorId: string } | null>(
    null
  );
  const [pendingCreatePayload, setPendingCreatePayload] = useState<EpisodeSavePayload | null>(null);

  const hiddenParticipantIds = useMemo(
    () => (myselfId ? [myselfId] : []),
    [myselfId]
  );

  const episodeForm = useEpisodeForm({
    friends,
    hiddenParticipantIds,
  });

  const loadData = useCallback(() => {
    initializeDatabase();
    const nextFriends = getAllFriends();
    setFriends(nextFriends);
    setAffiliationOptions(getDistinctAffiliations().map((v) => ({ label: v, value: v })));
    setExperienceOptions(getDistinctExperiences().map((v) => ({ label: v, value: v })));
    setEpisodeTagOptions(getMergedEpisodeTagLabels().map((v) => ({ label: v, value: v })));
    setMyselfId(getMyself());
    setCoverPhotoUriByEpisodeId(
      getEpisodeCoverPhotoUriMap(collectUniqueEpisodes(nextFriends).map((row) => row.episode.id))
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
        individuals.add(participant.value);
      } else {
        groups.add(participant.value);
      }
    });
    setFilterSelectedIndividualIds(individuals);
    setFilterSelectedGroupValues(groups);
  }, []);

  const openFilterParticipantSelector = useCallback(() => {
    restoreFilterSelectorFromParticipants(filterParticipants);
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
      nextParticipants.push({ participantType: 'individual', value: friendId });
    });
    filterSelectedGroupValues.forEach((groupValue) => {
      nextParticipants.push({ participantType: 'group', value: groupValue });
    });
    setFilterParticipants(nextParticipants);
    setFilterSelectorVisible(false);
    setFilterSelectorNameFilter('');
    setFilterSelectorAffiliationFilter('');
    setFilterSelectorExperienceFilter('');
  }, [filterSelectedGroupValues, filterSelectedIndividualIds]);

  const toggleFilterSelectorIndividual = useCallback((friendId: string) => {
    setFilterSelectedIndividualIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  }, []);

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
      .map((participant) => ({
        kind: participant.participantType,
        value: participant.value,
      }));
  }, [filterParticipants]);

  const filteredEpisodeRows = useMemo(() => {
    const normalizedTitle = filterTitle.trim().toLowerCase();
    const normalizedFilterTag = normalizeEpisodeTag(filterTag);
    return episodeRows.filter((row) => {
      if (normalizedTitle && !row.episode.title.toLowerCase().includes(normalizedTitle)) {
        return false;
      }
      if (normalizedFilterTag && normalizeEpisodeTag(row.episode.tag) !== normalizedFilterTag) {
        return false;
      }
      if (filterParticipantEntries.length > 0) {
        const filterIds = getEpisodeParticipantFriendIds({ participantEntries: filterParticipantEntries });
        const episodeIds = getEpisodeParticipantFriendIds(row.episode);
        if (!filterIds.some((id) => episodeIds.includes(id))) {
          return false;
        }
      }
      return true;
    });
  }, [episodeRows, filterParticipantEntries, filterTag, filterTitle]);

  const filterParticipantSummary = useMemo(() => {
    const labels = filterParticipants
      .filter((participant) => participant.value.trim().length > 0)
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
  }, [filterParticipants, friendNameById]);

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

  const finishCreateEpisode = useCallback(
    (payload: EpisodeSavePayload, eventId: string) => {
      const normalizedEventId = eventId.trim();
      if (!normalizedEventId) {
        episodeForm.setFormError(EVENT_CREATE_FAILED_MESSAGE);
        return;
      }
      const created = createEpisode({
        ...payload,
        eventId: normalizedEventId,
      });
      if (!created) {
        episodeForm.setFormError('エピソードの追加に失敗しました。');
        return;
      }
      episodeForm.persistPhotos(created.id, false);
      episodeForm.reset();
      setIsFormVisible(false);
      setCreateLinkModalVisible(false);
      setCreateLinkCandidates([]);
      setPendingCreatePayload(null);
      loadData();
    },
    [episodeForm, loadData]
  );

  const handleEventCreateFailed = useCallback(() => {
    Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE);
    episodeForm.setFormError(EVENT_CREATE_FAILED_MESSAGE);
  }, [episodeForm]);

  const proceedNewEpisodeSave = useCallback(
    (payload: EpisodeSavePayload) => {
      const linkInput = buildEpisodeEventLinkInputFromSavePayload(payload);
      runNewEpisodeEventLinkFlow(linkInput, {
        onResolved: (eventId) => finishCreateEpisode(payload, eventId),
        onMultipleMatches: (matches) => {
          setPendingCreatePayload(payload);
          setCreateLinkCandidates(matches);
          setCreateLinkModalVisible(true);
        },
        onEventCreateFailed: handleEventCreateFailed,
      });
    },
    [finishCreateEpisode, handleEventCreateFailed]
  );

  const handleCreateLinkCancel = useCallback(() => {
    setCreateLinkModalVisible(false);
    setCreateLinkCandidates([]);
    setPendingCreatePayload(null);
  }, []);

  const handleCreateLinkCreateNew = useCallback(() => {
    if (!pendingCreatePayload) {
      return;
    }
    const eventId = createEventIdForEpisodeInput(
      buildEpisodeEventLinkInputFromSavePayload(pendingCreatePayload)
    );
    if (!eventId) {
      handleEventCreateFailed();
      return;
    }
    finishCreateEpisode(pendingCreatePayload, eventId);
  }, [finishCreateEpisode, handleEventCreateFailed, pendingCreatePayload]);

  const handleCreateLinkSelect = useCallback(
    (eventId: string) => {
      if (!pendingCreatePayload) {
        return;
      }
      finishCreateEpisode(pendingCreatePayload, eventId);
    },
    [finishCreateEpisode, pendingCreatePayload]
  );

  const finishEditEpisodeLink = useCallback(
    (eventId: string) => {
      if (!editLinkTarget) {
        return;
      }
      const ok = applyEventIdToEpisode(editLinkTarget.episode, editLinkTarget.authorId, eventId);
      if (!ok) {
        Alert.alert('エラー', '予定への紐づけに失敗しました。');
        return;
      }
      episodeForm.linkToEvent(eventId);
      setEditLinkModalVisible(false);
      setEditLinkCandidates([]);
      setEditLinkTarget(null);
      loadData();
    },
    [editLinkTarget, episodeForm, loadData]
  );

  const handleEditLinkCancel = useCallback(() => {
    setEditLinkModalVisible(false);
    setEditLinkCandidates([]);
    setEditLinkTarget(null);
  }, []);

  const handleEditLinkCreateNew = useCallback(() => {
    if (!editLinkTarget) {
      return;
    }
    createEventAndLinkEpisode(
      buildEpisodeEventLinkInput(editLinkTarget.episode),
      finishEditEpisodeLink,
      () => Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE)
    );
  }, [editLinkTarget, finishEditEpisodeLink]);

  const handleLinkExistingEpisodeToEvent = useCallback(() => {
    const episodeId = episodeForm.editingEpisodeId;
    if (!episodeId || !myselfId) {
      return;
    }
    const episode = getEpisodeById(myselfId, episodeId);
    if (!episode) {
      Alert.alert('エラー', 'エピソードが見つかりません。');
      return;
    }
    const authorId = resolveEpisodeRecordOwnerId(episode, myselfId);
    runEpisodeEventLinkFlow(buildEpisodeEventLinkInput(episode), {
      onLinked: (eventId) => {
        const ok = applyEventIdToEpisode(episode, authorId, eventId);
        if (!ok) {
          Alert.alert('エラー', '予定への紐づけに失敗しました。');
          return;
        }
        episodeForm.linkToEvent(eventId);
        loadData();
      },
      onMultipleMatches: (matches) => {
        setEditLinkTarget({ episode, authorId });
        setEditLinkCandidates(matches);
        setEditLinkModalVisible(true);
      },
      onEventCreateFailed: () => Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE),
    });
  }, [episodeForm, loadData, myselfId]);

  const handleSaveEpisode = () => {
    if (!myselfId) {
      episodeForm.setFormError('本人が設定されていません。');
      return;
    }
    const payload = episodeForm.buildSavePayload();
    if (!payload) {
      return;
    }
    if (episodeForm.editingEpisodeId) {
      const updated = updateEpisode(myselfId, episodeForm.editingEpisodeId, payload);
      if (!updated) {
        episodeForm.setFormError('エピソードの更新に失敗しました。');
        return;
      }
      episodeForm.persistPhotos(episodeForm.editingEpisodeId, true);
      episodeForm.reset();
      setIsFormVisible(false);
      loadData();
      return;
    }
    proceedNewEpisodeSave(payload);
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

          {!myselfId ? <Text style={styles.emptyText}>本人が設定されていません</Text> : null}
          {filteredEpisodeRows.length === 0 ? (
            <Text style={styles.emptyText}>
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
                    chips={chips}
                    visibilityMode={canManage ? row.episode.visibilityMode : undefined}
                    posterName={posterName}
                    coverPhotoUri={coverPhotoUriByEpisodeId.get(row.episode.id) ?? null}
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
        onClose={() => {
          episodeForm.reset();
          setIsFormVisible(false);
        }}
        onSave={handleSaveEpisode}
        onLinkToEvent={handleLinkExistingEpisodeToEvent}
      />

      <EpisodeEventLinkModal
        visible={createLinkModalVisible}
        dateKey={pendingCreatePayload?.date ?? ''}
        candidates={createLinkCandidates}
        onSelect={handleCreateLinkSelect}
        onCreateNew={handleCreateLinkCreateNew}
        onCancel={handleCreateLinkCancel}
      />

      <EpisodeEventLinkModal
        visible={editLinkModalVisible}
        dateKey={editLinkTarget?.episode.date ?? ''}
        candidates={editLinkCandidates}
        onSelect={finishEditEpisodeLink}
        onCreateNew={handleEditLinkCreateNew}
        onCancel={handleEditLinkCancel}
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
        friends={friends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={affiliationOptions}
        selectedIndividualIds={filterSelectedIndividualIds}
        selectedGroupValues={filterSelectedGroupValues}
        onToggleIndividual={toggleFilterSelectorIndividual}
        onToggleGroup={toggleFilterSelectorGroup}
        onCancel={handleFilterSelectorCancel}
        onConfirm={handleFilterSelectorConfirm}
      />

      <Modal
        transparent
        animationType="fade"
        visible={tagFilterModalVisible}
        onRequestClose={() => setTagFilterModalVisible(false)}
      >
        <View style={styles.selectorFilterModalBackdrop}>
          <View style={styles.selectorFilterModalCard}>
            <Text style={styles.selectorFilterModalTitle}>タグで絞り込み</Text>
            <ScrollView style={styles.selectorFilterModalOptions}>
              <Pressable
                style={[styles.selectorFilterModalOption, !filterTag ? styles.selectorFilterModalOptionSelected : null]}
                onPress={() => {
                  setFilterTag('');
                  setTagFilterModalVisible(false);
                }}
              >
                <Text style={styles.selectorFilterModalOptionText}>すべて</Text>
              </Pressable>
              {episodeTagOptions.map((option) => {
                const selected = option.value === filterTag;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.selectorFilterModalOption, selected ? styles.selectorFilterModalOptionSelected : null]}
                    onPress={() => {
                      setFilterTag(option.value);
                      setTagFilterModalVisible(false);
                    }}
                  >
                    <Text style={styles.selectorFilterModalOptionText}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.eventLinkSecondaryButton} onPress={() => setTagFilterModalVisible(false)}>
              <Text style={styles.eventLinkSecondaryButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  selectorFilterModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  selectorFilterModalOptions: {
    marginBottom: 10,
  },
  selectorFilterModalOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  selectorFilterModalOptionSelected: {
    backgroundColor: '#e0f2fe',
  },
  selectorFilterModalOptionText: {
    fontSize: 14,
    color: '#1e293b',
  },
  selectorFilterModalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
  },
  selectorFilterModalCloseButtonText: {
    color: '#0f172a',
    fontWeight: '600',
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
  checkboxChecked: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
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
  modalOptionSelected: {
    backgroundColor: '#e0f2fe',
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
