import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Theme, Radius, Typography, Spacing, ScreenHorizontalInset } from '@/constants/theme';
import { searchAreaStyles } from '@/utils/searchAreaStyles';
import { EpisodeFormOverlay } from '@/components/episode/EpisodeFormOverlay';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { AddCircleButton } from '@/components/AddCircleButton';
import type { Option } from '@/components/episode/types';
import { useEpisodeForm } from '@/hooks/useEpisodeForm';
import {
  createEpisode,
  deleteEpisode,
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeParticipantFriendIds,
  getMyself,
  initializeDatabase,
  updateEpisode,
} from '../db';
import { Episode, EpisodeParticipant, EpisodeVisibilityMode, Friend } from '../types';
import {
  buildParticipantChips,
  getVisibilityModeLabel,
  resolveEpisodeRecordOwnerId,
} from '../utils/episodeHelpers';

const EPISODE_VISIBILITY_MODE_TAG_STYLES: Record<
  EpisodeVisibilityMode,
  { tag: object; text: object }
> = {
  private: {
    tag: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#aaaaaa' },
    text: { color: '#666666' },
  },
  public: {
    tag: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#2a9d5a' },
    text: { color: '#1a6b38' },
  },
  limited: {
    tag: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#7c5cbf' },
    text: { color: '#5c3a9f' },
  },
};


const formatEpisodeDateForCard = (date: string): string => {
  if (!date.trim()) return '-';
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '-';
  const [, month, day] = parts;
  return `${month}月${day}日`;
};

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

type ParticipantChip = { id: string; label: string };

type EpisodeListCardProps = {
  title: string;
  date: string;
  chips: ParticipantChip[];
  visibility?: string[];
  visibilityMode?: EpisodeVisibilityMode;
  onEdit?: () => void;
  onDelete?: () => void;
};

function EpisodeListCard({
  title,
  date,
  chips,
  visibility = [],
  visibilityMode,
  onEdit,
  onDelete,
}: EpisodeListCardProps) {
  const modeStyles = visibilityMode ? EPISODE_VISIBILITY_MODE_TAG_STYLES[visibilityMode] : null;
  const showRow2 = chips.length > 0 || visibility.length > 0;

  return (
    <View style={styles.episodeCard}>
      <View style={styles.episodeCardRow1}>
        <Text style={styles.episodeCardTitle} numberOfLines={1}>
          {title || '-'}
        </Text>
        <Text style={styles.episodeCardDateText}>{formatEpisodeDateForCard(date)}</Text>
        {visibilityMode != null && modeStyles ? (
          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, modeStyles.tag]}>
            <Text style={[styles.episodeParticipantTagName, modeStyles.text]}>
              {getVisibilityModeLabel(visibilityMode)}
            </Text>
          </View>
        ) : null}
        {onEdit && onDelete ? (
          <View style={styles.episodeCardActions}>
            <Pressable style={styles.episodeCardEditButton} onPress={onEdit} accessibilityLabel="編集">
              <Ionicons name="pencil-outline" size={18} color="#0f172a" />
            </Pressable>
            <Pressable style={styles.episodeCardDeleteButton} onPress={onDelete} accessibilityLabel="削除">
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
            </Pressable>
          </View>
        ) : null}
      </View>
      {showRow2 ? (
        <View style={styles.episodeCardRow2}>
          {chips.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.episodeParticipantTagScroll}
              contentContainerStyle={styles.episodeParticipantTagWrap}
            >
              {chips.map((p) => (
                <View key={p.id} style={styles.episodeParticipantTag}>
                  <Text style={styles.episodeParticipantTagName}>{p.label}</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {visibilityMode == null && visibility.length > 0 ? (
            <View style={styles.visibilityCol}>
              <Text style={styles.visibilityLabelFixed}>公開先：</Text>
              <View style={styles.visibilityPills}>
                {visibility.map((label, vi) => (
                  <View key={`vis-${vi}-${label}`} style={styles.episodeParticipantTag}>
                    <Text style={styles.episodeParticipantTagName}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function EpisodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editEpisodeId?: string; ownerId?: string }>();
  const pendingEditKeyRef = useRef<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);

  const [isFormVisible, setIsFormVisible] = useState(false);

  const [filterTitle, setFilterTitle] = useState('');
  const [filterParticipants, setFilterParticipants] = useState<EpisodeParticipantDraft[]>([]);
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

  const episodeForm = useEpisodeForm({
    friends,
    hiddenParticipantIds,
  });

  const loadData = useCallback(() => {
    initializeDatabase();
    setFriends(getAllFriends());
    setAffiliationOptions(getDistinctAffiliations().map((v) => ({ label: v, value: v })));
    setExperienceOptions(getDistinctExperiences().map((v) => ({ label: v, value: v })));
    setMyselfId(getMyself());
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
    return episodeRows.filter((row) => {
      if (normalizedTitle && !row.episode.title.toLowerCase().includes(normalizedTitle)) {
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
  }, [episodeRows, filterParticipantEntries, filterTitle]);

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
    } else {
      const created = createEpisode(payload);
      if (!created) {
        episodeForm.setFormError('エピソードの追加に失敗しました。');
        return;
      }
      episodeForm.persistPhotos(created.id, false);
    }
    episodeForm.reset();
    setIsFormVisible(false);
    loadData();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: 80 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={searchAreaStyles.area}>
            <View style={searchAreaStyles.row}>
              <View style={searchAreaStyles.fieldContainer}>
                <TextInput
                  style={searchAreaStyles.textInput}
                  value={filterTitle}
                  onChangeText={setFilterTitle}
                  placeholder="タイトル"
                  placeholderTextColor={Theme.textSecondary}
                  autoCapitalize="none"
                />
              </View>
              <Pressable style={searchAreaStyles.selectButton} onPress={openFilterParticipantSelector}>
                <Text
                  style={filterParticipantSummary ? searchAreaStyles.selectValue : searchAreaStyles.selectPlaceholder}
                  numberOfLines={1}
                >
                  {filterParticipantSummary || '参加者'}
                </Text>
                <Text style={searchAreaStyles.selectChevron}>▼</Text>
              </Pressable>
              <View style={[searchAreaStyles.fieldContainer, searchAreaStyles.tagField]}>
                <View style={searchAreaStyles.tagPlaceholder} pointerEvents="none">
                  <Text style={searchAreaStyles.tagPlaceholderText}>タグ</Text>
                </View>
              </View>
            </View>
          </View>

          <>
            {!myselfId ? <Text style={styles.emptyText}>本人が設定されていません</Text> : null}
            {filteredEpisodeRows.length === 0 ? (
              <Text style={styles.emptyText}>
                {episodeRows.length === 0
                  ? '登録されたエピソードはありません。'
                  : '条件に一致するエピソードはありません。'}
              </Text>
            ) : (
              filteredEpisodeRows.map((row) => {
                const chips = buildParticipantChips(row.episode, friendNameById);
                const authorId = resolveEpisodeRecordOwnerId(row.episode, row.recordOwnerId);
                return (
                  <Pressable
                    key={row.episode.id}
                    onPress={() =>
                      router.push({
                        pathname: '/episode-detail',
                        params: { episodeId: row.episode.id, ownerId: authorId },
                      })
                    }
                  >
                    <EpisodeListCard
                      title={row.episode.title}
                      date={row.episode.date}
                      chips={chips}
                      visibilityMode={row.episode.visibilityMode}
                    />
                  </Pressable>
                );
              })
            )}
          </>
        </ScrollView>

        <AddCircleButton
          style={styles.fab}
          onPress={openCreateForm}
          disabled={!myselfId}
          accessibilityLabel="エピソードを追加"
        />
      </View>

      <EpisodeFormOverlay
        visible={isFormVisible}
        form={episodeForm}
        friends={friends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        onClose={() => {
          episodeForm.reset();
          setIsFormVisible(false);
        }}
        onSave={handleSaveEpisode}
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

    </SafeAreaView>
  );
}

const SELECTOR_GAP = 6;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.screenBase,
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: ScreenHorizontalInset,
    paddingBottom: 120,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 12,
  },
  episodeCard: {
    backgroundColor: Theme.bgSurface,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  episodeCardRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  episodeCardRow2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  episodeCardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  episodeCardDateText: {
    fontSize: 12,
    color: '#64748b',
    flexShrink: 0,
  },
  episodeCardActions: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
  },
  episodeParticipantTagScroll: {
    flex: 1,
    minWidth: 0,
  },
  episodeParticipantTagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  episodeParticipantTag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#aaaaaa',
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeParticipantTagMain: {
    backgroundColor: 'transparent',
    borderColor: '#aaaaaa',
  },
  episodeParticipantTagName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555555',
  },
  visibilityCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    maxWidth: '48%',
    flexShrink: 0,
  },
  visibilityLabelFixed: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  visibilityPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  visibilityModeTag: {
    flexShrink: 0,
  },
  visibilityModeSelect: {
    flex: 1,
    maxWidth: 200,
  },
  episodeCardEditButton: {
    width: 32,
    height: 32,
    backgroundColor: '#ffffff',
    borderColor: Theme.border,
    borderWidth: 2,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeCardDeleteButton: {
    width: 32,
    height: 32,
    backgroundColor: '#ffffff',
    borderColor: Theme.border,
    borderWidth: 2,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
