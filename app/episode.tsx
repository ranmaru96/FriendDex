import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
import { EpisodeByline, EPISODE_UNREAD_MARK_COLOR } from '@/components/episode/EpisodeByline';
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
import { readUsableEpisodeDraft } from '@/utils/episodeDraft';
import {
  createEpisode,
  deleteEpisode,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeListPhotoUrisMap,
  getEpisodeParticipantFriendIds,
  getIncomingSharedEpisodePhotoUrisMap,
  getMergedEpisodeTagLabels,
  getMyself,
  incomingSharedRecordToEpisode,
  initializeDatabase,
  listIncomingSharedEpisodeRecords,
  updateEpisode,
} from '../db';
import { scheduleOwnedEpisodeDelete } from '@/lib/ownedEpisodeSync';
import { afterEpisodeSavedLocally, guardEpisodeShareOnline } from '@/lib/episodeShareSave';
import { pullIncomingSharedEpisodes } from '@/lib/sharedEpisodeSync';
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
import { registerSavedEpisodeTag } from '../utils/episodeTagMaster';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import { buildFriendPhotoById } from '@/utils/friendPhoto';

type EpisodeRow = { episode: Episode; recordOwnerId: string };
type EpisodeListSource = 'own' | 'shared';

/** 詳細へ replace で戻ると一覧が作り直される。切り替えと戻り先はモジュールに残す。 */
let rememberedEpisodeListSource: EpisodeListSource = 'own';
let rememberedScrollEpisodeId: string | null = null;

function groupSharedEpisodeRows(rows: EpisodeRow[]): { authorId: string; rows: EpisodeRow[] }[] {
  const groups: { authorId: string; rows: EpisodeRow[] }[] = [];
  rows.forEach((row) => {
    const authorId = row.episode.authorFriendId.trim() || row.recordOwnerId;
    const current = groups[groups.length - 1];
    if (current && current.authorId === authorId) {
      current.rows.push(row);
      return;
    }
    groups.push({ authorId, rows: [row] });
  });
  return groups;
}

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
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [listReady, setListReady] = useState(false);
  const [photoUrisByEpisodeId, setPhotoUrisByEpisodeId] = useState<Map<string, string[]>>(
    () => new Map()
  );
  const [incomingEpisodeRows, setIncomingEpisodeRows] = useState<EpisodeRow[]>([]);
  const [episodeListSource, setEpisodeListSourceState] = useState<EpisodeListSource>(
    rememberedEpisodeListSource
  );
  const setEpisodeListSource = useCallback(
    (value: EpisodeListSource | ((current: EpisodeListSource) => EpisodeListSource)) => {
      setEpisodeListSourceState((current) => {
        const next = typeof value === 'function' ? value(current) : value;
        rememberedEpisodeListSource = next;
        return next;
      });
    },
    []
  );

  const [isFormVisible, setIsFormVisible] = useState(false);
  const episodeSaveLockRef = useRef(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const scrollContentRef = useRef<View>(null);
  const episodeCardRefs = useRef<Map<string, View>>(new Map());
  const pendingScrollEpisodeIdRef = useRef<string | null>(rememberedScrollEpisodeId);
  const [episodeSaving, setEpisodeSaving] = useState(false);

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
  const filterAuthorId = episodeListFilter.authorFriendId ?? '';
  const setFilterAuthorId = useCallback(
    (authorFriendId: string) => setEpisodeListFilter((prev) => ({ ...prev, authorFriendId })),
    [setEpisodeListFilter]
  );

  const [tagFilterModalVisible, setTagFilterModalVisible] = useState(false);
  const [authorFilterModalVisible, setAuthorFilterModalVisible] = useState(false);
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
    setMyselfId(getMyself());
    const ownedRows = collectUniqueEpisodes(nextFriends);
    const incomingRows = listIncomingSharedEpisodeRecords().map((record) => ({
      episode: incomingSharedRecordToEpisode(record),
      recordOwnerId: record.authorFriendId,
    }));
    setIncomingEpisodeRows(incomingRows);
    const photoMap = getEpisodeListPhotoUrisMap(ownedRows.map((row) => row.episode.id));
    getIncomingSharedEpisodePhotoUrisMap().forEach((uris, episodeId) => {
      photoMap.set(episodeId, uris);
    });
    setPhotoUrisByEpisodeId(photoMap);
    setListReady(true);
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
      void pullIncomingSharedEpisodes().then(() => {
        loadData();
      });
      if (!pendingEditEpisodeId || !pendingEditOwnerId) {
        pendingEditKeyRef.current = null;
      }
    }, [loadData, pendingEditEpisodeId, pendingEditOwnerId])
  );

  const newDraftPromptingRef = useRef(false);
  const isFormVisibleRef = useRef(isFormVisible);
  isFormVisibleRef.current = isFormVisible;
  useFocusEffect(
    useCallback(() => {
      if (isFormVisibleRef.current || createForEventId || newDraftPromptingRef.current) {
        return;
      }
      const draft = readUsableEpisodeDraft(null, '');
      if (!draft) {
        return;
      }
      newDraftPromptingRef.current = true;
      const finishPrompt = () => {
        newDraftPromptingRef.current = false;
      };
      Alert.alert('前回の下書きを復元しますか？', undefined, [
        {
          text: '復元しない',
          style: 'cancel',
          onPress: () => {
            finishPrompt();
            episodeForm.declineDraft(draft);
          },
        },
        {
          text: '復元する',
          onPress: () => {
            finishPrompt();
            episodeSaveLockRef.current = false;
            setEpisodeSaving(false);
            episodeForm.armRestoredNewDraft(draft);
            setIsFormVisible(true);
          },
        },
      ], { cancelable: true, onDismiss: finishPrompt });
      return () => {
        newDraftPromptingRef.current = false;
      };
    }, [createForEventId, episodeForm.armRestoredNewDraft, episodeForm.declineDraft])
  );

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);
  const episodeRows = useMemo(() => {
    const byId = new Map<string, EpisodeRow>();
    collectUniqueEpisodes(friends).forEach((row) => {
      byId.set(row.episode.id, row);
    });
    incomingEpisodeRows.forEach((row) => {
      byId.set(row.episode.id, row);
    });
    return [...byId.values()].sort((a, b) =>
      compareEpisodesByEventDateTime(a.episode, b.episode)
    );
  }, [friends, incomingEpisodeRows]);

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
      .filter(
        (participant) =>
          participant.participantType !== 'individual' || friendNameById.has(participant.value)
      )
      .map((participant) => ({
        kind: participant.participantType,
        value: participant.value,
      }));
  }, [filterParticipants, friendNameById, myselfId]);

  const sourceEpisodeRows = useMemo(
    () =>
      episodeRows.filter((row) => {
        const own = canManageEpisode(row.episode, row.recordOwnerId, myselfId);
        return episodeListSource === 'own' ? own : !own;
      }),
    [episodeListSource, episodeRows, myselfId]
  );

  const sharedAuthorOptions = useMemo(() => {
    if (episodeListSource !== 'shared') {
      return [];
    }
    const ids = new Set<string>();
    sourceEpisodeRows.forEach((row) => {
      const authorId = row.episode.authorFriendId.trim() || row.recordOwnerId;
      if (authorId && friendNameById.has(authorId)) {
        ids.add(authorId);
      }
    });
    return [...ids]
      .map((id) => ({ value: id, label: friendNameById.get(id) ?? '' }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }, [episodeListSource, friendNameById, sourceEpisodeRows]);

  const filteredEpisodeRows = useMemo(() => {
    const normalizedTitle = filterTitle.trim().toLowerCase();
    const sharedMode = episodeListSource === 'shared';
    const authorId = sharedMode && friendNameById.has(filterAuthorId) ? filterAuthorId : '';
    const normalizedFilterTag = sharedMode ? '' : normalizeEpisodeTag(filterTag);
    const filterFriendIds = sharedMode
      ? new Set<string>()
      : new Set(getEpisodeParticipantFriendIds({ participantEntries: filterParticipantEntries }));
    return sourceEpisodeRows.filter((row) => {
      if (normalizedTitle && !row.episode.title.toLowerCase().includes(normalizedTitle)) {
        return false;
      }
      if (authorId) {
        const rowAuthorId = row.episode.authorFriendId.trim() || row.recordOwnerId;
        if (rowAuthorId !== authorId) {
          return false;
        }
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
  }, [
    episodeListSource,
    filterAuthorId,
    filterParticipantEntries,
    filterTag,
    filterTitle,
    friendNameById,
    sourceEpisodeRows,
  ]);

  const sharedEpisodeGroups = useMemo(
    () => (episodeListSource === 'shared' ? groupSharedEpisodeRows(filteredEpisodeRows) : []),
    [episodeListSource, filteredEpisodeRows]
  );

  const episodeListFiltersActive =
    episodeListSource === 'shared'
      ? filterTitle.trim().length > 0 ||
        (filterAuthorId.length > 0 && friendNameById.has(filterAuthorId))
      : filterTitle.trim().length > 0 ||
        filterTag.trim().length > 0 ||
        filterParticipantEntries.length > 0;

  const scrollToPendingEpisode = useCallback(() => {
    const episodeId = pendingScrollEpisodeIdRef.current;
    const content = scrollContentRef.current;
    if (!episodeId || !content) {
      return;
    }
    if (episodeListFiltersActive) {
      rememberedScrollEpisodeId = null;
      pendingScrollEpisodeIdRef.current = null;
      return;
    }
    const card = episodeCardRefs.current.get(episodeId);
    if (!card) {
      return;
    }
    card.measureLayout(
      content,
      (_x, y) => {
        if (pendingScrollEpisodeIdRef.current !== episodeId) {
          return;
        }
        mainScrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false });
        rememberedScrollEpisodeId = null;
        pendingScrollEpisodeIdRef.current = null;
      },
      () => {}
    );
  }, [episodeListFiltersActive]);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        scrollToPendingEpisode();
      });
      return () => cancelAnimationFrame(frame);
    }, [scrollToPendingEpisode])
  );

  useEffect(() => {
    if (!listReady || !pendingScrollEpisodeIdRef.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      scrollToPendingEpisode();
    });
    return () => cancelAnimationFrame(frame);
  }, [episodeListSource, filteredEpisodeRows, listReady, scrollToPendingEpisode]);

  const filterParticipantSummary = useMemo(() => {
    const labels = filterParticipants
      .filter((participant) => participant.value.trim().length > 0)
      .filter((participant) => !(myselfId && participant.participantType === 'individual' && participant.value === myselfId))
      .flatMap((participant) => {
        if (participant.participantType !== 'individual') {
          return [participant.value];
        }
        if (!friendNameById.has(participant.value)) {
          return [];
        }
        return [friendNameById.get(participant.value) ?? ''];
      });
    if (labels.length === 0) {
      return '';
    }
    if (labels.length <= 2) {
      return labels.join('、');
    }
    return `${labels.length}件`;
  }, [filterParticipants, friendNameById, myselfId]);

  const releaseEpisodeSaveLock = () => {
    episodeSaveLockRef.current = false;
    setEpisodeSaving(false);
  };

  const openCreateForm = () => {
    if (!myselfId) {
      Alert.alert('案内', '本人が設定されていません。');
      return;
    }
    releaseEpisodeSaveLock();
    episodeForm.reset();
    setIsFormVisible(true);
  };

  const startEditEpisode = (row: EpisodeRow) => {
    releaseEpisodeSaveLock();
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
    releaseEpisodeSaveLock();
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
          scheduleOwnedEpisodeDelete(row.episode.id);
          if (episodeForm.editingEpisodeId === row.episode.id) {
            episodeForm.discardUncommittedPhotos();
            episodeForm.forgetDraft();
            episodeForm.reset();
            setIsFormVisible(false);
          }
          loadData();
        },
      },
    ]);
  };

  const handleSaveEpisode = () => {
    if (episodeSaveLockRef.current) {
      return;
    }
    episodeSaveLockRef.current = true;
    setEpisodeSaving(true);
    if (!myselfId) {
      releaseEpisodeSaveLock();
      episodeForm.setFormError('本人が設定されていません。');
      Alert.alert('エラー', '本人が設定されていません。');
      return;
    }
    const payload = episodeForm.buildSavePayload();
    if (!payload) {
      releaseEpisodeSaveLock();
      return;
    }
    if (!guardEpisodeShareOnline(payload.visibilityMode)) {
      releaseEpisodeSaveLock();
      return;
    }
    const resolved = resolveEpisodeSaveEventId(payload, () => {
      Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE);
      episodeForm.setFormError(EVENT_CREATE_FAILED_MESSAGE);
    });
    if (!resolved.ok) {
      releaseEpisodeSaveLock();
      return;
    }
    const { createLinkedEvent: _createLinkedEvent, eventId: _formEventId, ...episodeFields } =
      payload;
    const episodeInput = {
      ...episodeFields,
      eventId: resolved.eventId,
      pendingReview: false,
    };

    const finish = async (savedId: string, isEdit: boolean) => {
      episodeForm.persistPhotos(savedId, isEdit);
      if (!episodeListFiltersActive) {
        rememberedScrollEpisodeId = savedId;
        pendingScrollEpisodeIdRef.current = savedId;
      }
      try {
        await afterEpisodeSavedLocally(savedId);
      } finally {
        episodeForm.forgetDraft();
        episodeForm.reset();
        setIsFormVisible(false);
        loadData();
        releaseEpisodeSaveLock();
      }
    };

    if (episodeForm.editingEpisodeId) {
      const updated = updateEpisode(myselfId, episodeForm.editingEpisodeId, episodeInput);
      if (!updated) {
        releaseEpisodeSaveLock();
        episodeForm.setFormError('エピソードの更新に失敗しました。');
        Alert.alert('エラー', 'エピソードの更新に失敗しました。');
        return;
      }
      registerSavedEpisodeTag(episodeInput.tag);
      void finish(episodeForm.editingEpisodeId, true);
      return;
    }

    const created = createEpisode(episodeInput);
    if (!created) {
      releaseEpisodeSaveLock();
      episodeForm.setFormError('エピソードの追加に失敗しました。');
      Alert.alert('エラー', 'エピソードの追加に失敗しました。');
      return;
    }
    registerSavedEpisodeTag(episodeInput.tag);
    void finish(created.id, false);
  };

  const renderEpisodeListCard = (row: EpisodeRow) => {
    const chips = buildParticipantChips(row.episode, friendNameById, {
      excludeFriendIds: myselfId ? [myselfId] : [],
      friendPhotoById,
    });
    const authorId = resolveEpisodeRecordOwnerId(row.episode, row.recordOwnerId);
    const canManage = canManageEpisode(row.episode, row.recordOwnerId, myselfId);
    const openDetail = () => {
      if (!episodeListFiltersActive) {
        rememberedEpisodeListSource = episodeListSource;
        rememberedScrollEpisodeId = row.episode.id;
        pendingScrollEpisodeIdRef.current = row.episode.id;
      }
      router.push({
        pathname: '/episode-detail',
        params: { episodeId: row.episode.id, ownerId: authorId },
      });
    };
    return (
      <View
        key={row.episode.id}
        collapsable={false}
        onLayout={() => {
          if (pendingScrollEpisodeIdRef.current === row.episode.id) {
            scrollToPendingEpisode();
          }
        }}
        ref={(node) => {
          if (node) {
            episodeCardRefs.current.set(row.episode.id, node);
          } else {
            episodeCardRefs.current.delete(row.episode.id);
          }
        }}
      >
        <EpisodeListCard
          embedded={listItemEmbedded}
          title={row.episode.title}
          date={row.episode.date}
          episodeTag={row.episode.tag}
          chips={chips}
          visibilityMode={canManage ? row.episode.visibilityMode : undefined}
          photoUris={photoUrisByEpisodeId.get(row.episode.id) ?? []}
          unfilled={row.episode.pendingReview === true}
          onPress={openDetail}
        />
      </View>
    );
  };

  return (
    <>
      <ListScreenTemplate
        fab={
          episodeListSource === 'own' ? (
            <AddCircleButton
              style={styles.fab}
              onPress={openCreateForm}
              disabled={!myselfId}
              accessibilityLabel="エピソードを追加"
            />
          ) : undefined
        }
      >
        <ScrollView
          ref={mainScrollRef}
          style={styles.mainScroll}
          contentContainerStyle={[
            styles.mainScrollContent,
            { paddingHorizontal: kit.episodeListPaddingHorizontal, paddingBottom: 80 },
            !listReady ? styles.mainScrollContentLoading : null,
            isEdgeToEdge ? styles.mainScrollContentEdgeToEdge : null,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {!listReady ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={content.contentTextSecondary} />
              <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>読み込み中…</Text>
            </View>
          ) : (
          <View ref={scrollContentRef} collapsable={false}>
          <SearchArea style={isEdgeToEdge ? styles.searchAreaEdgeToEdge : undefined}>
            <SearchAreaRow>
              <SearchAreaTextInputField
                label="タイトル"
                value={filterTitle}
                onChangeText={setFilterTitle}
                autoCapitalize="none"
              />
              {episodeListSource === 'shared' ? (
                <SearchAreaSelectTrigger
                  label="共有元"
                  value={friendNameById.has(filterAuthorId) ? filterAuthorId : ''}
                  displayText={
                    friendNameById.has(filterAuthorId) ? friendNameById.get(filterAuthorId) ?? '' : ''
                  }
                  onPress={() => setAuthorFilterModalVisible(true)}
                />
              ) : (
                <>
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
                </>
              )}
              <Pressable
                style={[
                  styles.episodeSourceToggle,
                  {
                    height: kit.searchAreaShowFieldLabels ? 34 : 38,
                    borderRadius: kit.searchAreaShowFieldLabels ? 17 : 19,
                    backgroundColor: content.contentSwitchTrackOff,
                  },
                ]}
                onPress={() => {
                  setEpisodeListSource((current) => (current === 'own' ? 'shared' : 'own'));
                  mainScrollRef.current?.scrollTo({ y: 0, animated: false });
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  episodeListSource === 'own'
                    ? '自分のエピソード。共有に切り替え'
                    : '共有されたエピソード。自分に切り替え'
                }
              >
                {episodeListSource === 'shared' ? (
                  <Text style={[styles.episodeSourceLabel, { color: content.contentText }]}>by</Text>
                ) : null}
                <View
                  style={[
                    styles.episodeSourceKnob,
                    {
                      width: (kit.searchAreaShowFieldLabels ? 34 : 38) - 6,
                      height: (kit.searchAreaShowFieldLabels ? 34 : 38) - 6,
                      borderRadius: ((kit.searchAreaShowFieldLabels ? 34 : 38) - 6) / 2,
                      backgroundColor: content.contentSwitchThumbOff,
                    },
                  ]}
                >
                  <Ionicons
                    name={episodeListSource === 'own' ? 'person' : 'people'}
                    size={Math.round(((kit.searchAreaShowFieldLabels ? 34 : 38) - 6) * 0.55)}
                    color="#111111"
                  />
                </View>
                {episodeListSource === 'own' ? (
                  <Text style={[styles.episodeSourceLabel, { color: content.contentText }]}>mine</Text>
                ) : null}
              </Pressable>
            </SearchAreaRow>
          </SearchArea>
          <SearchAreaDivider />

          {!myselfId ? <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>本人が設定されていません</Text> : null}
          {filteredEpisodeRows.length === 0 ? (
            <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
              {sourceEpisodeRows.length === 0
                ? episodeListSource === 'own'
                  ? '登録されたエピソードはありません。'
                  : '共有されたエピソードはありません。'
                : '条件に一致するエピソードはありません。'}
            </Text>
          ) : episodeListSource === 'shared' ? (
            <View>
              {sharedEpisodeGroups.map((group, index) => (
                <View key={`${group.authorId}:${group.rows[0]?.episode.id ?? index}`}>
                  {index > 0 ? (
                    <View
                      style={[styles.sharedAuthorDivider, { backgroundColor: content.contentDivider }]}
                    />
                  ) : null}
                  <EpisodeByline
                    variant="heading"
                    name={friendNameById.get(group.authorId) ?? group.authorId}
                    friendId={group.authorId}
                    photoUri={friendPhotoById.get(group.authorId) ?? null}
                    unread={group.rows.some((row) => row.episode.incomingUnread === true)}
                    style={styles.episodeByline}
                  />
                  <View>
                    {group.rows.map((row, rowIndex) => {
                      const unread = row.episode.incomingUnread === true;
                      return (
                        <View key={row.episode.id} style={styles.sharedEpisodeRailRow}>
                          <View style={styles.sharedEpisodeRail}>
                            <View
                              style={[
                                styles.sharedEpisodeRailLine,
                                {
                                  backgroundColor: unread
                                    ? EPISODE_UNREAD_MARK_COLOR
                                    : content.contentDivider,
                                },
                              ]}
                            />
                          </View>
                          <View
                            style={[
                              styles.sharedEpisodeRailBody,
                              rowIndex < group.rows.length - 1 ? styles.sharedEpisodeRailBodyGap : null,
                            ]}
                          >
                            {renderEpisodeListCard(row)}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <ListItemGroup gap={kit.episodeListCardGap}>
              {filteredEpisodeRows.map(renderEpisodeListCard)}
            </ListItemGroup>
          )}
          </View>
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
          releaseEpisodeSaveLock();
          episodeForm.reset();
          setIsFormVisible(false);
        }}
        onSave={handleSaveEpisode}
        saving={episodeSaving}
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
        columns={2}
      />

      <OptionPickerModal
        visible={authorFilterModalVisible}
        label="共有元"
        value={filterAuthorId}
        options={sharedAuthorOptions}
        onValueChange={setFilterAuthorId}
        onClose={() => setAuthorFilterModalVisible(false)}
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
  mainScrollContentLoading: {
    flexGrow: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mainScrollContentEdgeToEdge: {
    gap: Spacing.sm,
  },
  searchAreaEdgeToEdge: {
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderRadius: 0,
  },
  episodeSourceToggle: {
    width: 65,
    flexDirection: 'row',
    alignSelf: 'flex-end',
    alignItems: 'center',
    padding: 3,
  },
  episodeSourceKnob: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 2,
    elevation: 2,
  },
  episodeSourceLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
  },
  episodeByline: {
    marginBottom: 4,
  },
  sharedEpisodeRailRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  sharedEpisodeRailBodyGap: {
    paddingBottom: 4,
  },
  sharedEpisodeRail: {
    width: 24,
    alignItems: 'center',
    marginRight: 6,
  },
  sharedEpisodeRailLine: {
    width: 1.5,
    flex: 1,
    borderRadius: 1,
  },
  sharedEpisodeRailBody: {
    flex: 1,
    minWidth: 0,
  },
  sharedAuthorDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 10,
    marginBottom: 8,
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
