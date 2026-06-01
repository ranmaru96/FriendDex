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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import {
  createEpisode,
  createSayings,
  deleteSaying,
  deleteEpisode,
  getAllFriends,
  getFriendById,
  getMyself,
  getProfilesByFriendId,
  initializeDatabase,
  setDefaultProfile,
  updateFriend,
  updateEpisode,
  updateSaying,
} from './db';
import { Episode, EpisodeParticipant, EpisodeVisibilityEntry, Friend, Profile, Saying } from './types';
import { buildParticipantChips, getVisibilityModeLabel, visibilityModeTagStyles } from './utils/episodeHelpers';

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

const formatEpisodeDateForCard = (date: string): string => {
  if (!date.trim()) return '-';
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '-';
  const [, month, day] = parts;
  return `${month}月${day}日`;
};

const formatProfileSinceYear = (createdAt: string | undefined): string => {
  if (!createdAt?.trim()) {
    return '—';
  }
  const year = new Date(createdAt).getFullYear();
  return Number.isNaN(year) ? '—' : String(year);
};

const computeProfileCompleteness = (friend: Friend, hasPhoto: boolean): number => {
  const completenessFields = [
    hasPhoto ? friend.photoUri : null,
    friend.mbti?.trim() || null,
    friend.birthday?.trim() || null,
    friend.origin?.trim() || null,
    friend.residence?.trim() || null,
    friend.height,
    friend.weight,
    friend.description?.trim() || null,
    friend.category?.trim() || null,
    friend.affiliations.some((value) => value.trim()) ? 'ok' : null,
    friend.personalities.some((value) => value.trim()) ? 'ok' : null,
    friend.likes.some((value) => value.trim()) ? 'ok' : null,
    friend.dislikes.some((value) => value.trim()) ? 'ok' : null,
  ];
  return Math.round((completenessFields.filter(Boolean).length / completenessFields.length) * 100);
};

type DetailTabKey = '情報' | 'エピソード' | '習性' | 'メモ' | '彼曰く';
type Option = {
  label: string;
  value: string;
};
type EpisodeParticipantDraft = {
  participantType: 'individual' | 'group';
  value: string;
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

const INFO_CHIP_STYLES: Record<string, { backgroundColor: string; color: string }> = {
  所属: { backgroundColor: '#2d1f50', color: '#c4b5fd' },
  経験: { backgroundColor: '#0f2e28', color: '#5eead4' },
  性格: { backgroundColor: '#0d1e32', color: '#93c5fd' },
  好物: { backgroundColor: '#1e2010', color: '#a3e635' },
  苦手: { backgroundColor: '#2e1010', color: '#f87171' },
};

function MultiValueSummarySection({ rows, withCard = true }: { rows: MultiValueRow[]; withCard?: boolean }) {
  return (
    <View style={withCard ? styles.multiValueCard : styles.multiValuePlainContainer}>
      {rows.map((row, rowIndex) => {
        const chipColors = INFO_CHIP_STYLES[row.title] ?? { backgroundColor: '#1e1e2e', color: '#9ca3af' };
        return (
          <View
            key={row.title}
            style={[styles.multiValueRow, rowIndex < rows.length - 1 && styles.multiValueRowWithDivider]}
          >
            <Text style={styles.multiValueLabel}>{row.title}</Text>
            <View style={styles.multiValueChipArea}>
              {(row.values.length > 0 ? row.values : ['-']).map((value, index) => (
                <View
                  key={`${row.title}-${index}-${value}`}
                  style={[styles.chip, { backgroundColor: chipColors.backgroundColor }]}
                >
                  <Text style={[styles.chipText, { color: chipColors.color }]}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

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
  const [episodeOtherParticipantDraft, setEpisodeOtherParticipantDraft] = useState('');
  const [episodeOtherParticipantFilter, setEpisodeOtherParticipantFilter] = useState('');
  const [episodeTitleDraft, setEpisodeTitleDraft] = useState('');
  const [episodeTitleFilter, setEpisodeTitleFilter] = useState('');
  const [isEpisodeFormVisible, setIsEpisodeFormVisible] = useState(false);
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [newEpisodeTitle, setNewEpisodeTitle] = useState('');
  const [newEpisodeDate, setNewEpisodeDate] = useState('');
  const [showEpisodeDatePicker, setShowEpisodeDatePicker] = useState(false);
  const [showSayingDatePicker, setShowSayingDatePicker] = useState(false);
  const [newEpisodeDescription, setNewEpisodeDescription] = useState('');
  const [episodeParticipants, setEpisodeParticipants] = useState<EpisodeParticipantDraft[]>([]);
  const [episodeVisibility, setEpisodeVisibility] = useState<EpisodeVisibilityDraft[]>([]);
  const [episodeFormError, setEpisodeFormError] = useState('');
  const [isSayingFormVisible, setIsSayingFormVisible] = useState(false);
  const [editingSayingId, setEditingSayingId] = useState<string | null>(null);
  const [sayingText, setSayingText] = useState('');
  const [sayingDate, setSayingDate] = useState('');
  const [sayingInputHeight, setSayingInputHeight] = useState(48);
  const [sayingFormError, setSayingFormError] = useState('');

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
    setEpisodeOtherParticipantDraft('');
    setEpisodeOtherParticipantFilter('');
    setEpisodeTitleDraft('');
    setEpisodeTitleFilter('');
    setIsEpisodeFormVisible(false);
    setEditingEpisodeId(null);
    setNewEpisodeTitle('');
    setNewEpisodeDate('');
    setNewEpisodeDescription('');
    setEpisodeParticipants([]);
    setEpisodeVisibility([]);
    setEpisodeFormError('');
    setIsSayingFormVisible(false);
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    setSayingFormError('');
    setShowSayingDatePicker(false);
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

  const filteredEpisodes = useMemo(() => {
    return sortedEpisodes.filter((episode) => {
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
  }, [episodeOtherParticipantFilter, episodeTitleFilter, sortedEpisodes]);

  const sortedSayings = useMemo(() => {
    if (!friend) return [];
    return [...friend.sayings].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return -1;
      if (!b.date) return 1;
      return b.date.localeCompare(a.date);
    });
  }, [friend]);

  const heroInitial = useMemo(() => {
    if (!friend?.name.trim()) {
      return '?';
    }
    return friend.name.trim().slice(0, 1);
  }, [friend]);

  const heroBirthdayLabel = useMemo(() => {
    if (!friend?.birthday.trim()) {
      return '';
    }
    const formatted = formatEpisodeDateForCard(friend.birthday);
    return formatted === '-' ? '' : formatted;
  }, [friend]);

  const profileCompleteness = useMemo(() => {
    if (!friend) {
      return 0;
    }
    const hasPhoto = Boolean(friend.photoUri?.trim()) && !profileImageLoadError;
    return computeProfileCompleteness(friend, hasPhoto);
  }, [friend, profileImageLoadError]);

  const sinceYear = useMemo(
    () => formatProfileSinceYear(selectedProfile?.createdAt),
    [selectedProfile]
  );

  const handleEpisodeSearch = () => {
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
    setShowSayingDatePicker(false);
    loadFriend();
  };

  const startCreateSaying = () => {
    setSayingFormError('');
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    setShowSayingDatePicker(false);
    setIsSayingFormVisible(true);
  };

  const startEditSaying = (saying: Saying) => {
    setSayingFormError('');
    setEditingSayingId(saying.id);
    setSayingText(saying.text);
    setSayingDate(saying.date);
    setSayingInputHeight(48);
    setShowSayingDatePicker(false);
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
            setShowSayingDatePicker(false);
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
    const participantDrafts: EpisodeParticipantDraft[] = entries
      .filter((entry) => !(entry.kind === 'individual' && entry.value === friendId))
      .map((entry) => ({
        participantType: entry.kind,
        value: entry.value,
      }));
    setEditingEpisodeId(episode.id);
    setNewEpisodeTitle(episode.title);
    setNewEpisodeDate(episode.date);
    setNewEpisodeDescription(episode.description);
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
        isMain: true,
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
    const mainParticipants = [friend.id];
    const subParticipants: string[] = [];
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
        <View style={styles.hero}>
          <View style={styles.heroIdentityRow}>
            {friend.photoUri && !profileImageLoadError ? (
              <Image
                source={{ uri: friend.photoUri }}
                style={styles.heroPhoto}
                onError={() => setProfileImageLoadError(true)}
              />
            ) : (
              <View style={styles.heroPhotoInitial}>
                <Text style={styles.heroPhotoInitialText}>{heroInitial}</Text>
              </View>
            )}
            <View style={styles.heroIdentityCol}>
              <View style={styles.heroNameRow}>
                <Text style={styles.heroName} numberOfLines={2}>
                  {friend.name}
                </Text>
                <View style={styles.heroIconActions}>
                  <Pressable
                    style={styles.heroEditButton}
                    onPress={() => router.push({ pathname: '/edit', params: { id: friend.id } })}
                  >
                    <Ionicons name="pencil-outline" size={16} color="#a78bfa" />
                  </Pressable>
                  <Pressable style={styles.heroHomeButton} onPress={() => router.replace('/')}>
                    <Ionicons name="home-outline" size={16} color="#555566" />
                  </Pressable>
                </View>
              </View>
              {friend.nickname.trim() ? <Text style={styles.heroNickname}>{friend.nickname}</Text> : null}
              {selectableProfiles.length > 0 ? (
                <Pressable onPress={openProfileSwitcher}>
                  <Text style={styles.heroByTag}>{`by ${profileTagLabel}`}</Text>
                </Pressable>
              ) : null}
              {friend.mbti || heroBirthdayLabel || friend.category.trim() ? (
                <View style={styles.heroTagRow}>
                  {friend.mbti ? (
                    <View style={styles.heroTagMbti}>
                      <Text style={styles.heroTagMbtiText}>{friend.mbti}</Text>
                    </View>
                  ) : null}
                  {heroBirthdayLabel ? (
                    <View style={styles.heroTagBirthday}>
                      <Text style={styles.heroTagBirthdayText}>{heroBirthdayLabel}</Text>
                    </View>
                  ) : null}
                  {friend.category.trim() ? (
                    <View style={styles.heroTagCategory}>
                      <Text style={styles.heroTagCategoryText}>{friend.category}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {friend.description.trim() ? (
                <Text style={styles.heroDescription}>{friend.description}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCell}>
              <Text style={styles.heroStatLabel}>EPISODES</Text>
              <View style={styles.heroStatValueRow}>
                <Text style={styles.heroStatValue}>{friend.episodes.length}</Text>
                <Text style={styles.heroStatUnit}>件</Text>
              </View>
            </View>
            <View style={styles.heroStatCell}>
              <Text style={styles.heroStatLabel}>習性 + 彼曰く</Text>
              <View style={styles.heroStatValueRow}>
                <Text style={styles.heroStatValue}>{habitNotes.length + sortedSayings.length}</Text>
                <Text style={styles.heroStatUnit}>件</Text>
              </View>
            </View>
            <View style={styles.heroStatCell}>
              <Text style={styles.heroStatLabel}>SINCE</Text>
              <View style={styles.heroStatValueRow}>
                <Text style={styles.heroStatValue}>{sinceYear}</Text>
                <Text style={styles.heroStatUnit}>年〜</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroCompletenessSection}>
            <View style={styles.heroCompletenessHeader}>
              <Text style={styles.heroCompletenessLabel}>PROFILE COMPLETENESS</Text>
              <Text style={styles.heroCompletenessPercent}>{profileCompleteness}%</Text>
            </View>
            <View style={styles.heroCompletenessTrack}>
              <View style={[styles.heroCompletenessFill, { width: `${profileCompleteness}%` }]} />
            </View>
          </View>
        </View>

        <View style={styles.tabSection}>
          <View style={styles.tabRowContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabButtonRow}>
              {(['情報', 'エピソード', '習性', '彼曰く', 'メモ'] as DetailTabKey[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
                >
                  <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
                  placeholderTextColor="#555566"
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
                  style={styles.habitCard}
                  onLongPress={() => handleLongPressHabit(index)}
                  delayLongPress={300}
                >
                  <View style={styles.habitCardAccent} />
                  <Text style={styles.habitCardText}>{note}</Text>
                </Pressable>
              ))
            )}
            </View>
          )}

          {activeTab === 'エピソード' && (
            <View style={styles.tabPane}>
            <View style={styles.episodeSearchRow}>
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
                placeholderTextColor="#555566"
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
                    placeholderTextColor="#555566"
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
                      themeVariant="dark"
                      textColor="#ffffff"
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
                <View style={styles.episodeParticipantRow}>
                  <Text style={styles.episodeParticipantLabel}>参加者</Text>
                  <Pressable
                    style={styles.addParticipantButton}
                    onPress={() =>
                      setEpisodeParticipants((prev) => [
                        ...prev,
                        { participantType: 'individual', value: '' },
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
                  placeholderTextColor="#555566"
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
              filteredEpisodes.map((episode) => {
                const isMyEpisode = myselfId !== null && episode.authorFriendId === myselfId;
                const chips = buildParticipantChips(episode, friendNameById);
                const modeStyles = isMyEpisode ? visibilityModeTagStyles(episode.visibilityMode) : null;
                const posterName = friendNameById.get(episode.authorFriendId) ?? episode.authorFriendId;

                return (
                  <Pressable
                    key={episode.id}
                    onPress={() =>
                      router.push({
                        pathname: '/episode-detail',
                        params: {
                          episodeId: episode.id,
                          ownerId: episode.authorFriendId || friend.id,
                        },
                      })
                    }
                  >
                    <View style={styles.episodeCard}>
                      <View style={styles.episodeCardRow1}>
                        <View style={styles.titlePill}>
                          <Text style={styles.titlePillText} numberOfLines={1}>
                            {episode.title || '-'}
                          </Text>
                        </View>
                        <Text style={styles.episodeCardDateText}>{formatEpisodeDateForCard(episode.date)}</Text>
                        {isMyEpisode && modeStyles ? (
                          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, modeStyles.tag]}>
                            <Text style={[styles.episodeParticipantTagName, modeStyles.text]}>
                              {getVisibilityModeLabel(episode.visibilityMode)}
                            </Text>
                          </View>
                        ) : !isMyEpisode ? (
                          <View style={styles.episodeParticipantTag}>
                            <Text style={styles.episodeParticipantTagName} numberOfLines={1}>
                              {posterName || '-'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {chips.length > 0 ? (
                        <View style={styles.episodeCardRow2}>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.episodeParticipantTagScroll}
                            contentContainerStyle={styles.episodeParticipantTagWrap}
                          >
                            {chips.map((participant) => (
                              <View key={participant.id} style={styles.episodeParticipantTag}>
                                <Text style={styles.episodeParticipantTagName}>{participant.label}</Text>
                              </View>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
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
                    setShowSayingDatePicker(false);
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
                  placeholderTextColor="#555566"
                  multiline
                  value={sayingText}
                  onContentSizeChange={(event) => {
                    setSayingInputHeight(event.nativeEvent.contentSize.height + 20);
                  }}
                  onChangeText={setSayingText}
                />
                <Pressable
                  style={[styles.episodeInput, styles.sayingDateInput]}
                  onPress={() => setShowSayingDatePicker(true)}
                >
                  <Text style={sayingDate ? styles.episodeDateText : styles.episodeDatePlaceholder}>
                    {sayingDate || 'YYYY-MM-DD（任意）'}
                  </Text>
                </Pressable>
                {showSayingDatePicker && (
                  <View style={styles.datePickerWrap}>
                    <DateTimePicker
                      value={parseDateString(sayingDate)}
                      mode="date"
                      display="spinner"
                      locale="ja-JP"
                      themeVariant="dark"
                      textColor="#ffffff"
                      style={styles.datePickerSelf}
                      onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                        if (Platform.OS !== 'ios') setShowSayingDatePicker(false);
                        if (selected) setSayingDate(formatDateToYMD(selected));
                      }}
                    />
                    <Pressable style={styles.datePickerDone} onPress={() => setShowSayingDatePicker(false)}>
                      <Text style={styles.datePickerDoneText}>完了</Text>
                    </Pressable>
                  </View>
                )}
                <View style={styles.sayingActionRow}>
                  <Pressable
                    style={styles.episodeCancelButton}
                    onPress={() => {
                      setIsSayingFormVisible(false);
                      setEditingSayingId(null);
                      setSayingText('');
                      setSayingDate('');
                      setSayingInputHeight(48);
                      setShowSayingDatePicker(false);
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
                  style={styles.sayingQuoteCard}
                  onLongPress={() => handleLongPressSaying(saying)}
                  delayLongPress={300}
                >
                  <View style={styles.sayingQuoteAccent} />
                  <View style={styles.sayingQuoteBody}>
                    <Text style={styles.sayingQuoteText}>{saying.text}</Text>
                    {saying.date ? <Text style={styles.sayingQuoteDate}>{saying.date}</Text> : null}
                  </View>
                </Pressable>
              ))
            )}
            </View>
          )}
          </View>
        </View>
      </KeyboardAwareScrollView>
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
  hero: {
    backgroundColor: '#0d0d14',
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderRadius: 12,
  },
  heroIdentityRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroPhoto: {
    width: 132,
    height: 132,
    borderRadius: 12,
  },
  heroPhotoInitial: {
    width: 132,
    height: 132,
    borderRadius: 12,
    backgroundColor: '#1e1230',
    borderWidth: 1.5,
    borderColor: 'rgba(167,139,250,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPhotoInitialText: {
    fontSize: 48,
    fontWeight: '500',
    color: '#c4b5fd',
  },
  heroIdentityCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroName: {
    flex: 1,
    fontSize: 22,
    fontWeight: '500',
    color: '#e8e8f0',
  },
  heroIconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroEditButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(45,31,80,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.27)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHomeButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroNickname: {
    fontSize: 14,
    color: '#a78bfa',
  },
  heroByTag: {
    fontSize: 10,
    color: '#c4b5fd',
    fontWeight: '500',
  },
  heroTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  heroTagMbti: {
    backgroundColor: '#2d1f50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  heroTagMbtiText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#c4b5fd',
  },
  heroTagBirthday: {
    backgroundColor: '#0f2e28',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  heroTagBirthdayText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5eead4',
  },
  heroTagCategory: {
    backgroundColor: '#1e1e2e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  heroTagCategoryText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#888899',
  },
  heroDescription: {
    fontSize: 11,
    color: '#555566',
    lineHeight: 16,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  heroStatCell: {
    flex: 1,
    backgroundColor: '#13131f',
    borderWidth: 0.5,
    borderColor: '#2a2a3a',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  heroStatLabel: {
    fontSize: 9,
    color: '#555566',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  heroStatValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '500',
    color: '#e8e8f0',
  },
  heroStatUnit: {
    fontSize: 10,
    color: '#555566',
  },
  heroCompletenessSection: {
    marginTop: 10,
  },
  heroCompletenessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroCompletenessLabel: {
    fontSize: 9,
    color: '#555566',
    letterSpacing: 0.3,
  },
  heroCompletenessPercent: {
    fontSize: 10,
    color: '#a78bfa',
  },
  heroCompletenessTrack: {
    height: 4,
    backgroundColor: '#1e1e2e',
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  heroCompletenessFill: {
    height: 4,
    backgroundColor: '#a78bfa',
    borderRadius: 2,
  },
  tabSection: {
    gap: 0,
    backgroundColor: '#0d0d14',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabRowContainer: {
    backgroundColor: '#0d0d14',
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e2e',
  },
  tabButtonRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#a78bfa',
  },
  tabButtonText: {
    fontSize: 12,
    color: '#555566',
  },
  tabButtonTextActive: {
    color: '#a78bfa',
  },
  tabContentArea: {
    backgroundColor: '#0d0d14',
    margin: 0,
    paddingTop: 0,
  },
  tabPane: {
    backgroundColor: '#0d0d14',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  multiValuePlainContainer: {
    padding: 0,
    backgroundColor: '#0d0d14',
  },
  multiValueCard: {
    backgroundColor: '#0d0d14',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
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
    height: 36,
    backgroundColor: '#13131f',
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  episodeSelectText: {
    fontSize: 13,
    color: '#e8e8f0',
  },
  episodeSelectPlaceholder: {
    fontSize: 13,
    color: '#555566',
  },
  episodeSearchInput: {
    height: 36,
    backgroundColor: '#13131f',
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#e8e8f0',
  },
  episodeSearchButton: {
    minWidth: 58,
    height: 36,
    backgroundColor: '#2d1f50',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  episodeSearchButtonText: {
    color: '#c4b5fd',
    fontWeight: '500',
    fontSize: 13,
  },
  episodeAddButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#a78bfa',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 10,
  },
  episodeAddButtonText: {
    color: '#0d0d14',
    fontWeight: '500',
    fontSize: 13,
  },
  episodeFormCard: {
    backgroundColor: '#13131f',
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    marginBottom: 10,
  },
  episodeTitleDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  episodeInput: {
    minHeight: 38,
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 10,
    backgroundColor: '#0d0d14',
    color: '#e8e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
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
    color: '#e8e8f0',
  },
  episodeDatePlaceholder: {
    fontSize: 13,
    color: '#555566',
  },
  datePickerWrap: {
    marginBottom: 8,
    backgroundColor: '#0d0d14',
    borderRadius: 10,
    paddingVertical: 4,
  },
  datePickerSelf: {
    alignSelf: 'flex-end',
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2d1f50',
    marginTop: 8,
  },
  datePickerDoneText: {
    color: '#c4b5fd',
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
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  addParticipantButton: {
    backgroundColor: '#2d1f50',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addParticipantButtonText: {
    color: '#c4b5fd',
    fontSize: 12,
    fontWeight: '500',
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
    backgroundColor: '#0d0d14',
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  roleToggleButtonActive: {
    backgroundColor: '#2d1f50',
    borderColor: '#a78bfa',
  },
  roleToggleButtonText: {
    color: '#555566',
    fontSize: 12,
    fontWeight: '500',
  },
  roleToggleButtonTextActive: {
    color: '#c4b5fd',
  },
  participantItemCard: {
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    backgroundColor: '#0d0d14',
  },
  participantTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  participantTypeLabel: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
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
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 10,
    backgroundColor: '#0d0d14',
    textAlignVertical: 'top',
    color: '#e8e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  episodeCreateButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#a78bfa',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  episodeCreateButtonText: {
    color: '#0d0d14',
    fontWeight: '500',
    fontSize: 13,
  },
  episodeFormActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  episodeCancelButton: {
    backgroundColor: 'transparent',
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  episodeCancelButtonText: {
    color: '#555566',
    fontWeight: '500',
    fontSize: 13,
  },
  episodeErrorText: {
    color: '#b91c1c',
    marginBottom: 8,
    fontSize: 12,
  },
  episodeCard: {
    backgroundColor: '#13131f',
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  episodeCardRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  titlePill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#1e1e2e',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  titlePillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#e8e8f0',
  },
  episodeCardDateText: {
    fontSize: 11,
    color: '#555566',
    flexShrink: 0,
  },
  episodeCardRow2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
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
    gap: 6,
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 999,
    backgroundColor: '#1e1e2e',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  episodeParticipantTagMain: {
    borderColor: '#67e8f9',
  },
  episodeParticipantTagName: {
    fontSize: 10,
    fontWeight: '500',
    color: '#9ca3af',
  },
  visibilityModeTag: {
    flexShrink: 0,
    borderWidth: 1,
  },
  emptyEpisodeText: {
    fontSize: 13,
    color: '#555566',
  },
  sayingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sayingFormCard: {
    backgroundColor: '#13131f',
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  sayingTextInput: {
    borderColor: '#2a2a3a',
    borderWidth: 0.5,
    borderRadius: 10,
    backgroundColor: '#0d0d14',
    color: '#e8e8f0',
    textAlignVertical: 'top',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    minHeight: 72,
    marginBottom: 8,
  },
  sayingDateInput: {
    width: '100%',
    marginBottom: 8,
    justifyContent: 'center',
  },
  sayingActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  habitCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#13131f',
    borderWidth: 0.5,
    borderColor: '#1e1e2e',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  habitCardAccent: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: '#a78bfa',
    borderRadius: 1,
  },
  habitCardText: {
    flex: 1,
    fontSize: 13,
    color: '#c4c4d4',
    lineHeight: 20,
    paddingLeft: 10,
  },
  sayingQuoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#13131f',
    borderWidth: 0.5,
    borderColor: '#2a2a3a',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    padding: 12,
    marginBottom: 8,
  },
  sayingQuoteAccent: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: '#a78bfa',
    borderRadius: 1,
  },
  sayingQuoteBody: {
    flex: 1,
    paddingLeft: 10,
  },
  sayingQuoteText: {
    fontSize: 13,
    color: '#c4b5fd',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  sayingQuoteDate: {
    fontSize: 10,
    color: '#555566',
    marginTop: 4,
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
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 12,
    gap: 10,
  },
  multiValueRowWithDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e2e',
  },
  multiValueLabel: {
    width: 40,
    fontSize: 13,
    color: '#555566',
    flexShrink: 0,
  },
  multiValueChipArea: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'flex-start',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
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

