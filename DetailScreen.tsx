import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import {
  createEpisode,
  createSayings,
  deleteSaying,
  deleteEpisode,
  getAllFriends,
  getEpisodePhotos,
  getFriendById,
  getMyself,
  getProfilesByFriendId,
  initializeDatabase,
  setDefaultProfile,
  updateFriend,
  updateEpisode,
  updateSaying,
} from './db';
import { Episode, EpisodeParticipant, EpisodePhoto, EpisodeVisibilityEntry, Friend, Profile, Saying } from './types';

type KeyValueRowProps = {
  label: string;
  value: string;
};

type MultiValueRow = {
  title: string;
  values: string[];
};

const formatDateToYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDateString = (s: string): Date => {
  const parts = s.split('-').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
};

type DetailTabKey = '情報' | 'エピソード' | '習性' | 'メモ' | '彼曰く';
type Option = {
  label: string;
  value: string;
};
type RoleFilter = 'all' | 'main' | 'not-main';
type EpisodeParticipantDraft = {
  participantType: 'individual' | 'group';
  value: string;
  isMain: boolean;
};

type EpisodeVisibilityDraft = {
  kind: 'individual' | 'group';
  value: string;
};

function SelectInput({
  value,
  placeholder,
  options,
  onChange,
  style,
}: {
  value: string;
  placeholder: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: object;
}) {
  const [visible, setVisible] = useState(false);
  const selectedLabel = useMemo(() => {
    const selected = options.find((option) => option.value === value);
    return selected?.label ?? placeholder;
  }, [options, placeholder, value]);

  return (
    <>
      <Pressable style={[styles.episodeSelectButton, style]} onPress={() => setVisible(true)}>
        <Text style={value ? styles.episodeSelectText : styles.episodeSelectPlaceholder} numberOfLines={1}>
          {selectedLabel}
        </Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{placeholder}</Text>
            <View style={styles.modalOptions}>
              <Pressable
                style={[styles.modalOption, value === '' && styles.modalOptionSelected]}
                onPress={() => {
                  onChange('');
                  setVisible(false);
                }}
              >
                <Text style={styles.modalOptionText}>{placeholder}</Text>
              </Pressable>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.modalOption, value === option.value && styles.modalOptionSelected]}
                  onPress={() => {
                    onChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.modalCloseButton} onPress={() => setVisible(false)}>
              <Text style={styles.modalCloseButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function KeyValueRow({ label, value }: KeyValueRowProps) {
  return (
    <View style={styles.keyValueRow}>
      <Text style={styles.keyValueLabel}>{label}</Text>
      <Text style={styles.keyValueValue}>{value || '-'}</Text>
    </View>
  );
}

function MultiValueSummarySection({ rows, withCard = true }: { rows: MultiValueRow[]; withCard?: boolean }) {
  return (
    <View style={withCard ? styles.multiValueCard : styles.multiValuePlainContainer}>
      {rows.map((row, rowIndex) => (
        <View key={row.title} style={[styles.multiValueRow, rowIndex > 0 && styles.multiValueRowWithDivider]}>
          <Text style={styles.multiValueLabel}>{row.title}</Text>
          <View style={styles.multiValueChipArea}>
            {(row.values.length > 0 ? row.values : ['-']).map((value, index) => (
              <View key={`${row.title}-${index}-${value}`} style={styles.chip}>
                <Text style={styles.chipText}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const formatHeight = (height: number | null): string => (height === null ? '-' : `${height} cm`);
const formatWeight = (weight: number | null): string => (weight === null ? '-' : `${weight} kg`);

export default function DetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [friend, setFriend] = useState<Friend | null>(null);
  const [profileImageLoadError, setProfileImageLoadError] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTabKey>('情報');
  const [habitNotes, setHabitNotes] = useState<string[]>([]);
  const [isHabitFormVisible, setIsHabitFormVisible] = useState(false);
  const [editingHabitIndex, setEditingHabitIndex] = useState<number | null>(null);
  const [habitText, setHabitText] = useState('');
  const [habitInputHeight, setHabitInputHeight] = useState(48);
  const [habitFormError, setHabitFormError] = useState('');
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [episodeRoleDraft, setEpisodeRoleDraft] = useState<RoleFilter>('all');
  const [episodeRoleFilter, setEpisodeRoleFilter] = useState<RoleFilter>('all');
  const [episodeOtherParticipantDraft, setEpisodeOtherParticipantDraft] = useState('');
  const [episodeOtherParticipantFilter, setEpisodeOtherParticipantFilter] = useState('');
  const [episodeTitleDraft, setEpisodeTitleDraft] = useState('');
  const [episodeTitleFilter, setEpisodeTitleFilter] = useState('');
  const [isEpisodeFormVisible, setIsEpisodeFormVisible] = useState(false);
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [newEpisodeTitle, setNewEpisodeTitle] = useState('');
  const [newEpisodeDate, setNewEpisodeDate] = useState('');
  const [showEpisodeDatePicker, setShowEpisodeDatePicker] = useState(false);
  const [newEpisodeDescription, setNewEpisodeDescription] = useState('');
  const [isOwnerMainRole, setIsOwnerMainRole] = useState(true);
  const [episodeParticipants, setEpisodeParticipants] = useState<EpisodeParticipantDraft[]>([]);
  const [episodeVisibility, setEpisodeVisibility] = useState<EpisodeVisibilityDraft[]>([]);
  const [episodeFormError, setEpisodeFormError] = useState('');
  const [isSayingFormVisible, setIsSayingFormVisible] = useState(false);
  const [editingSayingId, setEditingSayingId] = useState<string | null>(null);
  const [sayingText, setSayingText] = useState('');
  const [sayingDate, setSayingDate] = useState('');
  const [sayingInputHeight, setSayingInputHeight] = useState(48);
  const [sayingFormError, setSayingFormError] = useState('');
  const [episodePhotosMap, setEpisodePhotosMap] = useState<Record<string, EpisodePhoto[]>>({});
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const friendId = useMemo(() => {
    if (Array.isArray(params.id)) {
      return params.id[0] ?? '';
    }
    return params.id ?? '';
  }, [params.id]);

  const loadFriend = useCallback(() => {
    initializeDatabase();
    if (!friendId) {
      setFriend(null);
      setProfiles([]);
      setMyselfId(null);
      setAllFriends([]);
      return;
    }
    const loadedProfiles = getProfilesByFriendId(friendId);
    const currentMyselfId = getMyself();
    let loaded = getFriendById(friendId);
    if (loaded && loadedProfiles.length > 0 && !loaded.activeProfileId) {
      const selfProfile = loadedProfiles.find(
        (profile) => profile.source === 'self' || (currentMyselfId !== null && profile.authorUserId === currentMyselfId)
      );
      const fallbackProfile = selfProfile ?? loadedProfiles[0];
      if (fallbackProfile && setDefaultProfile(friendId, fallbackProfile.id)) {
        loaded = getFriendById(friendId);
      }
    }
    setFriend(loaded);
    setProfiles(loadedProfiles);
    setMyselfId(currentMyselfId);
    setProfileImageLoadError(false);
    const loadedTraits = loaded?.traits ?? [];
    setHabitNotes(loadedTraits);
    setAllFriends(getAllFriends());
  }, [friendId]);

  useFocusEffect(
    useCallback(() => {
      loadFriend();
    }, [loadFriend])
  );

  useEffect(() => {
    setActiveTab('情報');
    setIsHabitFormVisible(false);
    setEditingHabitIndex(null);
    setHabitText('');
    setHabitInputHeight(48);
    setHabitFormError('');
    setEpisodeRoleDraft('all');
    setEpisodeRoleFilter('all');
    setEpisodeOtherParticipantDraft('');
    setEpisodeOtherParticipantFilter('');
    setEpisodeTitleDraft('');
    setEpisodeTitleFilter('');
    setIsEpisodeFormVisible(false);
    setEditingEpisodeId(null);
    setNewEpisodeTitle('');
    setNewEpisodeDate('');
    setNewEpisodeDescription('');
    setIsOwnerMainRole(true);
    setEpisodeParticipants([]);
    setEpisodeVisibility([]);
    setEpisodeFormError('');
    setIsSayingFormVisible(false);
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    setSayingFormError('');
    setEpisodePhotosMap({});
    setLightboxPhoto(null);
  }, [friendId]);

  const friendNameById = useMemo(() => {
    const map = new Map<string, string>();
    allFriends.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [allFriends]);
  const selectedProfile = useMemo(() => {
    if (!friend || profiles.length === 0) {
      return null;
    }
    const current = friend.activeProfileId ? profiles.find((profile) => profile.id === friend.activeProfileId) : undefined;
    if (current) {
      return current;
    }
    const selfProfile = profiles.find(
      (profile) => profile.source === 'self' || (myselfId !== null && profile.authorUserId === myselfId)
    );
    return selfProfile ?? profiles[0] ?? null;
  }, [friend, profiles, myselfId]);
  const selectableProfiles = useMemo(() => {
    if (profiles.length === 0) return [];
    const hasOnlyOneSelfProfile =
      profiles.length === 1 &&
      (profiles[0].source === 'self' || (myselfId !== null && profiles[0].authorUserId === myselfId));
    if (hasOnlyOneSelfProfile) {
      return [];
    }
    return profiles;
  }, [profiles, myselfId]);
  const profileTagLabel = useMemo(() => {
    if (!selectedProfile) return '';
    const isSelf =
      selectedProfile.source === 'self' || (myselfId !== null && selectedProfile.authorUserId === myselfId);
    if (isSelf) {
      return 'me';
    }
    return selectedProfile.authorUserId ? friendNameById.get(selectedProfile.authorUserId) ?? selectedProfile.authorUserId : 'shared';
  }, [selectedProfile, myselfId, friendNameById]);
  const participantOptions = useMemo(
    () =>
      allFriends
        .filter((item) => item.id !== friendId)
        .map((item) => ({
          label: item.name,
          value: item.id,
        })),
    [allFriends, friendId]
  );
  const affiliationOptions = useMemo(() => {
    const unique = new Set<string>();
    allFriends.forEach((item) => {
      item.affiliations.forEach((affiliation) => {
        const trimmed = affiliation.trim();
        if (trimmed) unique.add(trimmed);
      });
    });
    return Array.from(unique)
      .sort((a, b) => a.localeCompare(b, 'ja'))
      .map((value) => ({ label: value, value }));
  }, [allFriends]);

  const visibilityIndividualOptions = useMemo(
    () => allFriends.map((item) => ({ label: item.name, value: item.id })),
    [allFriends]
  );

  const sortedEpisodes = useMemo(() => {
    if (!friend) return [];
    return [...friend.episodes].sort((a, b) => b.date.localeCompare(a.date));
  }, [friend]);

  const renderableParticipantsByEpisode = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        label: string;
        isMain: boolean;
      }[]
    >();

    sortedEpisodes.forEach((episode) => {
      const entries: EpisodeParticipant[] =
        episode.participantEntries && episode.participantEntries.length > 0
          ? episode.participantEntries
          : [
              ...episode.mainParticipants.map((id) => ({ kind: 'individual' as const, value: id, isMain: true })),
              ...episode.subParticipants.map((id) => ({ kind: 'individual' as const, value: id, isMain: false })),
            ];
      const unique = new Map<string, { id: string; label: string; isMain: boolean }>();
      entries.forEach((entry) => {
        if (entry.kind === 'individual' && entry.value === friendId) {
          return;
        }
        const key = `${entry.kind}:${entry.value}`;
        if (!entry.value.trim()) return;
        if (!unique.has(key) || entry.isMain) {
          unique.set(key, {
            id: key,
            label: entry.kind === 'group' ? entry.value : friendNameById.get(entry.value) ?? entry.value,
            isMain: entry.isMain,
          });
        }
      });
      map.set(episode.id, Array.from(unique.values()));
    });

    return map;
  }, [friendNameById, sortedEpisodes]);

  const filteredEpisodes = useMemo(() => {
    return sortedEpisodes.filter((episode) => {
      if (episodeRoleFilter === 'main' && !episode.mainParticipants.includes(friendId)) {
        return false;
      }
      if (episodeRoleFilter === 'not-main' && episode.mainParticipants.includes(friendId)) {
        return false;
      }
      if (episodeOtherParticipantFilter) {
        const participants = [...episode.mainParticipants, ...episode.subParticipants];
        if (!participants.includes(episodeOtherParticipantFilter)) {
          return false;
        }
      }
      if (episodeTitleFilter.trim()) {
        if (!episode.title.toLowerCase().includes(episodeTitleFilter.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [episodeOtherParticipantFilter, episodeRoleFilter, episodeTitleFilter, friendId, sortedEpisodes]);

  useEffect(() => {
    if (activeTab !== 'エピソード') {
      return;
    }
    const map: Record<string, EpisodePhoto[]> = {};
    filteredEpisodes.forEach((episode) => {
      map[episode.id] = getEpisodePhotos(episode.id);
    });
    setEpisodePhotosMap(map);
  }, [activeTab, filteredEpisodes]);

  const sortedSayings = useMemo(() => {
    if (!friend) return [];
    return [...friend.sayings].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return -1;
      if (!b.date) return 1;
      return b.date.localeCompare(a.date);
    });
  }, [friend]);

  const roleOptions: Option[] = useMemo(
    () => [
      { label: 'メイン', value: 'main' },
      { label: 'サブ', value: 'not-main' },
    ],
    []
  );

  const handleEpisodeSearch = () => {
    setEpisodeRoleFilter(episodeRoleDraft);
    setEpisodeOtherParticipantFilter(episodeOtherParticipantDraft);
    setEpisodeTitleFilter(episodeTitleDraft);
  };

  const handleSaveSayings = () => {
    const text = sayingText.trim();
    const date = sayingDate.trim();
    if (!text) {
      setSayingFormError('本文を入力してください。');
      return;
    }
    if (editingSayingId) {
      const updated = updateSaying(friendId, editingSayingId, { text, date });
      if (!updated) {
        setSayingFormError('彼曰くの更新に失敗しました。');
        return;
      }
    } else {
      const created = createSayings(friendId, [{ text, date }]);
      if (created.length === 0) {
        setSayingFormError('彼曰くの登録に失敗しました。');
        return;
      }
    }

    setSayingFormError('');
    setIsSayingFormVisible(false);
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    loadFriend();
  };

  const startCreateSaying = () => {
    setSayingFormError('');
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    setIsSayingFormVisible(true);
  };

  const startEditSaying = (saying: Saying) => {
    setSayingFormError('');
    setEditingSayingId(saying.id);
    setSayingText(saying.text);
    setSayingDate(saying.date);
    setSayingInputHeight(48);
    setIsSayingFormVisible(true);
  };

  const handleDeleteSaying = (sayingId: string) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const deleted = deleteSaying(friendId, sayingId);
          if (!deleted) {
            setSayingFormError('彼曰くの削除に失敗しました。');
            return;
          }
          if (editingSayingId === sayingId) {
            setIsSayingFormVisible(false);
            setEditingSayingId(null);
            setSayingText('');
            setSayingDate('');
            setSayingInputHeight(48);
          }
          loadFriend();
        },
      },
    ]);
  };

  const handleLongPressSaying = (saying: Saying) => {
    Alert.alert('操作を選択', 'この項目に対する操作を選んでください。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '編集', onPress: () => startEditSaying(saying) },
      { text: '削除', style: 'destructive', onPress: () => handleDeleteSaying(saying.id) },
    ]);
  };

  const persistTraits = (nextTraits: string[]) => {
    if (!friend) {
      return;
    }
    const normalizedTraits = nextTraits.map((item) => item.trim()).filter((item) => item.length > 0);
    const success = updateFriend(friend.id, {
      name: friend.name,
      nickname: friend.nickname,
      origin: friend.origin,
      residence: friend.residence,
      mbti: friend.mbti,
      birthday: friend.birthday,
      height: friend.height,
      weight: friend.weight,
      category: friend.category,
      description: friend.description,
      photoUri: friend.photoUri,
      affiliations: friend.affiliations,
      personalities: friend.personalities,
      experiences: friend.experiences,
      traits: normalizedTraits,
      likes: friend.likes,
      dislikes: friend.dislikes,
      episodes: friend.episodes,
      sayings: friend.sayings,
    });
    if (success) {
      setFriend((prev) => (prev ? { ...prev, traits: normalizedTraits } : prev));
    }
  };

  const startCreateHabit = () => {
    setIsHabitFormVisible(true);
    setEditingHabitIndex(null);
    setHabitText('');
    setHabitInputHeight(48);
    setHabitFormError('');
  };

  const startEditHabit = (index: number) => {
    setIsHabitFormVisible(true);
    setEditingHabitIndex(index);
    setHabitText(habitNotes[index] ?? '');
    setHabitInputHeight(48);
    setHabitFormError('');
  };

  const handleSaveHabit = () => {
    const text = habitText.trim();
    if (!text) {
      setHabitFormError('習性を入力してください。');
      return;
    }
    const next = [...habitNotes];
    if (editingHabitIndex === null) {
      next.push(text);
    } else {
      next[editingHabitIndex] = text;
    }
    setHabitNotes(next);
    persistTraits(next);
    setIsHabitFormVisible(false);
    setEditingHabitIndex(null);
    setHabitText('');
    setHabitInputHeight(48);
    setHabitFormError('');
  };

  const handleDeleteHabit = (index: number) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const next = habitNotes.filter((_, itemIndex) => itemIndex !== index);
          setHabitNotes(next);
          persistTraits(next);
          if (editingHabitIndex === index) {
            setIsHabitFormVisible(false);
            setEditingHabitIndex(null);
            setHabitText('');
            setHabitInputHeight(48);
            setHabitFormError('');
          }
        },
      },
    ]);
  };

  const handleLongPressHabit = (index: number) => {
    Alert.alert('操作を選択', 'この習性に対する操作を選んでください。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '編集', onPress: () => startEditHabit(index) },
      { text: '削除', style: 'destructive', onPress: () => handleDeleteHabit(index) },
    ]);
  };

  const resetEpisodeForm = () => {
    setEpisodeFormError('');
    setEditingEpisodeId(null);
    setNewEpisodeTitle('');
    setNewEpisodeDate(formatDateToYMD(new Date()));
    setShowEpisodeDatePicker(false);
    setNewEpisodeDescription('');
    setIsOwnerMainRole(true);
    setEpisodeParticipants([]);
    setEpisodeVisibility([]);
  };

  const startCreateEpisode = () => {
    resetEpisodeForm();
    setIsEpisodeFormVisible(true);
  };

  const startEditEpisode = (episode: Episode) => {
    const entries: EpisodeParticipant[] =
      episode.participantEntries && episode.participantEntries.length > 0
        ? episode.participantEntries
        : [
            ...episode.mainParticipants.map((id) => ({ kind: 'individual' as const, value: id, isMain: true })),
            ...episode.subParticipants.map((id) => ({ kind: 'individual' as const, value: id, isMain: false })),
          ];
    const participantDrafts: EpisodeParticipantDraft[] = entries.map((entry) => ({
        participantType: entry.kind,
        value: entry.value,
        isMain: entry.isMain,
      }));
    setEditingEpisodeId(episode.id);
    setNewEpisodeTitle(episode.title);
    setNewEpisodeDate(episode.date);
    setNewEpisodeDescription(episode.description);
    setIsOwnerMainRole(episode.mainParticipants.includes(friendId));
    setEpisodeParticipants(participantDrafts);
    setEpisodeVisibility(
      (episode.visibilityEntries ?? []).map((entry) => ({
        kind: entry.kind,
        value: entry.value,
      }))
    );
    setEpisodeFormError('');
    setIsEpisodeFormVisible(true);
  };

  const handleDeleteEpisode = (episodeId: string) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const deleted = deleteEpisode(friendId, episodeId);
          if (!deleted) {
            setEpisodeFormError('エピソードの削除に失敗しました。');
            return;
          }
          if (editingEpisodeId === episodeId) {
            resetEpisodeForm();
            setIsEpisodeFormVisible(false);
          }
          loadFriend();
        },
      },
    ]);
  };

  const handleSaveEpisode = () => {
    if (!friend) {
      setEpisodeFormError('人物データが見つかりません。');
      return;
    }
    const title = newEpisodeTitle.trim();
    const date = newEpisodeDate.trim();
    const description = newEpisodeDescription.trim();
    if (!title) {
      setEpisodeFormError('タイトルを入力してください。');
      return;
    }
    if (!date) {
      setEpisodeFormError('日付を選択してください。');
      return;
    }

    const participantEntries: EpisodeParticipant[] = episodeParticipants
      .filter((participant) => participant.value.trim().length > 0)
      .map((participant) => ({
        kind: participant.participantType,
        value: participant.value,
        isMain: participant.isMain,
      }));
    const visibilityEntries: EpisodeVisibilityEntry[] = episodeVisibility
      .filter((entry) => entry.value.trim().length > 0)
      .map((entry) => ({
        kind: entry.kind,
        value: entry.value.trim(),
      }));
    const previousEpisode = editingEpisodeId
      ? friend.episodes.find((item) => item.id === editingEpisodeId)
      : null;
    const visibilityMode =
      visibilityEntries.length > 0 ? 'limited' : (previousEpisode?.visibilityMode ?? 'private');
    const mainParticipants = isOwnerMainRole ? [friend.id] : [];
    const subParticipants = isOwnerMainRole ? [] : [friend.id];
    if (editingEpisodeId) {
      const updated = updateEpisode(friend.id, editingEpisodeId, {
        title,
        date,
        description,
        visibilityMode,
        mainParticipants,
        subParticipants,
        participantEntries,
        visibilityEntries,
      });
      if (!updated) {
        setEpisodeFormError('エピソードの更新に失敗しました。');
        return;
      }
    } else {
      const created = createEpisode(friend.id, {
        title,
        date,
        description,
        visibilityMode,
        mainParticipants,
        subParticipants,
        participantEntries,
        visibilityEntries,
      });
      if (!created) {
        setEpisodeFormError('エピソードの追加に失敗しました。');
        return;
      }
    }
    resetEpisodeForm();
    setIsEpisodeFormVisible(false);
    loadFriend();
  };

  if (!friend) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.missingContainer}>
          <Text style={styles.missingText}>人物データが見つかりませんでした。</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const openProfileSwitcher = () => {
    if (!friend || selectableProfiles.length === 0) {
      return;
    }
    const buttons = selectableProfiles.map((profile) => {
      const isSelf = profile.source === 'self' || (myselfId !== null && profile.authorUserId === myselfId);
      const label = isSelf
        ? 'me'
        : profile.authorUserId
          ? friendNameById.get(profile.authorUserId) ?? profile.authorUserId
          : 'shared';
      return {
        text: `by ${label}`,
        onPress: () => {
          const changed = setDefaultProfile(friend.id, profile.id);
          if (changed) {
            loadFriend();
          }
        },
      };
    });
    Alert.alert('プロフィール切替', '表示するプロフィールを選択してください。', [
      ...buttons,
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid
        extraScrollHeight={18}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerName}>{friend.name}</Text>
            {selectableProfiles.length > 0 ? (
              <Pressable style={styles.byTag} onPress={openProfileSwitcher}>
                <Text style={styles.byTagText}>{`by ${profileTagLabel}`}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.editButton} onPress={() => router.push({ pathname: '/edit', params: { id: friend.id } })}>
              <Text style={styles.editButtonText}>編集</Text>
            </Pressable>
            <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
              <Text style={styles.homeButtonText}>Home</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.profileCard}>
          {friend.photoUri && !profileImageLoadError ? (
            <Image
              source={{ uri: friend.photoUri }}
              style={styles.profilePhoto}
              onError={() => setProfileImageLoadError(true)}
            />
          ) : (
            <View style={[styles.profilePhoto, styles.profilePhotoPlaceholder]}>
              <Text style={styles.profilePhotoPlaceholderText}>No Image</Text>
            </View>
          )}

          <View style={styles.profileRight}>
            <KeyValueRow label="通称" value={friend.nickname} />
            <KeyValueRow label="出身" value={friend.origin} />
            <KeyValueRow label="居住地" value={friend.residence} />
            <KeyValueRow label="MBTI" value={friend.mbti} />
            <KeyValueRow label="誕生日" value={friend.birthday} />
            <KeyValueRow label="身長" value={formatHeight(friend.height)} />
            <KeyValueRow label="体重" value={formatWeight(friend.weight)} />
            <KeyValueRow label="分類" value={friend.category} />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.descriptionText}>{friend.description || '-'}</Text>
        </View>

        <View style={styles.tabSection}>
          <View style={styles.tabRowContainer}>
            <View style={styles.tabButtonRow}>
              {(['情報', 'エピソード', '習性', '彼曰く', 'メモ'] as DetailTabKey[]).map((tab, index) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    styles.tabButton,
                    activeTab === tab ? styles.tabButtonActive : styles.tabButtonInactive,
                  ]}
                >
                  <Text style={[styles.tabButtonText, activeTab === tab ? styles.tabButtonTextActive : styles.tabButtonTextInactive]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.tabContentArea}>
          {activeTab === '情報' && (
            <MultiValueSummarySection
              withCard
              rows={[
                { title: '所属', values: friend.affiliations },
                { title: '経験', values: friend.experiences },
                { title: '性格', values: friend.personalities },
                { title: '好物', values: friend.likes },
                { title: '苦手', values: friend.dislikes },
              ]}
            />
          )}

          {(activeTab === '習性' || activeTab === 'メモ') && (
            <View style={styles.tabPane}>
            <View style={styles.sayingTopRow}>
              <View />
              <Pressable
                style={styles.episodeAddButton}
                onPress={() => {
                  if (isHabitFormVisible && editingHabitIndex === null) {
                    setIsHabitFormVisible(false);
                    setHabitText('');
                    setHabitInputHeight(48);
                    setHabitFormError('');
                  } else {
                    startCreateHabit();
                  }
                }}
              >
                <Text style={styles.episodeAddButtonText}>
                  {isHabitFormVisible && editingHabitIndex === null ? '閉じる' : '+ 追加'}
                </Text>
              </Pressable>
            </View>

            {isHabitFormVisible && (
              <View style={styles.sayingFormCard}>
                <TextInput
                  style={[styles.sayingTextInput, { height: Math.max(48, habitInputHeight) }]}
                  placeholder="習性（自由記入）"
                  placeholderTextColor="#94a3b8"
                  multiline
                  value={habitText}
                  onContentSizeChange={(event) => {
                    setHabitInputHeight(event.nativeEvent.contentSize.height + 20);
                  }}
                  onChangeText={setHabitText}
                />
                <View style={styles.sayingActionRow}>
                  <Pressable
                    style={styles.episodeCancelButton}
                    onPress={() => {
                      setIsHabitFormVisible(false);
                      setEditingHabitIndex(null);
                      setHabitText('');
                      setHabitInputHeight(48);
                      setHabitFormError('');
                    }}
                  >
                    <Text style={styles.episodeCancelButtonText}>閉じる</Text>
                  </Pressable>
                  <Pressable style={styles.episodeCreateButton} onPress={handleSaveHabit}>
                    <Text style={styles.episodeCreateButtonText}>登録</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {habitFormError ? <Text style={styles.episodeErrorText}>{habitFormError}</Text> : null}

            {habitNotes.length === 0 ? (
              <Text style={styles.emptyEpisodeText}>登録済みの習性はありません。</Text>
            ) : (
              habitNotes.map((note, index) => (
                <Pressable
                  key={`habit-${index}`}
                  style={styles.sayingCard}
                  onLongPress={() => handleLongPressHabit(index)}
                  delayLongPress={300}
                >
                  <Text style={styles.sayingCardText}>{note}</Text>
                </Pressable>
              ))
            )}
            </View>
          )}

          {activeTab === 'エピソード' && (
            <View style={styles.tabPane}>
            <View style={styles.episodeSearchRow}>
              <SelectInput
                value={episodeRoleDraft === 'all' ? '' : episodeRoleDraft}
                placeholder="全て"
                options={roleOptions}
                onChange={(value) => setEpisodeRoleDraft((value as RoleFilter) || 'all')}
                style={styles.episodeSearchCell}
              />
              <SelectInput
                value={episodeOtherParticipantDraft}
                placeholder="メンバー"
                options={participantOptions}
                onChange={setEpisodeOtherParticipantDraft}
                style={styles.episodeSearchCell}
              />
              <TextInput
                style={[styles.episodeSearchInput, styles.episodeSearchCell]}
                placeholder="タイトル名"
                placeholderTextColor="#94a3b8"
                value={episodeTitleDraft}
                onChangeText={setEpisodeTitleDraft}
              />
              <Pressable style={styles.episodeSearchButton} onPress={handleEpisodeSearch}>
                <Text style={styles.episodeSearchButtonText}>検索</Text>
              </Pressable>
            </View>

            <Pressable
              style={styles.episodeAddButton}
              onPress={() => {
                if (isEpisodeFormVisible && !editingEpisodeId) {
                  setIsEpisodeFormVisible(false);
                } else {
                  startCreateEpisode();
                }
              }}
            >
              <Text style={styles.episodeAddButtonText}>
                {isEpisodeFormVisible && !editingEpisodeId ? '閉じる' : '+ 追加'}
              </Text>
            </Pressable>

            {isEpisodeFormVisible && (
              <View style={styles.episodeFormCard}>
                <View style={styles.episodeTitleDateRow}>
                  <TextInput
                    style={[styles.episodeInput, styles.episodeTitleInput]}
                    placeholder="タイトル"
                    placeholderTextColor="#94a3b8"
                    value={newEpisodeTitle}
                    onChangeText={setNewEpisodeTitle}
                  />
                  <Pressable
                    style={[styles.episodeInput, styles.episodeDateInput]}
                    onPress={() => setShowEpisodeDatePicker(true)}
                  >
                    <Text style={newEpisodeDate ? styles.episodeDateText : styles.episodeDatePlaceholder}>
                      {newEpisodeDate || 'YYYY-MM-DD'}
                    </Text>
                  </Pressable>
                </View>
                {showEpisodeDatePicker && (
                  <View style={styles.datePickerWrap}>
                    <DateTimePicker
                      value={parseDateString(newEpisodeDate)}
                      mode="date"
                      display="spinner"
                      locale="ja-JP"
                      style={styles.datePickerSelf}
                      onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                        if (Platform.OS !== 'ios') setShowEpisodeDatePicker(false);
                        if (selected) setNewEpisodeDate(formatDateToYMD(selected));
                      }}
                    />
                    <Pressable style={styles.datePickerDone} onPress={() => setShowEpisodeDatePicker(false)}>
                      <Text style={styles.datePickerDoneText}>完了</Text>
                    </Pressable>
                  </View>
                )}
                <View style={styles.ownerRoleRow}>
                  <Text style={styles.ownerRoleLabel}>本人がメインか</Text>
                  <Pressable
                    style={[styles.roleToggleButton, isOwnerMainRole && styles.roleToggleButtonActive]}
                    onPress={() => setIsOwnerMainRole(true)}
                  >
                    <Text style={[styles.roleToggleButtonText, isOwnerMainRole && styles.roleToggleButtonTextActive]}>
                      メイン
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.roleToggleButton, !isOwnerMainRole && styles.roleToggleButtonActive]}
                    onPress={() => setIsOwnerMainRole(false)}
                  >
                    <Text
                      style={[styles.roleToggleButtonText, !isOwnerMainRole && styles.roleToggleButtonTextActive]}
                    >
                      サブ
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.episodeParticipantRow}>
                  <Text style={styles.episodeParticipantLabel}>参加者</Text>
                  <Pressable
                    style={styles.addParticipantButton}
                    onPress={() =>
                      setEpisodeParticipants((prev) => [
                        ...prev,
                        { participantType: 'individual', value: '', isMain: true },
                      ])
                    }
                  >
                    <Text style={styles.addParticipantButtonText}>+ 追加</Text>
                  </Pressable>
                </View>
                {episodeParticipants.map((participant, index) => (
                  <View key={`participant-${index}`} style={styles.participantItemCard}>
                    <View style={styles.participantTypeRow}>
                      <Text style={styles.participantTypeLabel}>登録種別</Text>
                      <Pressable
                        style={[
                          styles.roleToggleButton,
                          participant.participantType === 'individual' && styles.roleToggleButtonActive,
                        ]}
                        onPress={() =>
                          setEpisodeParticipants((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], participantType: 'individual', value: '' };
                            return next;
                          })
                        }
                      >
                        <Text
                          style={[
                            styles.roleToggleButtonText,
                            participant.participantType === 'individual' && styles.roleToggleButtonTextActive,
                          ]}
                        >
                          個人
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.roleToggleButton,
                          participant.participantType === 'group' && styles.roleToggleButtonActive,
                        ]}
                        onPress={() =>
                          setEpisodeParticipants((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], participantType: 'group', value: '' };
                            return next;
                          })
                        }
                      >
                        <Text
                          style={[
                            styles.roleToggleButtonText,
                            participant.participantType === 'group' && styles.roleToggleButtonTextActive,
                          ]}
                        >
                          所属
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.participantItemTopRow}>
                      <SelectInput
                        value={participant.value}
                        placeholder={
                          participant.participantType === 'individual' ? '名前（選択式）' : '所属グループ（選択式）'
                        }
                        options={participant.participantType === 'individual' ? participantOptions : affiliationOptions}
                        onChange={(value) =>
                          setEpisodeParticipants((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], value };
                            return next;
                          })
                        }
                        style={styles.participantNameSelect}
                      />
                    </View>
                    <View style={styles.participantRoleRow}>
                      <Text style={styles.participantRoleLabel}>メインか否か</Text>
                      <Pressable
                        style={[styles.roleToggleButton, participant.isMain && styles.roleToggleButtonActive]}
                        onPress={() =>
                          setEpisodeParticipants((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], isMain: true };
                            return next;
                          })
                        }
                      >
                        <Text
                          style={[styles.roleToggleButtonText, participant.isMain && styles.roleToggleButtonTextActive]}
                        >
                          メイン
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.roleToggleButton, !participant.isMain && styles.roleToggleButtonActive]}
                        onPress={() =>
                          setEpisodeParticipants((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], isMain: false };
                            return next;
                          })
                        }
                      >
                        <Text
                          style={[
                            styles.roleToggleButtonText,
                            !participant.isMain && styles.roleToggleButtonTextActive,
                          ]}
                        >
                          サブ
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                <View style={styles.episodeParticipantRow}>
                  <Text style={styles.episodeParticipantLabel}>公開範囲</Text>
                  <Pressable
                    style={styles.addParticipantButton}
                    onPress={() =>
                      setEpisodeVisibility((prev) => [...prev, { kind: 'individual', value: '' }])
                    }
                  >
                    <Text style={styles.addParticipantButtonText}>+ 追加</Text>
                  </Pressable>
                </View>
                {episodeVisibility.map((entry, index) => (
                  <View key={`episode-vis-${index}`} style={styles.participantItemCard}>
                    <View style={styles.participantTypeRow}>
                      <Text style={styles.participantTypeLabel}>登録種別</Text>
                      <Pressable
                        style={[
                          styles.roleToggleButton,
                          entry.kind === 'individual' && styles.roleToggleButtonActive,
                        ]}
                        onPress={() =>
                          setEpisodeVisibility((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], kind: 'individual', value: '' };
                            return next;
                          })
                        }
                      >
                        <Text
                          style={[
                            styles.roleToggleButtonText,
                            entry.kind === 'individual' && styles.roleToggleButtonTextActive,
                          ]}
                        >
                          個人
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.roleToggleButton, entry.kind === 'group' && styles.roleToggleButtonActive]}
                        onPress={() =>
                          setEpisodeVisibility((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], kind: 'group', value: '' };
                            return next;
                          })
                        }
                      >
                        <Text
                          style={[
                            styles.roleToggleButtonText,
                            entry.kind === 'group' && styles.roleToggleButtonTextActive,
                          ]}
                        >
                          所属
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.participantItemTopRow}>
                      <SelectInput
                        value={entry.value}
                        placeholder={
                          entry.kind === 'individual' ? '名前（選択式）' : '所属グループ（選択式）'
                        }
                        options={entry.kind === 'individual' ? visibilityIndividualOptions : affiliationOptions}
                        onChange={(value) =>
                          setEpisodeVisibility((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], value };
                            return next;
                          })
                        }
                        style={styles.participantNameSelect}
                      />
                    </View>
                  </View>
                ))}
                <TextInput
                  style={styles.episodeDescriptionInput}
                  placeholder="説明文の記入（記入式）"
                  placeholderTextColor="#94a3b8"
                  multiline
                  value={newEpisodeDescription}
                  onChangeText={setNewEpisodeDescription}
                />
                {episodeFormError ? <Text style={styles.episodeErrorText}>{episodeFormError}</Text> : null}
                <View style={styles.episodeFormActions}>
                  <Pressable
                    style={styles.episodeCancelButton}
                    onPress={() => {
                      resetEpisodeForm();
                      setIsEpisodeFormVisible(false);
                    }}
                  >
                    <Text style={styles.episodeCancelButtonText}>キャンセル</Text>
                  </Pressable>
                  <Pressable style={styles.episodeCreateButton} onPress={handleSaveEpisode}>
                    <Text style={styles.episodeCreateButtonText}>{editingEpisodeId ? '更新' : '保存'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {filteredEpisodes.length === 0 ? (
              <Text style={styles.emptyEpisodeText}>該当するエピソードはありません。</Text>
            ) : (
              filteredEpisodes.map((episode) => (
                <View
                  key={episode.id}
                  style={[
                    styles.episodeCard,
                    !episode.mainParticipants.includes(friend.id) && styles.episodeCardSubBackground,
                  ]}
                >
                  <View style={styles.episodeCardHeaderRow}>
                    <Text style={styles.episodeCardTitle}>{episode.title || '-'}</Text>
                    <View style={styles.episodeCardActions}>
                      <Pressable style={styles.episodeCardEditButton} onPress={() => startEditEpisode(episode)}>
                        <Text style={styles.episodeCardEditButtonText}>編集</Text>
                      </Pressable>
                      <Pressable style={styles.episodeCardDeleteButton} onPress={() => handleDeleteEpisode(episode.id)}>
                        <Text style={styles.episodeCardDeleteButtonText}>削除</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.episodeCardMetaRow}>
                    <View style={styles.episodeParticipantTagWrap}>
                      {(renderableParticipantsByEpisode.get(episode.id) ?? []).map((participant) => {
                        return (
                          <View
                            key={`${episode.id}-${participant.id}`}
                            style={[
                              styles.episodeParticipantTag,
                              participant.isMain && styles.episodeParticipantTagMain,
                            ]}
                          >
                            <Text style={styles.episodeParticipantTagName}>{participant.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <Text style={styles.episodeCardDate}>{episode.date || '-'}</Text>
                  </View>
                  <View style={styles.episodeVisibilityMetaRow}>
                    <Text style={styles.episodeVisibilityMetaLabel}>公開範囲</Text>
                    <View style={styles.episodeParticipantTagWrap}>
                      {(episode.visibilityEntries ?? []).length === 0 ? (
                        <Text style={styles.episodeVisibilityEmpty}>—</Text>
                      ) : (
                        (episode.visibilityEntries ?? []).map((entry) => {
                          const label =
                            entry.kind === 'group'
                              ? entry.value
                              : friendNameById.get(entry.value) ?? entry.value;
                          return (
                            <View
                              key={`${episode.id}-vis-${entry.kind}-${entry.value}`}
                              style={styles.episodeParticipantTag}
                            >
                              <Text style={styles.episodeParticipantTagName}>{label}</Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                  {(episodePhotosMap[episode.id] ?? []).length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.episodePhotoThumbScroll}
                      contentContainerStyle={styles.episodePhotoThumbRow}
                    >
                      {(episodePhotosMap[episode.id] ?? []).map((photo) => (
                        <Pressable
                          key={`${episode.id}-photo-${photo.id}`}
                          onPress={() => setLightboxPhoto(photo.photoUri)}
                        >
                          <Image source={{ uri: photo.photoUri }} style={styles.episodePhotoThumb} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                  <View style={styles.episodeDescriptionBox}>
                    <Text style={styles.episodeDescriptionText}>{episode.description || '-'}</Text>
                  </View>
                </View>
              ))
            )}
            </View>
          )}

          {activeTab === '彼曰く' && (
            <View style={styles.tabPane}>
            <View style={styles.sayingTopRow}>
              <View />
              <Pressable
                style={styles.episodeAddButton}
                onPress={() => {
                  if (isSayingFormVisible && !editingSayingId) {
                    setIsSayingFormVisible(false);
                    setSayingFormError('');
                    setSayingText('');
                    setSayingDate('');
                    setSayingInputHeight(48);
                  } else {
                    startCreateSaying();
                  }
                }}
              >
                <Text style={styles.episodeAddButtonText}>
                  {isSayingFormVisible && !editingSayingId ? '閉じる' : '+ 追加'}
                </Text>
              </Pressable>
            </View>

            {isSayingFormVisible && (
              <View style={styles.sayingFormCard}>
                <TextInput
                  style={[styles.sayingTextInput, { height: Math.max(48, sayingInputHeight) }]}
                  placeholder="彼曰く（自由記入）"
                  placeholderTextColor="#94a3b8"
                  multiline
                  value={sayingText}
                  onContentSizeChange={(event) => {
                    setSayingInputHeight(event.nativeEvent.contentSize.height + 20);
                  }}
                  onChangeText={setSayingText}
                />
                <TextInput
                  style={styles.sayingDateInput}
                  placeholder="YYYY-MM-DD（任意）"
                  placeholderTextColor="#94a3b8"
                  value={sayingDate}
                  onChangeText={setSayingDate}
                />
                <View style={styles.sayingActionRow}>
                  <Pressable
                    style={styles.episodeCancelButton}
                    onPress={() => {
                      setIsSayingFormVisible(false);
                      setEditingSayingId(null);
                      setSayingText('');
                      setSayingDate('');
                      setSayingInputHeight(48);
                      setSayingFormError('');
                    }}
                  >
                    <Text style={styles.episodeCancelButtonText}>閉じる</Text>
                  </Pressable>
                  <Pressable style={styles.episodeCreateButton} onPress={handleSaveSayings}>
                    <Text style={styles.episodeCreateButtonText}>登録</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {sayingFormError ? <Text style={styles.episodeErrorText}>{sayingFormError}</Text> : null}

            {sortedSayings.length === 0 ? (
              <Text style={styles.emptyEpisodeText}>登録済みの彼曰くはありません。</Text>
            ) : (
              sortedSayings.map((saying: Saying) => (
                <Pressable
                  key={saying.id}
                  style={styles.sayingCard}
                  onLongPress={() => handleLongPressSaying(saying)}
                  delayLongPress={300}
                >
                  <View style={styles.sayingInlineRow}>
                    <Text style={styles.sayingCardText}>{saying.text}</Text>
                    {saying.date ? <Text style={styles.sayingCardDate}>{saying.date}</Text> : null}
                  </View>
                </Pressable>
              ))
            )}
            </View>
          )}
          </View>
        </View>
      </KeyboardAwareScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={lightboxPhoto !== null}
        onRequestClose={() => setLightboxPhoto(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <Pressable style={styles.lightboxBackdropPress} onPress={() => setLightboxPhoto(null)} />
          {lightboxPhoto ? (
            <Image source={{ uri: lightboxPhoto }} style={styles.lightboxImage} resizeMode="contain" />
          ) : null}
          <Pressable style={styles.lightboxCloseButton} onPress={() => setLightboxPhoto(null)}>
            <Text style={styles.lightboxCloseButtonText}>閉じる</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2f5f8',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerName: {
    width: '60%',
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: '#fff',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  byTag: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 0,
  },
  byTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  editButton: {
    backgroundColor: '#67e8f9',
    borderColor: '#0891b2',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#083344',
  },
  homeButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  homeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    gap: 10,
  },
  profilePhoto: {
    width: 118,
    height: 150,
    borderRadius: 10,
  },
  profilePhotoPlaceholder: {
    backgroundColor: '#f1f5f9',
    borderColor: '#94a3b8',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  profilePhotoPlaceholderText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  profileRight: {
    flex: 1,
    gap: 3,
  },
  keyValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyValueLabel: {
    width: 58,
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  keyValueValue: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  descriptionText: {
    color: '#1e293b',
    lineHeight: 20,
    fontSize: 14,
  },
  tabSection: {
    gap: 0,
    backgroundColor: 'transparent',
  },
  tabRowContainer: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    margin: 0,
  },
  tabButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    margin: 0,
    gap: 0,
  },
  tabButton: {
    paddingHorizontal: 17.5,
    paddingVertical: 8,
    borderColor: '#aaa',
    borderWidth: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginBottom: 0,
  },
  tabButtonInactive: {
    backgroundColor: '#e0e0e0',
    borderBottomWidth: 2,
    zIndex: 0,
  },
  tabButtonActive: {
    backgroundColor: '#fff',
    borderBottomWidth: 0,
    zIndex: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabButtonTextInactive: {
    color: '#aaa',
  },
  tabButtonTextActive: {
    color: '#888',
  },
  tabContentArea: {
    backgroundColor: '#fff',
    borderColor: '#aaa',
    borderWidth: 2,
    borderTopWidth: 0,
    borderRadius: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    zIndex: 0,
    margin: 0,
    paddingTop: 0,
  },
  tabContentAreaLeftConnected: {
    borderTopLeftRadius: 0,
  },
  tabContentAreaRounded: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tabPane: {
    padding: 10,
  },
  multiValuePlainContainer: {
    padding: 0,
  },
  multiValueCard: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    margin: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  habitInput: {
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    textAlignVertical: 'top',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    fontSize: 14,
  },
  addHabitButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addHabitButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
  },
  episodeSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  episodeSearchCell: {
    flex: 1,
  },
  episodeSelectButton: {
    minHeight: 38,
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  episodeSelectText: {
    fontSize: 13,
    color: '#0f172a',
  },
  episodeSelectPlaceholder: {
    fontSize: 13,
    color: '#94a3b8',
  },
  episodeSearchInput: {
    minHeight: 38,
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  episodeSearchButton: {
    minWidth: 58,
    minHeight: 38,
    backgroundColor: '#ffffff',
    borderColor: '#0f172a',
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  episodeSearchButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
  },
  episodeAddButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 10,
  },
  episodeAddButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
  },
  episodeFormCard: {
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
  },
  episodeTitleDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  episodeInput: {
    minHeight: 38,
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#ffffff',
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
    fontSize: 13,
    color: '#111827',
  },
  episodeDatePlaceholder: {
    fontSize: 13,
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
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    marginTop: 8,
  },
  datePickerDoneText: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 13,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addParticipantButtonText: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
  },
  ownerRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ownerRoleLabel: {
    fontSize: 13,
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
  participantItemCard: {
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
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
  episodeDescriptionInput: {
    minHeight: 86,
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
    color: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  episodeCreateButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#67e8f9',
    borderColor: '#0891b2',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  episodeCreateButtonText: {
    color: '#083344',
    fontWeight: '700',
    fontSize: 13,
  },
  episodeFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  episodeCancelButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  episodeCancelButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
  },
  episodeErrorText: {
    color: '#b91c1c',
    marginBottom: 8,
    fontSize: 12,
  },
  episodeCard: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  episodeCardSubBackground: {
    backgroundColor: '#f1f5f9',
  },
  episodeCardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  episodeCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  episodeCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  episodeVisibilityMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  episodeVisibilityMetaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    paddingTop: 4,
    width: 64,
  },
  episodeVisibilityEmpty: {
    fontSize: 13,
    color: '#94a3b8',
    paddingTop: 4,
  },
  episodeCardDate: {
    fontSize: 13,
    fontWeight: 'normal',
    color: '#9ca3af',
  },
  episodeParticipantTagWrap: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    flex: 1,
    gap: 6,
  },
  episodeParticipantTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeParticipantTagMain: {
    borderColor: '#67e8f9',
  },
  episodeParticipantTagName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  episodeDescriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1e293b',
  },
  episodePhotoThumbScroll: {
    marginBottom: 8,
  },
  episodePhotoThumbRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  episodePhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
  },
  episodeDescriptionBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  lightboxBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
  lightboxCloseButton: {
    position: 'absolute',
    top: 52,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  lightboxCloseButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  episodeCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  episodeCardEditButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeCardEditButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  episodeCardDeleteButton: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeCardDeleteButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991b1b',
  },
  emptyEpisodeText: {
    fontSize: 13,
    color: '#64748b',
  },
  sayingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sayingFormCard: {
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  sayingTextInput: {
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    textAlignVertical: 'top',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 6,
  },
  sayingDateInput: {
    minHeight: 38,
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    paddingHorizontal: 10,
    fontSize: 13,
  },
  sayingActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  sayingCard: {
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  sayingInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  sayingCardText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
    textAlign: 'left',
  },
  sayingCardDate: {
    fontSize: 12,
    color: '#999',
    fontWeight: 'normal',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  modalOptions: {
    marginBottom: 10,
  },
  modalOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  modalCloseButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  multiValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  multiValueRowWithDivider: {
    borderTopColor: '#cbd5e1',
    borderTopWidth: 1,
  },
  multiValueLabel: {
    width: 58,
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
    paddingTop: 4,
  },
  multiValueChipArea: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  chip: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  chipText: {
    color: '#1e293b',
    fontSize: 14,
  },
  missingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  missingText: {
    fontSize: 15,
    color: '#334155',
  },
  backButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
});

