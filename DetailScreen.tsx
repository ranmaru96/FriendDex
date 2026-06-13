import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { DetailTabKey } from '@/constants/detailThemes';
import { Radius, Typography, Spacing } from '@/constants/theme';
import { useDetailDesign } from './contexts/DetailDesignContext';
import { createDetailStyles } from './utils/detailStyles';
import type { DetailThemeColors } from '@/constants/detailThemes';
import {
  createEpisode,
  createSayings,
  deleteSaying,
  deleteEpisode,
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeParticipantFriendIds,
  getFriendById,
  getMyself,
  getProfilesByFriendId,
  initializeDatabase,
  setDefaultProfile,
  updateFriend,
  updateEpisode,
  updateSaying,
} from './db';
import {
  Episode,
  EpisodeVisibilityMode,
  Friend,
  Profile,
  Saying,
} from './types';
import {
  buildParticipantChips,
  canManageEpisode,
  getVisibilityModeLabel,
  resolveEpisodeRecordOwnerId,
} from './utils/episodeHelpers';
import { EpisodeFormOverlay } from '@/components/episode/EpisodeFormOverlay';
import { useEpisodeForm } from '@/hooks/useEpisodeForm';

const EPISODE_PICKER_COLUMNS = 3;
const EPISODE_PICKER_GAP = 6;

function buildEpisodeVisibilityTagStyles(c: DetailThemeColors): Record<
  EpisodeVisibilityMode,
  { tag: object; text: object }
> {
  return {
    private: {
      tag: { backgroundColor: c.badgePrivateBg, borderWidth: 1, borderColor: c.border },
      text: { color: c.badgePrivateText },
    },
    public: {
      tag: { backgroundColor: c.badgePublicBg, borderWidth: 1, borderColor: c.accent },
      text: { color: c.badgePublicText },
    },
    limited: {
      tag: { backgroundColor: c.badgeLimitedBg, borderWidth: 1, borderColor: c.border },
      text: { color: c.badgeLimitedText },
    },
  };
}

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

type Option = {
  label: string;
  value: string;
};

function MultiValueSummarySection({ rows, withCard = true }: { rows: MultiValueRow[]; withCard?: boolean }) {
  const { bundle } = useDetailDesign();
  const styles = useMemo(() => createDetailStyles(bundle.colors), [bundle.colors]);
  const c = bundle.colors;
  return (
    <View style={withCard ? styles.multiValueCard : styles.multiValuePlainContainer}>
      {rows.map((row, rowIndex) => {
        const chipColors = bundle.infoChipStyles[row.title] ?? {
          backgroundColor: 'transparent',
          borderColor: c.border,
          color: c.textSecondary,
          borderWidth: 1.5,
        };
        return (
          <View
            key={row.title}
            style={[
              styles.multiValueRow,
              rowIndex < rows.length - 1 && styles.multiValueRowWithDivider,
              rowIndex === rows.length - 1 && styles.multiValueRowLast,
            ]}
          >
            <Text style={styles.multiValueLabel}>{row.title}</Text>
            <View style={styles.multiValueChipArea}>
              {(row.values.length > 0 ? row.values : ['-']).map((value, index) => (
                <View
                  key={`${row.title}-${index}-${value}`}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: chipColors.backgroundColor,
                      borderColor: chipColors.borderColor,
                      borderWidth: chipColors.borderWidth,
                    },
                  ]}
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
  const { bundle, reload: reloadDetailDesign } = useDetailDesign();
  const c = bundle.colors;
  const styles = useMemo(() => createDetailStyles(c), [c]);
  const detailTabs = bundle.detailTabs;
  const episodeVisibilityTagStyles = useMemo(() => buildEpisodeVisibilityTagStyles(c), [c]);
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
  const [episodeFilterSelectedIdsDraft, setEpisodeFilterSelectedIdsDraft] = useState<Set<string>>(
    () => new Set()
  );
  const [episodeFilterSelectedIds, setEpisodeFilterSelectedIds] = useState<Set<string>>(() => new Set());
  const [isEpisodeParticipantPickerOpen, setIsEpisodeParticipantPickerOpen] = useState(false);
  const [episodePickerGridWidth, setEpisodePickerGridWidth] = useState(0);
  const [episodeTitleDraft, setEpisodeTitleDraft] = useState('');
  const [episodeTitleFilter, setEpisodeTitleFilter] = useState('');
  const [isEpisodeFormVisible, setIsEpisodeFormVisible] = useState(false);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [showSayingDatePicker, setShowSayingDatePicker] = useState(false);
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

  useFocusEffect(
    useCallback(() => {
      reloadDetailDesign();
    }, [reloadDetailDesign])
  );

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
    setAffiliationOptions(getDistinctAffiliations().map((v) => ({ label: v, value: v })));
    setExperienceOptions(getDistinctExperiences().map((v) => ({ label: v, value: v })));
  }, [friendId]);

  useFocusEffect(
    useCallback(() => {
      loadFriend();
    }, [loadFriend])
  );

  const hiddenParticipantIds = useMemo(() => {
    const ids: string[] = [];
    if (friendId) ids.push(friendId);
    if (myselfId) ids.push(myselfId);
    return ids;
  }, [friendId, myselfId]);

  const implicitParticipantEntries = useMemo(
    () => (friendId ? [{ kind: 'individual' as const, value: friendId }] : []),
    [friendId]
  );

  const episodeForm = useEpisodeForm({
    friends: allFriends,
    hiddenParticipantIds,
    implicitParticipantEntries,
  });

  useEffect(() => {
    setActiveTab('情報');
    setIsHabitFormVisible(false);
    setEditingHabitIndex(null);
    setHabitText('');
    setHabitInputHeight(48);
    setHabitFormError('');
    setEpisodeFilterSelectedIdsDraft(new Set());
    setEpisodeFilterSelectedIds(new Set());
    setIsEpisodeParticipantPickerOpen(false);
    setEpisodeTitleDraft('');
    setEpisodeTitleFilter('');
    setIsEpisodeFormVisible(false);
    episodeForm.reset();
    setIsSayingFormVisible(false);
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    setSayingFormError('');
    setShowSayingDatePicker(false);
  }, [friendId, episodeForm.reset]);

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
    if (!friend || friend.importSource === 'qr_scan' || profiles.length === 0) return [];
    const hasOnlyOneSelfProfile =
      profiles.length === 1 &&
      (profiles[0].source === 'self' || (myselfId !== null && profiles[0].authorUserId === myselfId));
    if (hasOnlyOneSelfProfile) {
      return [];
    }
    return profiles;
  }, [friend, profiles, myselfId]);
  const profileTagLabel = useMemo(() => {
    if (!selectedProfile) return '';
    const isSelf =
      selectedProfile.source === 'self' || (myselfId !== null && selectedProfile.authorUserId === myselfId);
    if (isSelf) {
      return 'me';
    }
    if (!selectedProfile.authorUserId) {
      return '';
    }
    return friendNameById.get(selectedProfile.authorUserId) ?? '';
  }, [selectedProfile, myselfId, friendNameById]);
  const episodePickerCardWidth = useMemo(() => {
    if (episodePickerGridWidth <= 0) {
      return undefined;
    }
    const totalGap = EPISODE_PICKER_GAP * (EPISODE_PICKER_COLUMNS - 1);
    return (episodePickerGridWidth - totalGap) / EPISODE_PICKER_COLUMNS;
  }, [episodePickerGridWidth]);

  const episodeParticipantFilterSummary = useMemo(() => {
    if (episodeFilterSelectedIds.size === 0) {
      return '指定なし';
    }
    const names = Array.from(episodeFilterSelectedIds)
      .map((id) => friendNameById.get(id) ?? '')
      .filter((name) => name.length > 0);
    if (names.length <= 2) {
      return names.join('、');
    }
    return `${names.length}名`;
  }, [episodeFilterSelectedIds, friendNameById]);

  const toggleEpisodeFilterParticipant = useCallback((id: string) => {
    setEpisodeFilterSelectedIdsDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const sortedEpisodes = useMemo(() => {
    if (!friend) return [];
    return [...friend.episodes].sort((a, b) => b.date.localeCompare(a.date));
  }, [friend]);

  const filteredEpisodes = useMemo(() => {
    return sortedEpisodes.filter((episode) => {
      if (episodeFilterSelectedIds.size > 0) {
        const participantIds = getEpisodeParticipantFriendIds(episode);
        const matchesSelected = Array.from(episodeFilterSelectedIds).some((id) =>
          participantIds.includes(id)
        );
        if (!matchesSelected) return false;
      }
      if (episodeTitleFilter.trim()) {
        if (!episode.title.toLowerCase().includes(episodeTitleFilter.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [episodeFilterSelectedIds, episodeTitleFilter, sortedEpisodes]);

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

  const openEpisodeParticipantPicker = useCallback(() => {
    setEpisodeFilterSelectedIdsDraft(new Set(episodeFilterSelectedIds));
    setIsEpisodeParticipantPickerOpen(true);
  }, [episodeFilterSelectedIds]);

  const handleParticipantPickerSearch = useCallback(() => {
    setEpisodeFilterSelectedIds(new Set(episodeFilterSelectedIdsDraft));
    setIsEpisodeParticipantPickerOpen(false);
  }, [episodeFilterSelectedIdsDraft]);

  const handleEpisodeTitleSubmit = useCallback(() => {
    setEpisodeTitleFilter(episodeTitleDraft);
  }, [episodeTitleDraft]);

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
    episodeForm.reset();
  };

  const startCreateEpisode = () => {
    if (!myselfId) {
      Alert.alert('案内', '本人が設定されていません。');
      return;
    }
    episodeForm.reset();
    setIsEpisodeFormVisible(true);
  };

  const startEditEpisode = (episode: Episode) => {
    episodeForm.loadFromEpisode(episode);
    setIsEpisodeFormVisible(true);
  };

  const handleDeleteEpisode = (episodeId: string) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const target = friend?.episodes.find((item) => item.id === episodeId);
          if (!target || !myselfId) {
            Alert.alert('エラー', 'エピソードの削除に失敗しました。');
            return;
          }
          const authorId = resolveEpisodeRecordOwnerId(target, myselfId);
          const deleted = deleteEpisode(authorId, episodeId);
          if (!deleted) {
            Alert.alert('エラー', 'エピソードの削除に失敗しました。');
            return;
          }
          if (episodeForm.editingEpisodeId === episodeId) {
            episodeForm.reset();
            setIsEpisodeFormVisible(false);
          }
          loadFriend();
        },
      },
    ]);
  };

  const handleSaveEpisode = () => {
    if (!friend) {
      episodeForm.setFormError('人物データが見つかりません。');
      return;
    }
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
          ? friendNameById.get(profile.authorUserId) ?? ''
          : '';
      return {
        text: label ? `by ${label}` : profile.name || 'プロフィール',
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
        <View style={styles.profileCardOuter}>
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
                    <Ionicons name="pencil-outline" size={16} color={c.accent} />
                  </Pressable>
                  <Pressable style={styles.heroHomeButton} onPress={() => router.replace('/')}>
                    <Ionicons name="home" size={16} color={c.textMuted} />
                  </Pressable>
                </View>
              </View>
              {(friend.nickname.trim() || friend.importSource === 'qr_scan') ? (
                <View style={styles.heroNicknameRow}>
                  {friend.nickname.trim() ? (
                    <Text style={styles.heroNickname}>{friend.nickname}</Text>
                  ) : null}
                  {friend.importSource === 'qr_scan' ? (
                    <Ionicons name="qr-code-outline" size={14} color={c.textMuted} />
                  ) : null}
                </View>
              ) : null}
              {selectableProfiles.length > 0 ? (
                <Pressable onPress={openProfileSwitcher}>
                  <Text style={styles.heroByTag}>
                    {profileTagLabel ? `by ${profileTagLabel}` : 'プロフィールを切り替え'}
                  </Text>
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
          <View style={styles.tabTrack}>
            <View style={styles.tabInner}>
              {detailTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                const activeColor = bundle.tabMode === 'perTab' ? tab.color : c.accent;
                const inactiveIconBg = bundle.tabMode === 'perTab' ? tab.color : c.tabInactive;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setActiveTab(tab.key)}
                    style={[
                      styles.tabPill,
                      isActive && {
                        borderColor: activeColor,
                        backgroundColor: activeColor,
                      },
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={tab.key}
                  >
                    <View style={styles.tabPillContent}>
                      <View
                        style={[
                          styles.tabPillIconCircle,
                          isActive
                            ? styles.tabPillIconCircleActive
                            : { backgroundColor: inactiveIconBg },
                        ]}
                      >
                        {tab.iconSet === 'material' ? (
                          <MaterialCommunityIcons
                            name={tab.icon as ComponentProps<typeof MaterialCommunityIcons>['name']}
                            size={16}
                            color={c.onAccent}
                          />
                        ) : (
                          <Ionicons
                            name={tab.icon as ComponentProps<typeof Ionicons>['name']}
                            size={16}
                            color={c.onAccent}
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.tabPillCaption,
                          isActive ? styles.tabPillCaptionActive : styles.tabPillCaptionInactive,
                        ]}
                      >
                        {tab.caption}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
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

          {activeTab === 'ステータス' && (
            <View style={styles.tabPane}>
              {[
                { label: '出身', value: friend.origin.trim() || '—' },
                { label: '居住地', value: friend.residence.trim() || '—' },
                { label: '誕生日', value: heroBirthdayLabel || '—' },
                {
                  label: '身長',
                  value: friend.height != null ? `${friend.height} cm` : '—',
                },
                {
                  label: '体重',
                  value: friend.weight != null ? `${friend.weight} kg` : '—',
                },
              ].map((row, index, rows) => (
                <View
                  key={row.label}
                  style={[styles.statusRow, index < rows.length - 1 && styles.statusRowDivider]}
                >
                  <Text style={styles.statusLabel}>{row.label}</Text>
                  <Text style={styles.statusValue}>{row.value}</Text>
                </View>
              ))}
            </View>
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
                  placeholderTextColor={c.inputPlaceholder}
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
            <View style={styles.episodeToolbarRow}>
              <Pressable
                style={[styles.episodeFilterField, styles.episodeParticipantFilterField]}
                onPress={openEpisodeParticipantPicker}
              >
                <Text style={styles.episodeFilterFieldLabel}>参加者</Text>
                <Text style={styles.episodeFilterFieldValue} numberOfLines={1}>
                  {episodeParticipantFilterSummary}
                </Text>
              </Pressable>
              <TextInput
                style={[styles.episodeFilterField, styles.episodeTitleFilterField]}
                placeholder="タイトル"
                placeholderTextColor={c.inputPlaceholder}
                value={episodeTitleDraft}
                onChangeText={setEpisodeTitleDraft}
                onSubmitEditing={handleEpisodeTitleSubmit}
                returnKeyType="search"
                blurOnSubmit
                autoCapitalize="none"
              />
              <Pressable
                style={styles.episodeToolbarAddButton}
                onPress={() => {
                  if (isEpisodeFormVisible && !episodeForm.editingEpisodeId) {
                    episodeForm.reset();
                    setIsEpisodeFormVisible(false);
                  } else {
                    startCreateEpisode();
                  }
                }}
              >
                <Text style={styles.episodeAddButtonText}>
                  {isEpisodeFormVisible && !episodeForm.editingEpisodeId ? '閉じる' : '+ 追加'}
                </Text>
              </Pressable>
            </View>

            {isEpisodeParticipantPickerOpen && (
              <View style={styles.episodeParticipantPickerPanel}>
                <View
                  style={styles.episodeParticipantPickerGrid}
                  onLayout={(event) => {
                    const width = event.nativeEvent.layout.width;
                    if (width > 0) {
                      setEpisodePickerGridWidth(width);
                    }
                  }}
                >
                  {allFriends.map((person) => {
                    const checked = episodeFilterSelectedIdsDraft.has(person.id);
                    return (
                      <Pressable
                        key={person.id}
                        style={[styles.episodePersonRow, { width: episodePickerCardWidth }]}
                        onPress={() => toggleEpisodeFilterParticipant(person.id)}
                      >
                        <View
                          style={[styles.episodePersonCheckbox, checked && styles.episodePersonCheckboxChecked]}
                        >
                          {checked ? <Text style={styles.episodePersonCheckmark}>✓</Text> : null}
                        </View>
                        <Text style={styles.episodePersonName} numberOfLines={1}>
                          {person.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable style={styles.episodePickerSearchButton} onPress={handleParticipantPickerSearch}>
                  <Text style={styles.episodeSearchButtonText}>検索</Text>
                </Pressable>
              </View>
            )}

            {filteredEpisodes.length === 0 ? (
              <Text style={styles.emptyEpisodeText}>該当するエピソードはありません。</Text>
            ) : (
              filteredEpisodes.map((episode) => {
                const canManage = canManageEpisode(episode, friend.id, myselfId);
                const episodeOwnerId = resolveEpisodeRecordOwnerId(episode, friend.id);
                const chips = buildParticipantChips(episode, friendNameById);
                const modeStyles = canManage ? episodeVisibilityTagStyles[episode.visibilityMode] : null;
                const posterName = friendNameById.get(episode.authorFriendId) ?? episode.authorFriendId;

                return (
                  <Pressable
                    key={episode.id}
                    onPress={() =>
                      router.push({
                        pathname: '/episode-detail',
                        params: {
                          episodeId: episode.id,
                          ownerId: episodeOwnerId,
                        },
                      })
                    }
                    onLongPress={
                      canManage
                        ? () => {
                            Alert.alert('操作を選択', 'このエピソードに対する操作を選んでください。', [
                              { text: 'キャンセル', style: 'cancel' },
                              { text: '編集', onPress: () => startEditEpisode(episode) },
                              {
                                text: '削除',
                                style: 'destructive',
                                onPress: () => handleDeleteEpisode(episode.id),
                              },
                            ]);
                          }
                        : undefined
                    }
                    delayLongPress={300}
                  >
                    <View style={styles.episodeCard}>
                      <View style={styles.episodeCardRow1}>
                        <Text style={styles.episodeCardTitle} numberOfLines={1}>
                          {episode.title || '-'}
                        </Text>
                        <Text style={styles.episodeCardDateText}>{formatEpisodeDateForCard(episode.date)}</Text>
                        {canManage && modeStyles ? (
                          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, modeStyles.tag]}>
                            <Text style={[styles.episodeParticipantTagName, modeStyles.text]}>
                              {getVisibilityModeLabel(episode.visibilityMode)}
                            </Text>
                          </View>
                        ) : !canManage ? (
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
                  placeholderTextColor={c.inputPlaceholder}
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
        </View>
      </KeyboardAwareScrollView>
      <EpisodeFormOverlay
        visible={isEpisodeFormVisible}
        form={episodeForm}
        friends={allFriends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        onClose={() => {
          episodeForm.reset();
          setIsEpisodeFormVisible(false);
        }}
        onSave={handleSaveEpisode}
      />
    </SafeAreaView>
  );
}

