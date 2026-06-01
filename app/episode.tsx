import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';

import { PHOTO_LIMITS } from '../constants';
import {
  createEpisode,
  deleteEpisode,
  deleteEpisodePhoto,
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodePhotos,
  getMyself,
  initializeDatabase,
  insertEpisodePhoto,
  updateEpisode,
} from '../db';
import {
  Episode,
  EpisodeParticipant,
  EpisodePhoto,
  EpisodeVisibilityEntry,
  EpisodeVisibilityMode,
  Friend,
} from '../types';
import {
  buildParticipantChips,
  getVisibilityModeLabel,
  resolveEpisodeRecordOwnerId,
  visibilityDisplayLabels,
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
  includeEmptyOption = true,
}: {
  value: string;
  placeholder: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: object;
  includeEmptyOption?: boolean;
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
              {includeEmptyOption ? (
                <Pressable
                  style={[styles.modalOption, value === '' && styles.modalOptionSelected]}
                  onPress={() => {
                    onChange('');
                    setVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{placeholder}</Text>
                </Pressable>
              ) : null}
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

const SELECTOR_COLUMNS = 3;
const SELECTOR_GAP = 6;
const SELECTOR_CARD_PADDING = 14;

function SelectorFilterField({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((option) => option.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={styles.selectorFilterSelectContainer}>
      <Pressable style={styles.selectorFilterSelectButton} onPress={() => setVisible(true)}>
        <Text style={value ? styles.selectorFilterSelectValue : styles.selectorFilterSelectPlaceholder}>
          {displayLabel}
        </Text>
        <Text style={styles.selectorFilterSelectChevron}>▼</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.selectorFilterModalBackdrop}>
          <View style={styles.selectorFilterModalCard}>
            <Text style={styles.selectorFilterModalTitle}>{label}</Text>
            <ScrollView style={styles.selectorFilterModalOptions} keyboardShouldPersistTaps="handled">
              <Pressable
                style={[styles.selectorFilterModalOption, !value && styles.selectorFilterModalOptionSelected]}
                onPress={() => {
                  onValueChange('');
                  setVisible(false);
                }}
              >
                <Text style={styles.selectorFilterModalOptionText}>指定なし</Text>
              </Pressable>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.selectorFilterModalOption,
                    option.value === value && styles.selectorFilterModalOptionSelected,
                  ]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.selectorFilterModalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.selectorFilterModalCloseButton} onPress={() => setVisible(false)}>
              <Text style={styles.selectorFilterModalCloseButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type EntrySelectorModalProps = {
  visible: boolean;
  selectorTab: 'individual' | 'group';
  onTabChange: (tab: 'individual' | 'group') => void;
  nameFilter: string;
  onNameFilterChange: (value: string) => void;
  affiliationFilter: string;
  onAffiliationFilterChange: (value: string) => void;
  experienceFilter: string;
  onExperienceFilterChange: (value: string) => void;
  friends: Friend[];
  affiliationOptions: Option[];
  experienceOptions: Option[];
  groupOptions: Option[];
  selectedIndividualIds: Set<string>;
  selectedGroupValues: Set<string>;
  onToggleIndividual: (friendId: string) => void;
  onToggleGroup: (groupValue: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function EntrySelectorModal({
  visible,
  selectorTab,
  onTabChange,
  nameFilter,
  onNameFilterChange,
  affiliationFilter,
  onAffiliationFilterChange,
  experienceFilter,
  onExperienceFilterChange,
  friends,
  affiliationOptions,
  experienceOptions,
  groupOptions,
  selectedIndividualIds,
  selectedGroupValues,
  onToggleIndividual,
  onToggleGroup,
  onCancel,
  onConfirm,
}: EntrySelectorModalProps) {
  const itemWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const totalGap = SELECTOR_GAP * (SELECTOR_COLUMNS - 1);
    return (screenWidth - SELECTOR_CARD_PADDING * 2 - totalGap) / SELECTOR_COLUMNS;
  }, []);

  const normalizedNameFilter = nameFilter.trim().toLowerCase();
  const filteredFriends = useMemo(
    () =>
      friends.filter((friend) => {
        if (normalizedNameFilter && !friend.name.toLowerCase().includes(normalizedNameFilter)) {
          return false;
        }
        if (affiliationFilter && !(friend.affiliations ?? []).includes(affiliationFilter)) {
          return false;
        }
        if (experienceFilter && !(friend.experiences ?? []).includes(experienceFilter)) {
          return false;
        }
        return true;
      }),
    [friends, normalizedNameFilter, affiliationFilter, experienceFilter]
  );
  const filteredGroups = useMemo(
    () =>
      groupOptions.filter((option) =>
        normalizedNameFilter ? option.label.toLowerCase().includes(normalizedNameFilter) : true
      ),
    [groupOptions, normalizedNameFilter]
  );

  const renderFriendItem = ({ item }: { item: Friend }) => {
    const checked = selectedIndividualIds.has(item.id);
    return (
      <Pressable
        style={[styles.selectorPersonRow, { width: itemWidth }]}
        onPress={() => onToggleIndividual(item.id)}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.selectorPersonName} numberOfLines={1}>
          {item.name}
        </Text>
      </Pressable>
    );
  };

  const renderGroupItem = ({ item }: { item: Option }) => {
    const checked = selectedGroupValues.has(item.value);
    return (
      <Pressable
        style={[styles.selectorPersonRow, { width: itemWidth }]}
        onPress={() => onToggleGroup(item.value)}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.selectorPersonName} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.selectorOverlay}>
        <View style={styles.selectorCard}>
          <View style={styles.selectorTabRow}>
            <Pressable
              style={[styles.selectorTabButton, selectorTab === 'individual' && styles.selectorTabButtonActive]}
              onPress={() => onTabChange('individual')}
            >
              <Text
                style={[
                  styles.selectorTabButtonText,
                  selectorTab === 'individual' && styles.selectorTabButtonTextActive,
                ]}
              >
                個人
              </Text>
            </Pressable>
            <Pressable
              style={[styles.selectorTabButton, selectorTab === 'group' && styles.selectorTabButtonActive]}
              onPress={() => onTabChange('group')}
            >
              <Text
                style={[styles.selectorTabButtonText, selectorTab === 'group' && styles.selectorTabButtonTextActive]}
              >
                所属
              </Text>
            </Pressable>
          </View>
          <View style={styles.selectorDivider} />
          {selectorTab === 'individual' ? (
            <View style={styles.selectorFilterRow}>
              <View style={styles.selectorFilterNameContainer}>
                <TextInput
                  style={styles.selectorFilterNameInput}
                  value={nameFilter}
                  onChangeText={onNameFilterChange}
                  placeholder="名前"
                  placeholderTextColor={Theme.inputPlaceholder}
                  autoCapitalize="none"
                />
              </View>
              <SelectorFilterField
                label="所属"
                value={affiliationFilter}
                options={affiliationOptions}
                onValueChange={onAffiliationFilterChange}
              />
              <SelectorFilterField
                label="経験"
                value={experienceFilter}
                options={experienceOptions}
                onValueChange={onExperienceFilterChange}
              />
            </View>
          ) : (
            <TextInput
              style={styles.selectorNameInput}
              value={nameFilter}
              onChangeText={onNameFilterChange}
              placeholder="名前"
              placeholderTextColor={Theme.inputPlaceholder}
              autoCapitalize="none"
            />
          )}
          <View style={styles.selectorDivider} />
          {selectorTab === 'individual' ? (
            <FlatList
              data={filteredFriends}
              keyExtractor={(item) => item.id}
              renderItem={renderFriendItem}
              numColumns={SELECTOR_COLUMNS}
              columnWrapperStyle={styles.selectorColumnWrapper}
              style={styles.selectorListScroll}
              contentContainerStyle={styles.selectorListContent}
              keyboardShouldPersistTaps="handled"
            />
          ) : (
            <FlatList
              data={filteredGroups}
              keyExtractor={(item) => item.value}
              renderItem={renderGroupItem}
              numColumns={SELECTOR_COLUMNS}
              columnWrapperStyle={styles.selectorColumnWrapper}
              style={styles.selectorListScroll}
              contentContainerStyle={styles.selectorListContent}
              keyboardShouldPersistTaps="handled"
            />
          )}
          <View style={styles.selectorActions}>
            <Pressable style={styles.selectorCancelButton} onPress={onCancel}>
              <Text style={styles.selectorCancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable style={styles.selectorOkButton} onPress={onConfirm}>
              <Text style={styles.selectorOkButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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

type ParticipantChip = { id: string; label: string; isMain: boolean };

const VISIBILITY_MODE_OPTIONS: Option[] = [
  { label: '公開', value: 'public' },
  { label: '限定公開', value: 'limited' },
  { label: '非公開', value: 'private' },
];

type EpisodeListCardProps = {
  title: string;
  date: string;
  /** true = 「他の人の投稿」（投稿者タグ＋保存）、false = 自分が登録したエピソード */
  isSharedPost: boolean;
  posterName?: string;
  chips: ParticipantChip[];
  visibility?: string[];
  visibilityMode?: EpisodeVisibilityMode;
  onEdit?: () => void;
  onDelete?: () => void;
};

function EpisodeListCard({
  title,
  date,
  isSharedPost,
  posterName,
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
        {isSharedPost ? (
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
        ) : onEdit && onDelete ? (
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
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [newEpisodeTitle, setNewEpisodeTitle] = useState('');
  const [newEpisodeDate, setNewEpisodeDate] = useState('');
  const [showEpisodeDatePicker, setShowEpisodeDatePicker] = useState(false);
  const [newEpisodeDescription, setNewEpisodeDescription] = useState('');
  const [episodeParticipants, setEpisodeParticipants] = useState<EpisodeParticipantDraft[]>([]);
  const [episodeVisibilityMode, setEpisodeVisibilityMode] = useState<EpisodeVisibilityMode>('private');
  const [episodeVisibility, setEpisodeVisibility] = useState<EpisodeVisibilityDraft[]>([]);
  const [episodeFormError, setEpisodeFormError] = useState('');
  const [photos, setPhotos] = useState<EpisodePhoto[]>([]);
  const [newPhotoUris, setNewPhotoUris] = useState<string[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<number[]>([]);

  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState<'participant' | 'visibility'>('participant');
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');

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

  const visibleExistingPhotos = useMemo(
    () => photos.filter((photo) => !deletedPhotoIds.includes(photo.id)),
    [photos, deletedPhotoIds]
  );

  const isPhotoLimitReached = photos.length + newPhotoUris.length >= PHOTO_LIMITS.free;

  const restoreSelectorFromParticipants = (participants: EpisodeParticipantDraft[]) => {
    const individuals = new Set<string>();
    const groups = new Set<string>();
    participants.forEach((participant) => {
      if (!participant.value.trim()) {
        return;
      }
      if (participant.participantType === 'individual') {
        individuals.add(participant.value);
      } else {
        groups.add(participant.value);
      }
    });
    setSelectedIndividualIds(individuals);
    setSelectedGroupValues(groups);
  };

  const restoreSelectorFromVisibility = (entries: EpisodeVisibilityDraft[]) => {
    const individuals = new Set<string>();
    const groups = new Set<string>();
    entries.forEach((entry) => {
      if (!entry.value.trim()) {
        return;
      }
      if (entry.kind === 'individual') {
        individuals.add(entry.value);
      } else {
        groups.add(entry.value);
      }
    });
    setSelectedIndividualIds(individuals);
    setSelectedGroupValues(groups);
  };

  const openParticipantSelector = () => {
    restoreSelectorFromParticipants(episodeParticipants);
    setSelectorTarget('participant');
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  };

  const openVisibilitySelector = () => {
    restoreSelectorFromVisibility(episodeVisibility);
    setSelectorTarget('visibility');
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  };

  const handleSelectorCancel = () => {
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  };

  const handleSelectorConfirm = () => {
    if (selectorTarget === 'participant') {
      const nextParticipants: EpisodeParticipantDraft[] = [];
      selectedIndividualIds.forEach((friendId) => {
        nextParticipants.push({
          participantType: 'individual',
          value: friendId,
        });
      });
      selectedGroupValues.forEach((groupValue) => {
        nextParticipants.push({
          participantType: 'group',
          value: groupValue,
        });
      });
      setEpisodeParticipants(nextParticipants);
    } else {
      const nextVisibility: EpisodeVisibilityDraft[] = [];
      selectedIndividualIds.forEach((friendId) => {
        nextVisibility.push({ kind: 'individual', value: friendId });
      });
      selectedGroupValues.forEach((groupValue) => {
        nextVisibility.push({ kind: 'group', value: groupValue });
      });
      setEpisodeVisibility(nextVisibility);
    }
    setSelectorVisible(false);
    setSelectorNameFilter('');
  };

  const toggleSelectorIndividual = (friendId: string) => {
    setSelectedIndividualIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  };

  const toggleSelectorGroup = (groupValue: string) => {
    setSelectedGroupValues((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) {
        next.delete(groupValue);
      } else {
        next.add(groupValue);
      }
      return next;
    });
  };

  const resetEpisodeForm = () => {
    setEpisodeFormError('');
    setEditingEpisodeId(null);
    setEditingOwnerId(null);
    setNewEpisodeTitle('');
    setNewEpisodeDate(formatDateToYMD(new Date()));
    setShowEpisodeDatePicker(false);
    setNewEpisodeDescription('');
    setEpisodeParticipants([]);
    setEpisodeVisibilityMode('private');
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
      }));
    setEditingEpisodeId(episode.id);
    setEditingOwnerId(recordOwnerId);
    setNewEpisodeTitle(episode.title);
    setNewEpisodeDate(episode.date);
    setNewEpisodeDescription(episode.description);
    setEpisodeParticipants(participantDrafts);
    setEpisodeVisibilityMode(episode.visibilityMode);
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
          const ownerId = resolveEpisodeRecordOwnerId(row.episode, row.recordOwnerId);
          const deleted = deleteEpisode(ownerId, row.episode.id);
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
        isMain: true,
      }));
    const visibilityMode = episodeVisibilityMode;
    const visibilityEntries: EpisodeVisibilityEntry[] =
      visibilityMode === 'limited'
        ? episodeVisibility
            .filter((entry) => entry.value.trim().length > 0)
            .map((entry) => ({
              kind: entry.kind,
              value: entry.value.trim(),
            }))
        : [];
    const mainParticipants = [ownerId];
    const subParticipants: string[] = [];

    if (editingEpisodeId) {
      const updated = updateEpisode(ownerId, editingEpisodeId, {
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
      persistEpisodePhotos(editingEpisodeId, true);
    } else {
      const created = createEpisode(ownerId, {
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
                const ownerId = resolveEpisodeRecordOwnerId(row.episode, row.recordOwnerId);
                return (
                  <Pressable
                    key={row.episode.id}
                    onPress={() =>
                      router.push({
                        pathname: '/episode-detail',
                        params: { episodeId: row.episode.id, ownerId },
                      })
                    }
                  >
                    <EpisodeListCard
                      title={row.episode.title}
                      date={row.episode.date}
                      isSharedPost={false}
                      chips={chips}
                      visibilityMode={row.episode.visibilityMode}
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
                  placeholderTextColor={Theme.inputPlaceholder}
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
              <View style={styles.episodeParticipantRow}>
                <Text style={styles.episodeParticipantLabel}>参加者</Text>
                <Pressable style={styles.addParticipantButton} onPress={openParticipantSelector}>
                  <Text style={styles.addParticipantButtonText}>参加者を選ぶ</Text>
                </Pressable>
              </View>
              <Pressable style={styles.selectedEntryTagArea} onPress={openParticipantSelector}>
                {episodeParticipants.filter((participant) => participant.value.trim().length > 0).length > 0 ? (
                  <View style={styles.selectedEntryTagWrap}>
                    {episodeParticipants
                      .filter((participant) => participant.value.trim().length > 0)
                      .map((participant, index) => {
                        const label =
                          participant.participantType === 'individual'
                            ? friendNameById.get(participant.value) ?? participant.value
                            : participant.value;
                        return (
                          <View
                            key={`participant-tag-${participant.participantType}-${participant.value}-${index}`}
                            style={styles.episodeParticipantTag}
                          >
                            <Text style={styles.episodeParticipantTagName}>{label}</Text>
                          </View>
                        );
                      })}
                  </View>
                ) : (
                  <Text style={styles.selectedEntryEmptyText}>参加者が選択されていません</Text>
                )}
              </Pressable>
              <View style={styles.episodeParticipantRow}>
                <Text style={styles.episodeParticipantLabel}>公開設定</Text>
                <SelectInput
                  value={episodeVisibilityMode}
                  placeholder="公開設定"
                  options={VISIBILITY_MODE_OPTIONS}
                  onChange={(value) => setEpisodeVisibilityMode(value as EpisodeVisibilityMode)}
                  style={styles.visibilityModeSelect}
                  includeEmptyOption={false}
                />
              </View>
              {episodeVisibilityMode === 'limited' ? (
                <>
                  <View style={styles.episodeParticipantRow}>
                    <Text style={styles.episodeParticipantLabel}>公開先</Text>
                    <Pressable style={styles.addParticipantButton} onPress={openVisibilitySelector}>
                      <Text style={styles.addParticipantButtonText}>公開先を選ぶ</Text>
                    </Pressable>
                  </View>
                  <Pressable style={styles.selectedEntryTagArea} onPress={openVisibilitySelector}>
                    {episodeVisibility.filter((entry) => entry.value.trim().length > 0).length > 0 ? (
                      <View style={styles.selectedEntryTagWrap}>
                        {episodeVisibility
                          .filter((entry) => entry.value.trim().length > 0)
                          .map((entry, index) => {
                            const label =
                              entry.kind === 'individual'
                                ? friendNameById.get(entry.value) ?? entry.value
                                : entry.value;
                            return (
                              <View
                                key={`visibility-tag-${entry.kind}-${entry.value}-${index}`}
                                style={styles.episodeParticipantTag}
                              >
                                <Text style={styles.episodeParticipantTagName}>{label}</Text>
                              </View>
                            );
                          })}
                      </View>
                    ) : (
                      <Text style={styles.selectedEntryEmptyText}>公開先が選択されていません</Text>
                    )}
                  </Pressable>
                </>
              ) : null}
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
                placeholderTextColor={Theme.inputPlaceholder}
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
        { id: 'dummy-group', label: 'グループ', isMain: true },
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
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: '#3d3d3d',
    paddingHorizontal: 10,
    paddingVertical: 9.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navCurrentText: {
    fontSize: 14.4,
    fontWeight: '700',
    color: Theme.bgSurface,
  },
  topNavSecondary: {
    flexDirection: 'row',
    gap: 6,
  },
  secondaryNavPill: {
    flex: 1,
    minWidth: 0,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Theme.border,
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
    color: Theme.textSecondary,
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
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    padding: 12,
  },
  sectionLabel: {
    fontSize: Typography.base,
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
  episodeCardFriendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  saveButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    opacity: 0.55,
  },
  saveButtonDisabledText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
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
