import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import { EpisodeListCard } from '@/components/episode/EpisodeListCard';
import type { Option } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { formatEpisodeDateToYMD } from '@/components/episode/types';
import { Radius, Spacing, Theme, Typography } from '@/constants/theme';
import { FormRow } from '@/components/ui/FormRow';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import { ViewportCappedMultilineTextInput } from '@/components/ui/ViewportCappedMultilineTextInput';
import { FormScreenBody, FormScreenSection, FormScreenTemplate } from '@/components/screen-templates';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentSwitchColors,
  contentTagStyle,
  contentTextStyle,
  contentDateTimePickerProps,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import {
  DATE_PICKER_MAX_FAR,
  DATE_PICKER_MIN,
  openRangeDatePickerBounds,
} from '@/utils/datePickerBounds';
import { useDismissPickerOnKeyboardShow } from '@/hooks/useDismissPickerOnKeyboardShow';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  createEvent,
  deleteEvent,
  deleteTasksByIds,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeListPhotoUrisMap,
  getEpisodesByEventId,
  getEvent,
  getEventParticipants,
  getEpisodeParticipantFriendIds,
  getMergedEpisodeTagLabels,
  getDefaultProfile,
  getMyself,
  getTasksByEventId,
  initializeDatabase,
  unlinkTasksFromEvent,
  updateEvent,
  updateEventNotificationId,
} from '../db';
import type { Episode, EpisodeParticipant, EventInput, Friend, Task } from '../types';
import { buildParticipantChipDisplays, buildParticipantChips } from '../utils/episodeHelpers';

const buildFriendNameById = (friendList: Friend[]): Map<string, string> =>
  new Map(friendList.map((friend) => [friend.id, friend.name]));

const buildFriendPhotoById = (friendList: Friend[]): Map<string, string | null> =>
  new Map(friendList.map((friend) => [friend.id, friend.photoUri ?? null]));
import {
  buildAllDayEndAt,
  buildAllDayStartAt,
  combineLocalDateTime,
  formatDateKey,
  formatTimeFromDate,
  getAllDayDateKeysFromEvent,
  parseDateKey,
} from '../utils/eventHelpers';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import { formatTaskDueDateLabel } from '@/utils/taskHelpers';
import {
  friendIdsToProfileIds,
  profileIdsToFriendIds,
  syncEventParticipants,
  toEventParticipantDisplays,
} from '../utils/eventParticipantHelpers';
import {
  DEFAULT_NOTIFY_TIMING_PRESET,
  NOTIFY_TIMING_OPTIONS,
  type EventNotifyTimingPreset,
  computeNotifyAtFromPreset,
  inferNotifyTimingPreset,
} from '../utils/eventNotifyTiming';
import {
  cancelEventNotification,
  requestNotificationPermissionOnFirstCreate,
  scheduleEventNotification,
} from '../utils/eventNotifications';
import {
  clampLinkedEpisodeDatesToEvent,
  deleteEpisodesLinkedToEvent,
  unlinkEpisodesFromEvent,
} from '../utils/eventEpisodeBidirectionalSync';
import { registerSavedEpisodeTag } from '../utils/episodeTagMaster';

type PickerTarget = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null;

const parseRouteParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};

const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '09:00';

const toLocalMidnight = (date: Date): Date => {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return midnight;
};

const getDayDelta = (from: Date, to: Date): number => {
  const fromMidnight = toLocalMidnight(from);
  const toMidnight = toLocalMidnight(to);
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / (24 * 60 * 60 * 1000));
};

const addDaysToDateKey = (dateKey: string, days: number): string => {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
};

export default function EventScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const switchColors = contentSwitchColors(content);
  const fieldCorner = { borderRadius: 0 };
  /** 真っ白すぎない薄い塗り（白テーマは #F2F2F2、他は personTag 背景）。枠と＋は同色 */
  const plusButtonFill = {
    borderColor: content.contentTextSecondary,
    backgroundColor:
      appTheme?.variant === 'white' ? '#F2F2F2' : content.contentPersonTagBg,
  };
  const plusButtonInk = { color: content.contentTextSecondary };
  /** ラベル列を少し狭めて記入欄を左へ広げる */
  const formLabelWidth = 72;
  const fieldIndent =
    kit.formLayout === 'horizontal' ? formLabelWidth + kit.formRowGap : 0;
  const params = useLocalSearchParams<{ eventId?: string; date?: string }>();
  const eventId = parseRouteParam(params.eventId);
  const initialDate = parseRouteParam(params.date);
  const isEditing = eventId.length > 0;

  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startDateKey, setStartDateKey] = useState(initialDate || formatDateKey(new Date()));
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endDateKey, setEndDateKey] = useState(initialDate || formatDateKey(new Date()));
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const previousStartRef = useRef<Date | null>(null);
  const [activePicker, setActivePicker] = useState<PickerTarget>(null);
  useDismissPickerOnKeyboardShow(activePicker != null, () => setActivePicker(null));
  const [isReady, setIsReady] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [participantEntries, setParticipantEntries] = useState<EpisodeParticipant[]>([]);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [linkedEpisodes, setLinkedEpisodes] = useState<Episode[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [taskMigrateModalVisible, setTaskMigrateModalVisible] = useState(false);
  const [taskMigrateIds, setTaskMigrateIds] = useState<Set<string>>(new Set());
  const [episodePhotoUrisById, setEpisodePhotoUrisById] = useState<Map<string, string[]>>(
    () => new Map()
  );
  const [notifyTimingPreset, setNotifyTimingPreset] = useState<EventNotifyTimingPreset>(
    DEFAULT_NOTIFY_TIMING_PRESET
  );
  const [timingModalVisible, setTimingModalVisible] = useState(false);
  const [episodeTag, setEpisodeTag] = useState('');
  const [episodeTagOptions, setEpisodeTagOptions] = useState<Option[]>([]);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [myselfId, setMyselfId] = useState<string | null>(null);

  const selectableFriends = useMemo(
    () => (myselfId ? friends.filter((friend) => friend.id !== myselfId) : friends),
    [friends, myselfId]
  );

  const availableTimingOptions = useMemo(
    () => NOTIFY_TIMING_OPTIONS.filter((option) => !option.requiresTimedEvent || !allDay),
    [allDay]
  );

  const selectedTimingLabel = useMemo(() => {
    return (
      availableTimingOptions.find((option) => option.value === notifyTimingPreset)?.label ??
      NOTIFY_TIMING_OPTIONS[0].label
    );
  }, [availableTimingOptions, notifyTimingPreset]);

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);

  const selectedProfileIds = useMemo(() => {
    const friendIds = getEpisodeParticipantFriendIds({ participantEntries }).filter(
      (friendId) => friendId !== myselfId
    );
    return friendIdsToProfileIds(friendIds);
  }, [myselfId, participantEntries]);

  const participantChips = useMemo(
    () =>
      buildParticipantChipDisplays(participantEntries, friendNameById, {
        excludeFriendIds: myselfId ? [myselfId] : [],
        friendPhotoById,
      }),
    [friendNameById, friendPhotoById, myselfId, participantEntries]
  );

  const handleOpenLinkedEpisode = useCallback(
    (episode: Episode) => {
      const ownerId = episode.authorFriendId.trim() || myselfId || '';
      if (!ownerId) {
        return;
      }
      router.push({
        pathname: '/episode-detail',
        params: { episodeId: episode.id, ownerId },
      });
    },
    [myselfId, router]
  );

  const handleAddLinkedEpisode = useCallback(() => {
    if (!isEditing) {
      return;
    }
    const todayKey = formatDateKey(new Date());
    if (!startDateKey.trim() || todayKey < startDateKey.trim()) {
      return;
    }
    router.push({
      pathname: '/episode',
      params: { createForEventId: eventId },
    });
  }, [eventId, isEditing, router, startDateKey]);

  const loadEvent = useCallback(() => {
    initializeDatabase();
    const currentMyselfId = getMyself();
    setMyselfId(currentMyselfId);
    setFriends(getAllFriendsInDefaultOrder());
    setAffiliationOptions(getDistinctAffiliations().map((value) => ({ label: value, value })));
    setExperienceOptions(getDistinctExperiences().map((value) => ({ label: value, value })));
    setEpisodeTagOptions(getMergedEpisodeTagLabels().map((value) => ({ label: value, value })));

    if (!isEditing) {
      const baseDate = initialDate || formatDateKey(new Date());
      setTitle('');
      setMemo('');
      setEpisodeTag('');
      setAllDay(false);
      setStartDateKey(baseDate);
      setEndDateKey(baseDate);
      setStartTime(DEFAULT_START_TIME);
      setEndTime(DEFAULT_END_TIME);
      previousStartRef.current = combineLocalDateTime(baseDate, DEFAULT_START_TIME);
      setParticipantEntries([]);
      setNotifyEnabled(true);
      setNotifyTimingPreset(DEFAULT_NOTIFY_TIMING_PRESET);
      setLinkedEpisodes([]);
      setLinkedTasks([]);
      setEpisodePhotoUrisById(new Map());
      setIsReady(true);
      return;
    }

    const event = getEvent(eventId);
    if (!event) {
      Alert.alert('エラー', '予定が見つかりません。', [{ text: 'OK', onPress: () => router.back() }]);
      return;
    }

    const start = new Date(event.startAt);
    const end = event.endAt ? new Date(event.endAt) : null;
    setTitle(event.title);
    setMemo(event.memo ?? '');
    setEpisodeTag(event.episodeTag ?? '');
    setAllDay(event.allDay);
    if (event.allDay) {
      const { startDateKey: allDayStart, endDateKey: allDayEnd } = getAllDayDateKeysFromEvent(event);
      setStartDateKey(allDayStart);
      setEndDateKey(allDayEnd);
      setStartTime('00:00');
      setEndTime('23:59');
      previousStartRef.current = parseDateKey(allDayStart);
    } else {
      const loadedStartDateKey = formatDateKey(start);
      const loadedStartTime = formatTimeFromDate(start);
      setStartDateKey(loadedStartDateKey);
      setEndDateKey(formatDateKey(end ?? start));
      setStartTime(loadedStartTime);
      setEndTime(formatTimeFromDate(end ?? start));
      previousStartRef.current = combineLocalDateTime(loadedStartDateKey, loadedStartTime);
    }
    setParticipantEntries(
      (() => {
        const excludeProfileId = currentMyselfId
          ? getDefaultProfile(currentMyselfId)?.id ?? null
          : null;
        const participantIds = getEventParticipants(eventId).map((participant) => participant.profileId);
        const profileIds = excludeProfileId
          ? participantIds.filter((profileId) => profileId !== excludeProfileId)
          : participantIds;
        return profileIdsToFriendIds(profileIds)
          .filter((friendId) => friendId !== currentMyselfId)
          .map((friendId) => ({ kind: 'individual' as const, value: friendId }));
      })()
    );
    setNotifyEnabled(event.notifyEnabled);
    const timingInput = event.allDay
      ? (() => {
          const { startDateKey: allDayStart } = getAllDayDateKeysFromEvent(event);
          return {
            startDateKey: allDayStart,
            startTime: '00:00',
            allDay: true as const,
          };
        })()
      : {
          startDateKey: formatDateKey(start),
          startTime: formatTimeFromDate(start),
          allDay: false as const,
        };
    setNotifyTimingPreset(inferNotifyTimingPreset(event.notifyAt, timingInput));
    const episodes = getEpisodesByEventId(eventId);
    setLinkedEpisodes(episodes);
    setEpisodePhotoUrisById(getEpisodeListPhotoUrisMap(episodes.map((episode) => episode.id)));
    setLinkedTasks(getTasksByEventId(eventId));
    setIsReady(true);
  }, [eventId, initialDate, isEditing, router]);

  const reloadLinkedEpisodes = useCallback(() => {
    if (!isEditing) {
      setLinkedEpisodes([]);
      setEpisodePhotoUrisById(new Map());
      setLinkedTasks([]);
      return;
    }
    initializeDatabase();
    const episodes = getEpisodesByEventId(eventId);
    setLinkedEpisodes(episodes);
    setEpisodePhotoUrisById(getEpisodeListPhotoUrisMap(episodes.map((episode) => episode.id)));
    setLinkedTasks(getTasksByEventId(eventId));
  }, [eventId, isEditing]);

  const handleAddLinkedTask = useCallback(() => {
    if (!isEditing) {
      return;
    }
    const todayKey = formatDateKey(new Date());
    const eventLastDateKey = (endDateKey.trim() || startDateKey).trim();
    if (eventLastDateKey && eventLastDateKey < todayKey) {
      return;
    }
    router.push({
      pathname: '/task-edit',
      params: { eventId },
    });
  }, [endDateKey, eventId, isEditing, router, startDateKey]);

  const performEventDelete = useCallback(async () => {
    initializeDatabase();
    const existing = getEvent(eventId);
    await cancelEventNotification(existing?.notificationId);
    const ok = deleteEvent(eventId);
    if (!ok) {
      Alert.alert('エラー', '予定の削除に失敗しました。');
      return;
    }
    router.back();
  }, [eventId, router]);

  const handleDelete = () => {
    Alert.alert('予定を削除', 'この予定を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          initializeDatabase();
          const tasks = getTasksByEventId(eventId);
          if (tasks.length === 0) {
            void performEventDelete();
            return;
          }
          Alert.alert(
            '紐づきタスク',
            `この予定に紐づくタスクが${tasks.length}件あります。タスクも削除しますか？`,
            [
              { text: 'キャンセル', style: 'cancel' },
              {
                text: 'タスクも削除',
                style: 'destructive',
                onPress: () => {
                  deleteTasksByIds(tasks.map((task) => task.id));
                  void performEventDelete();
                },
              },
              {
                text: '選んで残す',
                onPress: () => {
                  setTaskMigrateIds(new Set(tasks.map((task) => task.id)));
                  setLinkedTasks(tasks);
                  setTaskMigrateModalVisible(true);
                },
              },
            ]
          );
        },
      },
    ]);
  };

  const confirmTaskMigrateAndDeleteEvent = () => {
    const allIds = linkedTasks.map((task) => task.id);
    const keepIds = [...taskMigrateIds];
    const deleteIds = allIds.filter((id) => !taskMigrateIds.has(id));
    unlinkTasksFromEvent(keepIds);
    if (deleteIds.length > 0) {
      deleteTasksByIds(deleteIds);
    }
    setTaskMigrateModalVisible(false);
    void performEventDelete();
  };

  useFocusEffect(
    useCallback(() => {
      reloadLinkedEpisodes();
    }, [reloadLinkedEpisodes])
  );

  useEffect(() => {
    if (allDay && notifyTimingPreset === 'one_hour_before') {
      setNotifyTimingPreset(DEFAULT_NOTIFY_TIMING_PRESET);
    }
  }, [allDay, notifyTimingPreset]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    previousStartRef.current = allDay
      ? parseDateKey(startDateKey)
      : combineLocalDateTime(startDateKey, startTime);
  }, [allDay]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  const screenTitle = isEditing ? '予定を編集' : '予定を追加';

  /** 終了日（なければ開始日）が昨日以前なら過去予定 */
  const isPastEvent = useMemo(() => {
    const todayKey = formatDateKey(new Date());
    const lastDateKey = (endDateKey.trim() || startDateKey).trim();
    return Boolean(lastDateKey) && lastDateKey < todayKey;
  }, [endDateKey, startDateKey]);
  const showLinkedTasksSection = isEditing && (!isPastEvent || linkedTasks.length > 0);
  const canAddLinkedTask = isEditing && !isPastEvent;

  /** 開始日の前日まではエピソード追加不可。当日以降に追加欄を出す */
  const canAddLinkedEpisode = useMemo(() => {
    if (!isEditing || !startDateKey.trim()) {
      return false;
    }
    const todayKey = formatDateKey(new Date());
    return todayKey >= startDateKey.trim();
  }, [isEditing, startDateKey]);
  const showLinkedEpisodesSection = isEditing && (canAddLinkedEpisode || linkedEpisodes.length > 0);

  const buildEventInput = (): EventInput | null => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return null;
    }
    if (!startDateKey) {
      return null;
    }

    const timingInput = { startDateKey, startTime, allDay };
    const notifyAt = notifyEnabled ? computeNotifyAtFromPreset(notifyTimingPreset, timingInput) : null;
    const normalizedEpisodeTag = episodeTag.trim() || null;

    if (allDay) {
      const normalizedEndDateKey = endDateKey.trim() || startDateKey;
      if (parseDateKey(normalizedEndDateKey) < parseDateKey(startDateKey)) {
        return null;
      }
      return {
        title: normalizedTitle,
        startAt: buildAllDayStartAt(startDateKey),
        endAt: buildAllDayEndAt(normalizedEndDateKey),
        allDay: true,
        memo: memo.trim() || null,
        notifyAt,
        notifyEnabled,
        episodeTag: normalizedEpisodeTag,
      };
    }

    const startAtDate = combineLocalDateTime(startDateKey, startTime);
    let endAtIso: string | null = null;
    if (endDateKey.trim() && endTime.trim()) {
      const endAtDate = combineLocalDateTime(endDateKey, endTime);
      if (endAtDate.getTime() < startAtDate.getTime()) {
        return null;
      }
      endAtIso = endAtDate.toISOString();
    }

    return {
      title: normalizedTitle,
      startAt: startAtDate.toISOString(),
      endAt: endAtIso,
      allDay: false,
      memo: memo.trim() || null,
      notifyAt,
      notifyEnabled,
      episodeTag: normalizedEpisodeTag,
    };
  };

  const applySavedEventNotifications = async (
    savedEventId: string,
    previousNotificationId: string | null
  ): Promise<void> => {
    await cancelEventNotification(previousNotificationId);
    const savedEvent = getEvent(savedEventId);
    if (!savedEvent) {
      return;
    }
    const participants = toEventParticipantDisplays(selectedProfileIds);
    const notificationId = await scheduleEventNotification(savedEvent, participants);
    updateEventNotificationId(savedEventId, notificationId);
  };

  const handleSave = async () => {
    const input = buildEventInput();
    if (!input) {
      if (!title.trim()) {
        Alert.alert('入力エラー', 'タイトルを入力してください。');
        return;
      }
      if (!allDay && endDateKey && endTime) {
        Alert.alert('入力エラー', '終了日時は開始日時より後にしてください。');
        return;
      }
      if (allDay && endDateKey.trim() && parseDateKey(endDateKey) < parseDateKey(startDateKey)) {
        Alert.alert('入力エラー', '終了日は開始日以降にしてください。');
        return;
      }
      Alert.alert('入力エラー', '入力内容を確認してください。');
      return;
    }

    initializeDatabase();
    const previousNotificationId = isEditing ? (getEvent(eventId)?.notificationId ?? null) : null;

    if (!isEditing) {
      await requestNotificationPermissionOnFirstCreate();
    }

    const persistEvent = async (options?: { skipClamp?: boolean }) => {
      if (isEditing) {
        const ok = updateEvent(eventId, input);
        if (!ok) {
          Alert.alert('エラー', '予定の更新に失敗しました。');
          return;
        }
        registerSavedEpisodeTag(input.episodeTag);
        syncEventParticipants(eventId, selectedProfileIds);
        if (!options?.skipClamp) {
          clampLinkedEpisodeDatesToEvent(eventId);
        }
        await applySavedEventNotifications(eventId, previousNotificationId);
        router.back();
        return;
      }

      const created = createEvent(input);
      if (!created) {
        Alert.alert('エラー', '予定の作成に失敗しました。');
        return;
      }
      registerSavedEpisodeTag(input.episodeTag);
      syncEventParticipants(created.id, selectedProfileIds);
      await applySavedEventNotifications(created.id, null);
      router.back();
    };

    if (isEditing) {
      const todayKey = formatDateKey(new Date());
      const movingToFuture = startDateKey.trim() > todayKey;
      const linked = getEpisodesByEventId(eventId);
      if (movingToFuture && linked.length > 0) {
        Alert.alert(
          'エピソードとの矛盾',
          '開始日を未来に変更すると、紐づいているエピソードを予定に残せません。どうしますか？',
          [
            { text: 'キャンセル', style: 'cancel' },
            {
              text: 'エピソードを削除',
              style: 'destructive',
              onPress: () => {
                deleteEpisodesLinkedToEvent(eventId);
                void persistEvent({ skipClamp: true });
              },
            },
            {
              text: '紐づけを解除',
              onPress: () => {
                unlinkEpisodesFromEvent(eventId);
                void persistEvent({ skipClamp: true });
              },
            },
          ]
        );
        return;
      }
    }

    await persistEvent();
  };

  const openParticipantSelector = () => {
    const individualIds = new Set(
      participantEntries
        .filter((entry) => entry.kind === 'individual')
        .map((entry) => entry.value.trim())
        .filter((friendId) => friendId.length > 0 && friendId !== myselfId)
    );
    setSelectedIndividualIds(individualIds);
    setSelectedGroupValues(new Set());
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
    // Individual IDs only; group-name tags deferred (settings 今後の構想).
    const nextEntries: EpisodeParticipant[] = Array.from(selectedIndividualIds)
      .filter((friendId) => friendId !== myselfId)
      .map((friendId) => ({ kind: 'individual' as const, value: friendId }));
    setParticipantEntries(nextEntries);
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  };

  const toggleSelectorIndividual = (friendId: string) => {
    if (friendId === myselfId) {
      return;
    }
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

  const handleRemoveParticipantChip = (chipId: string) => {
    setParticipantEntries((prev) =>
      prev.filter((entry) => `${entry.kind}:${entry.value}` !== chipId)
    );
  };

  const handleOpenProfileDetail = (friendId: string) => {
    router.push({ pathname: '/detail', params: { id: friendId } });
  };

  const pickerValue = useMemo(() => {
    const safeEndDateKey = endDateKey.trim() || startDateKey;
    const safeStartTime = startTime.trim() || DEFAULT_START_TIME;
    const safeEndTime = endTime.trim() || DEFAULT_END_TIME;
    switch (activePicker) {
      case 'startDate':
        return parseDateKey(startDateKey);
      case 'endDate':
        return parseDateKey(safeEndDateKey);
      case 'startTime':
        return combineLocalDateTime(startDateKey, safeStartTime);
      case 'endTime':
        return combineLocalDateTime(safeEndDateKey, safeEndTime);
      default:
        return new Date();
    }
  }, [activePicker, endDateKey, endTime, startDateKey, startTime]);

  const pickerMode = activePicker === 'startTime' || activePicker === 'endTime' ? 'time' : 'date';
  const pickerBounds = useMemo(() => {
    if (allDay && activePicker === 'endDate') {
      return openRangeDatePickerBounds(parseDateKey(startDateKey), DATE_PICKER_MAX_FAR);
    }
    return openRangeDatePickerBounds(DATE_PICKER_MIN, DATE_PICKER_MAX_FAR);
  }, [activePicker, allDay, startDateKey]);

  const applyStartDateChange = (selected: Date) => {
    const nextStartDateKey = formatEpisodeDateToYMD(selected);
    if (allDay) {
      const previousStart = previousStartRef.current ?? parseDateKey(startDateKey);
      const dayDelta = getDayDelta(previousStart, selected);
      setStartDateKey(nextStartDateKey);
      setEndDateKey(addDaysToDateKey(endDateKey, dayDelta));
      previousStartRef.current = parseDateKey(nextStartDateKey);
      return;
    }

    const previousStart = previousStartRef.current ?? combineLocalDateTime(startDateKey, startTime);
    const newStart = combineLocalDateTime(nextStartDateKey, startTime);
    const deltaMs = newStart.getTime() - previousStart.getTime();
    const shiftedEnd = combineLocalDateTime(endDateKey, endTime);
    shiftedEnd.setTime(shiftedEnd.getTime() + deltaMs);
    setStartDateKey(nextStartDateKey);
    setEndDateKey(formatDateKey(shiftedEnd));
    setEndTime(formatTimeFromDate(shiftedEnd));
    previousStartRef.current = newStart;
  };

  const applyStartTimeChange = (selected: Date) => {
    const nextStartTime = formatTimeFromDate(selected);
    const previousStart = previousStartRef.current ?? combineLocalDateTime(startDateKey, startTime);
    const newStart = combineLocalDateTime(startDateKey, nextStartTime);
    const deltaMs = newStart.getTime() - previousStart.getTime();
    const shiftedEnd = combineLocalDateTime(endDateKey, endTime);
    shiftedEnd.setTime(shiftedEnd.getTime() + deltaMs);
    setStartTime(nextStartTime);
    setEndDateKey(formatDateKey(shiftedEnd));
    setEndTime(formatTimeFromDate(shiftedEnd));
    previousStartRef.current = newStart;
  };

  const openPicker = (target: Exclude<PickerTarget, null>) => {
    dismissKeyboardFocus();
    if (target === 'endDate' && !endDateKey.trim()) {
      setEndDateKey(startDateKey);
    }
    if (target === 'endTime' && !endTime.trim()) {
      setEndTime(DEFAULT_END_TIME);
    }
    setActivePicker(target);
  };

  const handlePickerChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (!selected || !activePicker) {
      return;
    }
    if (Platform.OS !== 'ios') {
      setActivePicker(null);
    }
    switch (activePicker) {
      case 'startDate':
        applyStartDateChange(selected);
        break;
      case 'endDate': {
        const nextEndDateKey = formatEpisodeDateToYMD(selected);
        if (allDay && parseDateKey(nextEndDateKey) < parseDateKey(startDateKey)) {
          setEndDateKey(startDateKey);
        } else {
          setEndDateKey(nextEndDateKey);
        }
        break;
      }
      case 'startTime':
        applyStartTimeChange(selected);
        break;
      case 'endTime':
        setEndTime(formatTimeFromDate(selected));
        break;
      default:
        break;
    }
  };

  if (!isReady) {
    return null;
  }

  return (
    <>
      <FormScreenTemplate
        title={screenTitle}
        onBack={() => router.back()}
        right={
          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>保存</Text>
          </Pressable>
        }
        extraScrollHeight={140}
        scrollContentStyle={styles.scrollContent}
      >
        <FormScreenBody gap={Spacing.md} style={{ borderRadius: 0 }}>
        <FormScreenSection elevated style={styles.formSection}>
          <FormRow label="タイトル" labelWidth={formLabelWidth}>
            <TextInput
              style={[styles.textInput, fieldCorner, contentInputStyle(content)]}
              placeholder="予定のタイトル"
              placeholderTextColor={content.contentTextSecondary}
              value={title}
              onChangeText={setTitle}
            />
          </FormRow>

          <FormRow label="予定タグ" labelWidth={formLabelWidth}>
            <Pressable
              style={[styles.pickerButton, fieldCorner, contentInputStyle(content)]}
              onPress={() => {
                dismissKeyboardFocus();
                setTagModalVisible(true);
              }}
              accessibilityLabel="予定タグを選択"
              accessibilityRole="button"
            >
              <Text
                style={
                  episodeTag
                    ? [styles.pickerButtonText, contentTextStyle(content)]
                    : [styles.pickerPlaceholder, contentMutedTextStyle(content)]
                }
              >
                {episodeTag || '未設定'}
              </Text>
            </Pressable>
          </FormRow>

          <FormRow label="終日" labelWidth={formLabelWidth} contentStyle={styles.switchField}>
            <Switch
              value={allDay}
              onValueChange={setAllDay}
              trackColor={switchColors.trackColor}
              thumbColor={allDay ? Theme.accent : switchColors.thumbColorOff}
            />
          </FormRow>

          <FormRow label={`開始${allDay ? '日' : '日時'}`} labelWidth={formLabelWidth}>
            <View style={styles.dateTimeRow}>
              <Pressable
                style={[styles.pickerButton, styles.dateButton, fieldCorner, contentInputStyle(content)]}
                onPress={() => openPicker('startDate')}
              >
                <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>{startDateKey}</Text>
              </Pressable>
              {!allDay ? (
                <Pressable
                  style={[styles.pickerButton, styles.timeButton, fieldCorner, contentInputStyle(content)]}
                  onPress={() => openPicker('startTime')}
                >
                  <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>{startTime}</Text>
                </Pressable>
              ) : null}
            </View>
          </FormRow>

          <FormRow label={`終了${allDay ? '日' : '日時'}`} labelWidth={formLabelWidth}>
            <View style={styles.dateTimeRow}>
              <Pressable
                style={[styles.pickerButton, styles.dateButton, fieldCorner, contentInputStyle(content)]}
                onPress={() => openPicker('endDate')}
              >
                <Text
                  style={
                    endDateKey
                      ? [styles.pickerButtonText, contentTextStyle(content)]
                      : [styles.pickerPlaceholder, contentMutedTextStyle(content)]
                  }
                >
                  {endDateKey || '未設定'}
                </Text>
              </Pressable>
              {!allDay ? (
                <Pressable
                  style={[styles.pickerButton, styles.timeButton, fieldCorner, contentInputStyle(content)]}
                  onPress={() => openPicker('endTime')}
                >
                  <Text
                    style={
                      endTime
                        ? [styles.pickerButtonText, contentTextStyle(content)]
                        : [styles.pickerPlaceholder, contentMutedTextStyle(content)]
                    }
                  >
                    {endTime || '未設定'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </FormRow>

          {activePicker ? (
            <View style={[styles.pickerWrap, { marginLeft: fieldIndent }]}>
              <DateTimePicker
                value={Number.isNaN(pickerValue.getTime()) ? new Date() : pickerValue}
                mode={pickerMode}
                display="spinner"
                locale="ja-JP"
                style={styles.picker}
                {...dateTimePickerProps}
                {...pickerBounds}
                onChange={handlePickerChange}
              />
              <Pressable
                style={[styles.pickerDoneButton, fieldCorner, contentTagStyle(content)]}
                onPress={() => setActivePicker(null)}
              >
                <Text style={[styles.pickerDoneText, contentTextStyle(content)]}>完了</Text>
              </Pressable>
            </View>
          ) : null}

          <FormRow
            label="会う人"
            labelWidth={formLabelWidth}
            style={styles.participantsFormRow}
          >
            <View style={[styles.participantsTagArea, fieldCorner, contentInputStyle(content)]}>
              <ParticipantChipList
                chips={participantChips}
                layout="wrap"
                onPressProfile={handleOpenProfileDetail}
                onRemoveChip={handleRemoveParticipantChip}
                trailing={
                  <Pressable
                    accessibilityLabel="会う人を追加"
                    style={[styles.addParticipantPlusButton, plusButtonFill]}
                    onPress={openParticipantSelector}
                  >
                    <Text style={[styles.addParticipantPlusButtonText, plusButtonInk]}>
                      ＋
                    </Text>
                  </Pressable>
                }
              />
            </View>
          </FormRow>
          <FormRow label="メモ" labelWidth={formLabelWidth} contentStyle={styles.memoField}>
            <ViewportCappedMultilineTextInput
              style={[styles.textInput, styles.memoInput, fieldCorner, contentInputStyle(content)]}
              placeholder="メモ（任意）"
              placeholderTextColor={content.contentTextSecondary}
              value={memo}
              onChangeText={setMemo}
              minHeight={96}
            />
          </FormRow>
        </FormScreenSection>

        <FormScreenSection elevated style={styles.formSection}>
          <FormRow label="通知" labelWidth={formLabelWidth} contentStyle={styles.switchField}>
            <Switch
              value={notifyEnabled}
              onValueChange={setNotifyEnabled}
              trackColor={switchColors.trackColor}
              thumbColor={notifyEnabled ? Theme.accent : switchColors.thumbColorOff}
            />
          </FormRow>
          {notifyEnabled ? (
            <FormRow
              label="通知タイミング"
              labelWidth={formLabelWidth}
              labelNumberOfLines={2}
            >
              <Pressable
                style={[styles.pickerButton, fieldCorner, contentInputStyle(content)]}
                onPress={() => {
                  dismissKeyboardFocus();
                  setTimingModalVisible(true);
                }}
              >
                <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>{selectedTimingLabel}</Text>
              </Pressable>
            </FormRow>
          ) : null}
        </FormScreenSection>

        {showLinkedTasksSection ? (
          <FormScreenSection elevated style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.fieldLabel, contentTextStyle(content)]}>タスク</Text>
              {canAddLinkedTask ? (
                <Pressable
                  accessibilityLabel="タスクを追加"
                  style={[
                    styles.addParticipantPlusButton,
                    styles.sectionHeaderPlusButton,
                    plusButtonFill,
                  ]}
                  onPress={handleAddLinkedTask}
                >
                  <Text style={[styles.addParticipantPlusButtonText, plusButtonInk]}>
                    ＋
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {linkedTasks.length > 0 ? (
              <View style={{ gap: 8 }}>
                {linkedTasks.map((task) => (
                  <Pressable
                    key={task.id}
                    style={[
                      styles.linkedTaskRow,
                      contentSurfaceStyle(content),
                      { borderWidth: 1, borderRadius: 8 },
                    ]}
                    onPress={() =>
                      router.push({ pathname: '/task-edit', params: { taskId: task.id } })
                    }
                  >
                    <Text style={[styles.linkedTaskTitle, contentTextStyle(content)]}>{task.title}</Text>
                    <Text style={[styles.linkedTaskMeta, contentMutedTextStyle(content)]}>
                      {task.completedAt
                        ? '完了'
                        : task.dueDate
                          ? `期限 ${formatTaskDueDateLabel(task.dueDate)}`
                          : '期限なし'}
                      {task.memo.trim() ? ` · ${task.memo.trim()}` : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyParticipantText, contentMutedTextStyle(content)]}>
                まだタスクがありません
              </Text>
            )}
          </FormScreenSection>
        ) : null}

        {showLinkedEpisodesSection ? (
          <FormScreenSection elevated style={styles.formSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.fieldLabel, contentTextStyle(content)]}>エピソード</Text>
              {canAddLinkedEpisode ? (
                <Pressable
                  accessibilityLabel="エピソードを追加"
                  style={[
                    styles.addParticipantPlusButton,
                    styles.sectionHeaderPlusButton,
                    plusButtonFill,
                  ]}
                  onPress={handleAddLinkedEpisode}
                >
                  <Text style={[styles.addParticipantPlusButtonText, plusButtonInk]}>
                    ＋
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {linkedEpisodes.length > 0 ? (
              <View style={styles.linkedEpisodeList}>
                {linkedEpisodes.map((episode) => {
                  const chips = buildParticipantChips(episode, friendNameById, {
                    friendPhotoById,
                    excludeFriendIds: myselfId ? [myselfId] : [],
                  });
                  return (
                    <EpisodeListCard
                      key={episode.id}
                      title={episode.title}
                      date={episode.date}
                      episodeTag={episode.tag}
                      chips={chips}
                      visibilityMode={episode.visibilityMode}
                      photoUris={episodePhotoUrisById.get(episode.id)}
                      unfilled={episode.pendingReview === true}
                      onPress={() => handleOpenLinkedEpisode(episode)}
                      style={styles.linkedEpisodeCard}
                    />
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.emptyParticipantText, contentMutedTextStyle(content)]}>
                まだエピソードがありません
              </Text>
            )}
          </FormScreenSection>
        ) : null}

        <FormScreenSection elevated style={[styles.formSection, styles.formActionsSection]}>
          <View style={styles.formActions}>
            <Pressable style={styles.formCancelButton} onPress={() => router.back()}>
              <Text style={styles.formCancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable style={styles.formSaveButton} onPress={handleSave}>
              <Text style={styles.formSaveButtonText}>保存</Text>
            </Pressable>
          </View>
        </FormScreenSection>
        </FormScreenBody>

        {isEditing ? (
          <Pressable
            style={styles.deleteLinkWrap}
            onPress={handleDelete}
            accessibilityLabel="予定を削除"
            hitSlop={8}
          >
            <Text style={styles.deleteLinkText}>予定を削除</Text>
          </Pressable>
        ) : null}
      </FormScreenTemplate>

      <Modal
        visible={timingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTimingModalVisible(false)}
      >
        <Pressable style={styles.timingModalBackdrop} onPress={() => setTimingModalVisible(false)}>
          <Pressable
            style={[styles.timingModalCard, contentSurfaceStyle(content)]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={[styles.timingModalTitle, contentTextStyle(content)]}>通知タイミング</Text>
            <ScrollView style={styles.timingModalOptions}>
              {availableTimingOptions.map((option) => {
                const selected = option.value === notifyTimingPreset;
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.timingModalOption,
                      selected ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => {
                      setNotifyTimingPreset(option.value);
                      setTimingModalVisible(false);
                    }}
                  >
                    <Text style={[styles.timingModalOptionText, contentTextStyle(content)]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={[styles.timingModalCloseButton, contentTagStyle(content)]}
              onPress={() => setTimingModalVisible(false)}
            >
              <Text style={[styles.timingModalCloseButtonText, contentTextStyle(content)]}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <OptionPickerModal
        visible={tagModalVisible}
        label="予定タグ"
        value={episodeTag}
        options={episodeTagOptions}
        onValueChange={setEpisodeTag}
        onClose={() => setTagModalVisible(false)}
        clearLabel="未設定"
        allowCustomValue
        customInputPlaceholder="新しいタグ名"
        customActionLabel="このタグを使う"
      />

      <Modal
        visible={taskMigrateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTaskMigrateModalVisible(false)}
      >
        <Pressable
          style={styles.timingModalBackdrop}
          onPress={() => setTaskMigrateModalVisible(false)}
        >
          <Pressable
            style={[styles.timingModalCard, contentSurfaceStyle(content)]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={[styles.timingModalTitle, contentTextStyle(content)]}>
              残すタスクを選択
            </Text>
            <Text style={[styles.emptyParticipantText, contentMutedTextStyle(content)]}>
              選択したタスクは予定なしの臨時へ移します。未選択は削除されます。
            </Text>
            <ScrollView style={styles.timingModalOptions}>
              {linkedTasks.map((task) => {
                const selected = taskMigrateIds.has(task.id);
                return (
                  <Pressable
                    key={task.id}
                    style={[
                      styles.timingModalOption,
                      selected ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => {
                      setTaskMigrateIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(task.id)) {
                          next.delete(task.id);
                        } else {
                          next.add(task.id);
                        }
                        return next;
                      });
                    }}
                  >
                    <Text style={contentTextStyle(content)}>
                      {selected ? '✓ ' : ''}
                      {task.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={[styles.timingModalCloseButton, contentTagStyle(content)]}
              onPress={confirmTaskMigrateAndDeleteEvent}
            >
              <Text style={[styles.timingModalCloseButtonText, contentTextStyle(content)]}>
                実行して予定を削除
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
        friends={selectableFriends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={affiliationOptions}
        selectedIndividualIds={selectedIndividualIds}
        selectedGroupValues={selectedGroupValues}
        onToggleIndividual={toggleSelectorIndividual}
        onToggleGroup={(groupValue) => {
          setSelectedGroupValues((prev) => {
            const next = new Set(prev);
            if (next.has(groupValue)) {
              next.delete(groupValue);
            } else {
              next.add(groupValue);
            }
            return next;
          });
        }}
        onCancel={handleSelectorCancel}
        onConfirm={handleSelectorConfirm}
        enableGroupTab={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Theme.btnPrimaryBg,
  },
  saveButtonText: {
    color: Theme.btnPrimaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
  formActionsSection: {
    paddingTop: Spacing.sm,
  },
  formCancelButton: {
    backgroundColor: 'transparent',
    borderColor: Theme.btnGhostBorder,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  formCancelButtonText: {
    color: Theme.btnGhostText,
    fontWeight: '700',
    fontSize: Typography.base,
  },
  formSaveButton: {
    backgroundColor: Theme.btnPrimaryBg,
    borderColor: Theme.btnPrimaryBg,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  formSaveButtonText: {
    color: Theme.btnPrimaryText,
    fontWeight: '700',
    fontSize: Typography.base,
  },
  scrollContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  formSection: {
    gap: 8,
  },
  participantsFormRow: {
    alignItems: 'center',
  },
  participantsTagArea: {
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
    width: '100%',
  },
  fieldLabel: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  memoField: {
    alignSelf: 'stretch',
  },
  switchField: {
    alignItems: 'flex-end',
  },
  textInput: {
    minHeight: 42,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 0,
    backgroundColor: Theme.inputBg,
    color: Theme.inputText,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.base,
  },
  memoInput: {
    minHeight: 96,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pickerButton: {
    minHeight: 42,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 0,
    backgroundColor: Theme.inputBg,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  dateButton: {
    flex: 1,
  },
  timeButton: {
    width: 110,
  },
  pickerButtonText: {
    fontSize: Typography.base,
    color: Theme.textPrimary,
  },
  pickerPlaceholder: {
    fontSize: Typography.base,
    color: Theme.textSecondary,
  },
  pickerWrap: {
    marginTop: Spacing.xs,
  },
  picker: {
    alignSelf: 'flex-end',
  },
  pickerDoneButton: {
    alignSelf: 'flex-end',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    borderRadius: 0,
    backgroundColor: Theme.border,
  },
  pickerDoneText: {
    color: Theme.textPrimary,
    fontWeight: '600',
    fontSize: Typography.base,
  },
  deleteLinkWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.55)',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  deleteLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f87171',
  },
  linkedTaskRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  linkedTaskTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  linkedTaskMeta: {
    fontSize: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  addParticipantPlusButton: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    /** 折り返し最終行の右端へ寄せる */
    marginLeft: 'auto',
  },
  sectionHeaderPlusButton: {
    marginLeft: 0,
  },
  addParticipantPlusButtonText: {
    color: Theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  emptyParticipantText: {
    fontSize: Typography.base,
    color: Theme.textSecondary,
  },
  linkedEpisodeList: {
    gap: Spacing.sm,
  },
  linkedEpisodeCard: {
    marginBottom: 0,
  },
  timingModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  timingModalCard: {
    backgroundColor: Theme.card,
    borderRadius: Radius.md,
    padding: 14,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: Theme.border,
  },
  timingModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 10,
  },
  timingModalOptions: {
    marginBottom: 10,
  },
  timingModalOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  timingModalOptionText: {
    fontSize: 14,
    color: Theme.textPrimary,
  },
  timingModalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: Theme.border,
  },
  timingModalCloseButtonText: {
    color: Theme.textPrimary,
    fontWeight: '600',
  },
});
