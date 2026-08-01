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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { Option } from '@/components/episode/types';
import { EventParticipantChipList } from '@/components/event/EventParticipantChipList';
import { formatEpisodeDateToYMD, parseEpisodeDateString } from '@/components/episode/types';
import { Radius, Spacing, Theme, Typography } from '@/constants/theme';
import { FormRow } from '@/components/ui/FormRow';
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
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import {
  createEvent,
  deleteEvent,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEvent,
  getEventParticipants,
  getMergedEpisodeTagLabels,
  getAllFriends,
  getDefaultProfile,
  getMyself,
  initializeDatabase,
  updateEvent,
  updateEventNotificationId,
} from '../db';
import type { EventInput, Friend } from '../types';
import {
  buildAllDayEndAt,
  buildAllDayStartAt,
  combineLocalDateTime,
  formatDateKey,
  formatTimeFromDate,
  getAllDayDateKeysFromEvent,
  parseDateKey,
} from '../utils/eventHelpers';
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
import { syncLinkedEpisodesFromEvent } from '../utils/eventEpisodeBidirectionalSync';

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
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const switchColors = contentSwitchColors(content);
  const fieldCorner = { borderRadius: 0 };
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
  const [isReady, setIsReady] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [notifyEnabled, setNotifyEnabled] = useState(true);
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

  const participantDisplays = useMemo(
    () => toEventParticipantDisplays(selectedProfileIds),
    [selectedProfileIds]
  );

  const loadEvent = useCallback(() => {
    initializeDatabase();
    const currentMyselfId = getMyself();
    setMyselfId(currentMyselfId);
    setFriends(getAllFriends());
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
      setSelectedProfileIds([]);
      setNotifyEnabled(true);
      setNotifyTimingPreset(DEFAULT_NOTIFY_TIMING_PRESET);
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
    setSelectedProfileIds(
      (() => {
        const excludeProfileId = currentMyselfId
          ? getDefaultProfile(currentMyselfId)?.id ?? null
          : null;
        const participantIds = getEventParticipants(eventId).map((participant) => participant.profileId);
        return excludeProfileId
          ? participantIds.filter((profileId) => profileId !== excludeProfileId)
          : participantIds;
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
    setIsReady(true);
  }, [eventId, initialDate, isEditing, router]);

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

    if (isEditing) {
      const ok = updateEvent(eventId, input);
      if (!ok) {
        Alert.alert('エラー', '予定の更新に失敗しました。');
        return;
      }
      syncEventParticipants(eventId, selectedProfileIds);
      syncLinkedEpisodesFromEvent(eventId);
      await applySavedEventNotifications(eventId, previousNotificationId);
      router.back();
      return;
    }

    const created = createEvent(input);
    if (!created) {
      Alert.alert('エラー', '予定の作成に失敗しました。');
      return;
    }
    syncEventParticipants(created.id, selectedProfileIds);
    await applySavedEventNotifications(created.id, null);
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('予定を削除', 'この予定を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            initializeDatabase();
            const existing = getEvent(eventId);
            await cancelEventNotification(existing?.notificationId);
            const ok = deleteEvent(eventId);
            if (!ok) {
              Alert.alert('エラー', '予定の削除に失敗しました。');
              return;
            }
            router.back();
          })();
        },
      },
    ]);
  };

  const openParticipantSelector = () => {
    const friendIds = profileIdsToFriendIds(selectedProfileIds).filter(
      (friendId) => friendId !== myselfId
    );
    setSelectedIndividualIds(new Set(friendIds));
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
    const nextProfileIds = friendIdsToProfileIds(
      Array.from(selectedIndividualIds).filter((friendId) => friendId !== myselfId)
    );
    setSelectedProfileIds(nextProfileIds);
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

  const handleRemoveParticipant = (profileId: string) => {
    setSelectedProfileIds((prev) => prev.filter((id) => id !== profileId));
  };

  const handleOpenProfileDetail = (friendId: string) => {
    router.push({ pathname: '/detail', params: { id: friendId } });
  };

  const pickerValue = useMemo(() => {
    switch (activePicker) {
      case 'startDate':
        return parseDateKey(startDateKey);
      case 'endDate':
        return parseDateKey(endDateKey);
      case 'startTime':
        return combineLocalDateTime(startDateKey, startTime);
      case 'endTime':
        return combineLocalDateTime(endDateKey, endTime);
      default:
        return new Date();
    }
  }, [activePicker, endDateKey, endTime, startDateKey, startTime]);

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
          <FormRow label="タイトル">
            <TextInput
              style={[styles.textInput, fieldCorner, contentInputStyle(content)]}
              placeholder="予定のタイトル"
              placeholderTextColor={content.contentTextSecondary}
              value={title}
              onChangeText={setTitle}
            />
          </FormRow>

          <FormRow label="エピソードタグ">
            <Pressable
              style={[styles.pickerButton, fieldCorner, contentInputStyle(content)]}
              onPress={() => setTagModalVisible(true)}
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

          <FormRow label="終日" contentStyle={styles.switchField}>
            <Switch
              value={allDay}
              onValueChange={setAllDay}
              trackColor={switchColors.trackColor}
              thumbColor={allDay ? Theme.accent : switchColors.thumbColorOff}
            />
          </FormRow>

          <FormRow label={`開始${allDay ? '日' : '日時'}`}>
            <View style={styles.dateTimeRow}>
              <Pressable
                style={[styles.pickerButton, styles.dateButton, fieldCorner, contentInputStyle(content)]}
                onPress={() => setActivePicker('startDate')}
              >
                <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>{startDateKey}</Text>
              </Pressable>
              {!allDay ? (
                <Pressable
                  style={[styles.pickerButton, styles.timeButton, fieldCorner, contentInputStyle(content)]}
                  onPress={() => setActivePicker('startTime')}
                >
                  <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>{startTime}</Text>
                </Pressable>
              ) : null}
            </View>
          </FormRow>

          <FormRow label={`終了${allDay ? '日' : '日時'}`}>
            <View style={styles.dateTimeRow}>
              <Pressable
                style={[styles.pickerButton, styles.dateButton, fieldCorner, contentInputStyle(content)]}
                onPress={() => setActivePicker('endDate')}
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
                  onPress={() => setActivePicker('endTime')}
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
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={activePicker.includes('Date') ? parseEpisodeDateString(
                  activePicker === 'startDate' ? startDateKey : endDateKey
                ) : pickerValue}
                mode={activePicker.includes('Date') ? 'date' : 'time'}
                display="spinner"
                locale="ja-JP"
                style={styles.picker}
                {...dateTimePickerProps}
                minimumDate={
                  allDay && activePicker === 'endDate'
                    ? parseDateKey(startDateKey)
                    : undefined
                }
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

          <FormRow label="メモ" contentStyle={styles.memoField}>
            <TextInput
              style={[styles.textInput, styles.memoInput, fieldCorner, contentInputStyle(content)]}
              placeholder="メモ（任意）"
              placeholderTextColor={content.contentTextSecondary}
              value={memo}
              onChangeText={setMemo}
              multiline
              textAlignVertical="top"
            />
          </FormRow>
        </FormScreenSection>

        <FormScreenSection elevated style={styles.formSection}>
          <FormRow label="通知" contentStyle={styles.switchField}>
            <Switch
              value={notifyEnabled}
              onValueChange={setNotifyEnabled}
              trackColor={switchColors.trackColor}
              thumbColor={notifyEnabled ? Theme.accent : switchColors.thumbColorOff}
            />
          </FormRow>
          {notifyEnabled ? (
            <FormRow label="通知タイミング">
              <Pressable
                style={[styles.pickerButton, fieldCorner, contentInputStyle(content)]}
                onPress={() => setTimingModalVisible(true)}
              >
                <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>{selectedTimingLabel}</Text>
              </Pressable>
            </FormRow>
          ) : null}
        </FormScreenSection>

        <FormScreenSection elevated style={styles.formSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.fieldLabel, contentTextStyle(content)]}>会う人</Text>
            <Pressable
              style={[styles.addParticipantButton, fieldCorner, contentTagStyle(content)]}
              onPress={openParticipantSelector}
            >
              <Text style={[styles.addParticipantButtonText, contentTextStyle(content)]}>追加</Text>
            </Pressable>
          </View>
          {participantDisplays.length > 0 ? (
            <EventParticipantChipList
              participants={participantDisplays}
              onPressProfile={handleOpenProfileDetail}
              onRemoveProfile={handleRemoveParticipant}
            />
          ) : (
            <Text style={[styles.emptyParticipantText, contentMutedTextStyle(content)]}>
              会う人が選択されていません
            </Text>
          )}
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

      <Modal
        visible={tagModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTagModalVisible(false)}
      >
        <Pressable style={styles.timingModalBackdrop} onPress={() => setTagModalVisible(false)}>
          <Pressable
            style={[styles.timingModalCard, contentSurfaceStyle(content)]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={[styles.timingModalTitle, contentTextStyle(content)]}>エピソードタグ</Text>
            <ScrollView style={styles.timingModalOptions}>
              <Pressable
                style={[
                  styles.timingModalOption,
                  !episodeTag ? contentSelectedOptionStyle(content) : null,
                ]}
                onPress={() => {
                  setEpisodeTag('');
                  setTagModalVisible(false);
                }}
              >
                <Text style={[styles.timingModalOptionText, contentTextStyle(content)]}>未設定</Text>
              </Pressable>
              {episodeTagOptions.map((option) => {
                const selected = option.value === episodeTag;
                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.timingModalOption,
                      selected ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => {
                      setEpisodeTag(option.value);
                      setTagModalVisible(false);
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
              onPress={() => setTagModalVisible(false)}
            >
              <Text style={[styles.timingModalCloseButtonText, contentTextStyle(content)]}>閉じる</Text>
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
  scrollContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  formSection: {
    gap: 8,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  addParticipantButton: {
    backgroundColor: Theme.border,
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addParticipantButtonText: {
    color: Theme.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyParticipantText: {
    fontSize: Typography.base,
    color: Theme.textSecondary,
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
