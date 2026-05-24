import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { PHOTO_LIMITS } from '../constants';
import {
  createEpisode,
  deleteEpisode,
  deleteEpisodePhoto,
  getAllFriends,
  getDistinctAffiliations,
  getEpisodePhotos,
  getMyself,
  initializeDatabase,
  insertEpisodePhoto,
  updateEpisode,
} from '../db';
import { Episode, EpisodeParticipant, EpisodePhoto, EpisodeVisibilityEntry, Friend } from '../types';
import { buildParticipantChips, visibilityDisplayLabels } from '../utils/episodeHelpers';

const LIST_HORIZONTAL_INSET = 12;

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

type Option = { label: string; value: string };
type EpisodeParticipantDraft = {
  participantType: 'individual' | 'group';
  value: string;
  isMain: boolean;
};

type EpisodeVisibilityDraft = {
  kind: 'individual' | 'group';
  value: string;
};

type EpisodeRow = { episode: Episode; recordOwnerId: string };

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
            <ScrollView style={styles.modalOptionsScroll} keyboardShouldPersistTaps="handled">
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
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setVisible(false)}>
              <Text style={styles.modalCloseButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function collectUniqueEpisodes(friends: Friend[]): EpisodeRow[] {
  const sortedFriends = [...friends].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const byId = new Map<string, EpisodeRow>();
  sortedFriends.forEach((friend) => {
    friend.episodes.forEach((episode) => {
      if (!byId.has(episode.id)) {
        byId.set(episode.id, { episode, recordOwnerId: friend.id });
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

type ParticipantChip = { id: string; label: string; isMain: boolean };

type EpisodeListCardProps = {
  title: string;
  date: string;
  /** true = 「他の人の投稿」（投稿者タグ＋保存）、false = 自分が登録したエピソード（編集・削除のみ） */
  isSharedPost: boolean;
  posterName?: string;
  chips: ParticipantChip[];
  visibility: string[];
  onEdit?: () => void;
  onDelete?: () => void;
};

function EpisodeListCard({
  title,
  date,
  isSharedPost,
  posterName,
  chips,
  visibility,
  onEdit,
  onDelete,
}: EpisodeListCardProps) {
  const showRow2 = chips.length > 0 || visibility.length > 0;

  return (
    <View style={styles.episodeCard}>
      <View style={styles.episodeCardRow1}>
        <View style={styles.titlePill}>
          <Text style={styles.titlePillText} numberOfLines={1}>
            {title || '-'}
          </Text>
        </View>
        <Text style={styles.episodeCardDateText}>{formatEpisodeDateForCard(date)}</Text>
        {!isSharedPost ? (
          <View style={styles.episodeCardActions}>
            <Pressable style={styles.episodeCardEditButton} onPress={onEdit}>
              <Text style={styles.episodeCardEditButtonText}>編集</Text>
            </Pressable>
            <Pressable style={styles.episodeCardDeleteButton} onPress={onDelete}>
              <Text style={styles.episodeCardDeleteButtonText}>削除</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.episodeCardFriendActions}>
            <View style={styles.episodeParticipantTag}>
              <Text style={styles.episodeParticipantTagName} numberOfLines={1}>
                {posterName || '-'}
              </Text>
            </View>
            <Pressable style={styles.saveButtonDisabled} disabled>
              <Text style={styles.saveButtonDisabledText}>保存</Text>
            </Pressable>
          </View>
        )}
      </View>
      {showRow2 ? (
        <View style={styles.episodeCardRow2}>
          {chips.length > 0 ? (
            <View style={styles.episodeParticipantTagWrap}>
              {chips.map((p) => (
                <View
                  key={p.id}
                  style={[styles.episodeParticipantTag, p.isMain && styles.episodeParticipantTagMain]}
                >
                  <Text style={styles.episodeParticipantTagName}>{p.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {visibility.length > 0 ? (
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
  const [myselfId, setMyselfId] = useState<string | null>(null);

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [newEpisodeTitle, setNewEpisodeTitle] = useState('');
  const [newEpisodeDate, setNewEpisodeDate] = useState('');
  const [showEpisodeDatePicker, setShowEpisodeDatePicker] = useState(false);
  const [newEpisodeDescription, setNewEpisodeDescription] = useState('');
  const [isOwnerMainRole, setIsOwnerMainRole] = useState(true);
  const [episodeParticipants, setEpisodeParticipants] = useState<EpisodeParticipantDraft[]>([]);
  const [episodeVisibility, setEpisodeVisibility] = useState<EpisodeVisibilityDraft[]>([]);
  const [episodeFormError, setEpisodeFormError] = useState('');
  const [photos, setPhotos] = useState<EpisodePhoto[]>([]);
  const [newPhotoUris, setNewPhotoUris] = useState<string[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<number[]>([]);

  const loadData = useCallback(() => {
    initializeDatabase();
    setFriends(getAllFriends());
    setAffiliationOptions(getDistinctAffiliations().map((v) => ({ label: v, value: v })));
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

  const participantOptions: Option[] = useMemo(
    () => friends.map((f) => ({ label: f.name, value: f.id })),
    [friends]
  );

  const visibilityIndividualOptions: Option[] = useMemo(
    () => friends.map((f) => ({ label: f.name, value: f.id })),
    [friends]
  );

  const visibleExistingPhotos = useMemo(
    () => photos.filter((photo) => !deletedPhotoIds.includes(photo.id)),
    [photos, deletedPhotoIds]
  );

  const isPhotoLimitReached = photos.length + newPhotoUris.length >= PHOTO_LIMITS.free;

  const resetEpisodeForm = () => {
    setEpisodeFormError('');
    setEditingEpisodeId(null);
    setEditingOwnerId(null);
    setNewEpisodeTitle('');
    setNewEpisodeDate(formatDateToYMD(new Date()));
    setShowEpisodeDatePicker(false);
    setNewEpisodeDescription('');
    setIsOwnerMainRole(true);
    setEpisodeParticipants([]);
    setEpisodeVisibility([]);
    setPhotos([]);
    setNewPhotoUris([]);
    setDeletedPhotoIds([]);
  };

  const openCreateForm = () => {
    if (!myselfId) {
      Alert.alert('案内', '本人が設定されていません。');
      return;
    }
    resetEpisodeForm();
    setEditingOwnerId(myselfId);
    setIsFormVisible(true);
  };

  const startEditEpisode = (row: EpisodeRow) => {
    const { episode, recordOwnerId } = row;
    const entries: EpisodeParticipant[] =
      episode.participantEntries && episode.participantEntries.length > 0
        ? episode.participantEntries
        : [
            ...episode.mainParticipants.map((id) => ({ kind: 'individual' as const, value: id, isMain: true })),
            ...episode.subParticipants.map((id) => ({ kind: 'individual' as const, value: id, isMain: false })),
          ];
    const participantDrafts: EpisodeParticipantDraft[] = entries
      .filter((entry) => !(entry.kind === 'individual' && entry.value === recordOwnerId))
      .map((entry) => ({
        participantType: entry.kind,
        value: entry.value,
        isMain: entry.isMain,
      }));
    setEditingEpisodeId(episode.id);
    setEditingOwnerId(recordOwnerId);
    setNewEpisodeTitle(episode.title);
    setNewEpisodeDate(episode.date);
    setNewEpisodeDescription(episode.description);
    setIsOwnerMainRole(episode.mainParticipants.includes(recordOwnerId));
    setEpisodeParticipants(participantDrafts);
    setEpisodeVisibility(
      (episode.visibilityEntries ?? []).map((entry) => ({
        kind: entry.kind,
        value: entry.value,
      }))
    );
    setPhotos(getEpisodePhotos(episode.id));
    setNewPhotoUris([]);
    setDeletedPhotoIds([]);
    setEpisodeFormError('');
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

  const onPickEpisodePhoto = async () => {
    if (isPhotoLimitReached) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setNewPhotoUris((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleRemoveExistingPhoto = (photoId: number) => {
    setDeletedPhotoIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]));
  };

  const handleRemoveNewPhoto = (index: number) => {
    setNewPhotoUris((prev) => prev.filter((_, i) => i !== index));
  };

  const persistEpisodePhotos = (episodeId: string, isEdit: boolean) => {
    if (isEdit) {
      deletedPhotoIds.forEach((id) => {
        deleteEpisodePhoto(id);
      });
      const existingCount = photos.filter((photo) => !deletedPhotoIds.includes(photo.id)).length;
      newPhotoUris.forEach((uri, index) => {
        insertEpisodePhoto(episodeId, uri, existingCount + index);
      });
      return;
    }
    newPhotoUris.forEach((uri, index) => {
      insertEpisodePhoto(episodeId, uri, index);
    });
  };

  const handleDeleteEpisode = (row: EpisodeRow) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const deleted = deleteEpisode(row.recordOwnerId, row.episode.id);
          if (!deleted) {
            Alert.alert('エラー', 'エピソードの削除に失敗しました。');
            return;
          }
          if (editingEpisodeId === row.episode.id) {
            resetEpisodeForm();
            setIsFormVisible(false);
          }
          loadData();
        },
      },
    ]);
  };

  const handleSaveEpisode = () => {
    const ownerId = editingOwnerId ?? myselfId;
    if (!ownerId) {
      setEpisodeFormError('本人が設定されていません。');
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
    const mainParticipants = isOwnerMainRole ? [ownerId] : [];
    const subParticipants = isOwnerMainRole ? [] : [ownerId];

    if (editingEpisodeId) {
      const updated = updateEpisode(ownerId, editingEpisodeId, {
        title,
        date,
        description,
        mainParticipants,
        subParticipants,
        participantEntries,
        visibilityEntries,
      });
      if (!updated) {
        setEpisodeFormError('エピソードの更新に失敗しました。');
        return;
      }
      persistEpisodePhotos(editingEpisodeId, true);
    } else {
      const created = createEpisode(ownerId, {
        title,
        date,
        description,
        mainParticipants,
        subParticipants,
        participantEntries,
        visibilityEntries,
      });
      if (!created) {
        setEpisodeFormError('エピソードの追加に失敗しました。');
        return;
      }
      persistEpisodePhotos(created.id, false);
    }
    resetEpisodeForm();
    setIsFormVisible(false);
    loadData();
  };

  const ownerIdForForm = editingOwnerId ?? myselfId;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topNavRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryNavPill, pressed ? styles.navPressed : null]}
            onPress={() => router.push('/')}
          >
            <Text style={styles.secondaryNavText} numberOfLines={2}>
              Profile一覧
            </Text>
          </Pressable>
          <View style={styles.navCurrent}>
            <Text style={styles.navCurrentText}>エピソード</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.secondaryNavPill, pressed ? styles.navPressed : null]}
            onPress={() => router.push('/commonitems')}
          >
            <Text style={styles.secondaryNavText} numberOfLines={2}>
              共通項目
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryNavPill, pressed ? styles.navPressed : null]}
            onPress={() => router.push('/friends')}
          >
            <Text style={styles.secondaryNavText} numberOfLines={2}>
              友達
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.mainCard}>
            <Text style={styles.sectionLabel}>他の人の投稿（ダミー）</Text>
            <DummyEpisodeCard />
            <DummyEpisodeCard />

            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>自分のエピソード</Text>
            {!myselfId ? <Text style={styles.emptyText}>本人が設定されていません</Text> : null}
            {episodeRows.length === 0 ? (
              <Text style={styles.emptyText}>登録されたエピソードはありません。</Text>
            ) : (
              episodeRows.map((row) => {
                const chips = buildParticipantChips(row.episode, friendNameById);
                const visibility = visibilityDisplayLabels(row.episode, friendNameById);
                return (
                  <Pressable
                    key={row.episode.id}
                    onPress={() =>
                      router.push({
                        pathname: '/episode-detail',
                        params: { episodeId: row.episode.id, ownerId: row.recordOwnerId },
                      })
                    }
                  >
                    <EpisodeListCard
                      title={row.episode.title}
                      date={row.episode.date}
                      isSharedPost={false}
                      chips={chips}
                      visibility={visibility}
                      onEdit={() => startEditEpisode(row)}
                      onDelete={() => handleDeleteEpisode(row)}
                    />
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>

        <Pressable style={[styles.fab, !myselfId && styles.fabDisabled]} onPress={openCreateForm} disabled={!myselfId}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      </View>

      {isFormVisible && (
        <View style={styles.formOverlay}>
          <KeyboardAwareScrollView
            style={styles.formOverlayScroll}
            contentContainerStyle={styles.formOverlayScrollContent}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            extraScrollHeight={24}
          >
            <Text style={styles.formOverlayTitle}>{editingEpisodeId ? 'エピソードを編集' : 'エピソードを追加'}</Text>
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
                  <Text style={[styles.roleToggleButtonText, !isOwnerMainRole && styles.roleToggleButtonTextActive]}>
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
                <Text style={styles.episodeParticipantLabel}>公開先</Text>
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
                <View key={`modal-vis-${index}`} style={styles.participantItemCard}>
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
              <View style={styles.episodePhotoSection}>
                <Text style={styles.episodeParticipantLabel}>写真</Text>
                {(visibleExistingPhotos.length > 0 || newPhotoUris.length > 0) && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.episodePhotoThumbScroll}
                    contentContainerStyle={styles.episodePhotoThumbRow}
                  >
                    {visibleExistingPhotos.map((photo) => (
                      <View key={`existing-photo-${photo.id}`} style={styles.episodePhotoThumbWrap}>
                        <Image source={{ uri: photo.photoUri }} style={styles.episodePhotoThumb} />
                        <Pressable
                          style={styles.episodePhotoRemoveButton}
                          onPress={() => handleRemoveExistingPhoto(photo.id)}
                        >
                          <Text style={styles.episodePhotoRemoveButtonText}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                    {newPhotoUris.map((uri, index) => (
                      <View key={`new-photo-${index}-${uri}`} style={styles.episodePhotoThumbWrap}>
                        <Image source={{ uri }} style={styles.episodePhotoThumb} />
                        <Pressable
                          style={styles.episodePhotoRemoveButton}
                          onPress={() => handleRemoveNewPhoto(index)}
                        >
                          <Text style={styles.episodePhotoRemoveButtonText}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}
                <Pressable
                  style={[styles.episodePhotoAddButton, isPhotoLimitReached && styles.episodePhotoAddButtonDisabled]}
                  onPress={onPickEpisodePhoto}
                  disabled={isPhotoLimitReached}
                >
                  <Text
                    style={[
                      styles.episodePhotoAddButtonText,
                      isPhotoLimitReached && styles.episodePhotoAddButtonTextDisabled,
                    ]}
                  >
                    写真を追加
                  </Text>
                </Pressable>
                {isPhotoLimitReached ? (
                  <Text style={styles.episodePhotoUpgradeHint}>
                    プランをアップグレードするとさらに追加できます
                  </Text>
                ) : null}
              </View>
              <TextInput
                style={styles.episodeDescriptionInput}
                placeholder="説明文の記入（記入式）"
                placeholderTextColor="#94a3b8"
                multiline
                value={newEpisodeDescription}
                onChangeText={setNewEpisodeDescription}
              />
              {ownerIdForForm ? (
                <Text style={styles.ownerHint}>
                  登録主体: {friends.find((f) => f.id === ownerIdForForm)?.name ?? ownerIdForForm}
                </Text>
              ) : null}
              {episodeFormError ? <Text style={styles.episodeErrorText}>{episodeFormError}</Text> : null}
              <View style={styles.episodeFormActions}>
                <Pressable
                  style={styles.episodeCancelButton}
                  onPress={() => {
                    resetEpisodeForm();
                    setIsFormVisible(false);
                  }}
                >
                  <Text style={styles.episodeCancelButtonText}>キャンセル</Text>
                </Pressable>
                <Pressable style={styles.episodeCreateButton} onPress={handleSaveEpisode}>
                  <Text style={styles.episodeCreateButtonText}>{editingEpisodeId ? '更新' : '保存'}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      )}

    </SafeAreaView>
  );
}

function DummyEpisodeCard() {
  return (
    <EpisodeListCard
      title="タイトル"
      date="2024-03-05"
      isSharedPost
      posterName="投稿者"
      chips={[
        { id: 'dummy-name', label: '名前', isMain: true },
        { id: 'dummy-group', label: 'グループ', isMain: false },
      ]}
      visibility={['グループ']}
    />
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2f5f8',
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: LIST_HORIZONTAL_INSET,
    marginBottom: 8,
  },
  navCurrent: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#aaa',
    backgroundColor: '#3d3d3d',
    paddingHorizontal: 10,
    paddingVertical: 9.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navCurrentText: {
    fontSize: 14.4,
    fontWeight: '700',
    color: '#fff',
  },
  topNavSecondary: {
    flexDirection: 'row',
    gap: 6,
  },
  secondaryNavPill: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#aaa',
    backgroundColor: '#e5e5e5',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navPressed: {
    opacity: 0.85,
  },
  secondaryNavText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    textAlign: 'center',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: LIST_HORIZONTAL_INSET,
    paddingBottom: 120,
  },
  mainCard: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  sectionLabelSpaced: {
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 12,
  },
  episodeCard: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  episodeCardRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  episodeCardRow2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titlePill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  titlePillText: {
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
  episodeCardFriendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  saveButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    opacity: 0.55,
  },
  saveButtonDisabledText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },
  episodeParticipantTagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 6,
  },
  episodeParticipantTag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeParticipantTagMain: {
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
  },
  episodeParticipantTagName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
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
    color: '#b91c1c',
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#67e8f9',
    borderColor: '#0891b2',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabDisabled: {
    opacity: 0.5,
  },
  fabText: {
    fontSize: 32,
    lineHeight: 32,
    color: '#082f49',
    fontWeight: '700',
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
    borderColor: '#cbd5e1',
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
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  episodePhotoAddButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodePhotoAddButtonDisabled: {
    opacity: 0.45,
    backgroundColor: '#e2e8f0',
    borderColor: '#cbd5e1',
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
  ownerHint: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 6,
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
  episodeCreateButton: {
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
});
