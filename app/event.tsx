import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { BackdropBlur } from '@/components/screen/BackdropBlur';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { detailHrefFromHost } from '@/utils/detailPaths';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { Option } from '@/components/episode/types';
import { EventParticipantMemoList } from '@/components/event/EventParticipantMemoList';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { formatEpisodeDateToYMD } from '@/components/episode/types';
import { Radius, Spacing, Theme, Typography } from '@/constants/theme';
import { FormRow } from '@/components/ui/FormRow';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import { NoteBlockEditor } from '@/components/ui/NoteBlockEditor';
import { FormScreenBody, FormScreenSection, FormScreenTemplate } from '@/components/screen-templates';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentSwitchProps,
  contentPersonTagStyle,
  contentTagStyle,
  contentTagTextStyle,
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
import { useKeepFormDraft } from '@/hooks/useKeepFormDraft';
import {
  buildNewEventForm,
  buildSavedEventForm,
  deleteEventFormDraft,
  eventDraftBaseMatches,
  eventDraftKey,
  readEventFormDraft,
  serializeEventForm,
} from '@/utils/eventFormDraft';
import {
  clampEventMemoDate,
  draftProfileMemos,
  eventLinkedMemos,
  eventMemoDateRange,
  eventMemoRowsEqual,
  mergeParticipantMemos,
  memoTargetFriendIds,
  memosRecordForEntries,
  profileMemosEqual,
  profileMemosFromFriends,
  savedProfileMemos,
  takeDraftEventMemos,
  withTrailingBlank,
  withTrailingBlankMemos,
  type EventMemoDateRange,
} from '@/utils/eventParticipantMemos';
import { scheduleFriendProfileSync } from '@/lib/identityProfileSync';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  createEvent,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodesByEventId,
  getEvent,
  getEventParticipants,
  getFriendById,
  getEpisodeParticipantFriendIds,
  getMergedEpisodeTagLabels,
  getDefaultProfile,
  getMyself,
  initializeDatabase,
  updateEvent,
  updateEventNotificationId,
  updateFriend,
} from '../db';
import type { EpisodeParticipant, EventInput, Friend, ProfileMemo } from '../types';
import { buildParticipantChipDisplays } from '../utils/episodeHelpers';
import { buildFriendPhotoById } from '@/utils/friendPhoto';

const buildFriendNameById = (friendList: Friend[]): Map<string, string> =>
  new Map(friendList.map((friend) => [friend.id, friend.name]));

const replaceFriendNotes = (friend: Friend, notes: ProfileMemo[]): boolean =>
  updateFriend(friend.id, {
    name: friend.name,
    familyName: friend.familyName,
    givenName: friend.givenName,
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
    traits: friend.traits,
    notes,
    likes: friend.likes,
    dislikes: friend.dislikes,
    episodes: friend.episodes,
    sayings: friend.sayings,
  });

/** 予定の保存と一緒に、参加者欄と本人のメモを人物カードへ書く */
const persistParticipantProfileMemos = (
  entries: EpisodeParticipant[],
  memoState: Record<string, ProfileMemo[]>,
  baselines: Record<string, ProfileMemo[]>,
  savedEventId: string,
  range: EventMemoDateRange,
  myselfId: string | null
): boolean => {
  for (const friendId of memoTargetFriendIds(entries, myselfId)) {
    const friend = getFriendById(friendId);
    if (!friend) {
      return false;
    }
    const baseline =
      friendId in baselines ? baselines[friendId] : eventLinkedMemos(friend.notes ?? [], savedEventId);
    const edited = savedProfileMemos(memoState[friendId] ?? []).map((memo) => ({
      ...memo,
      eventId: savedEventId,
      date: clampEventMemoDate(memo.date, range),
    }));
    const nextNotes = mergeParticipantMemos(friend.notes ?? [], baseline, edited);
    if (profileMemosEqual(friend.notes ?? [], nextNotes)) {
      continue;
    }
    if (!replaceFriendNotes(friend, nextNotes)) {
      return false;
    }
    scheduleFriendProfileSync(friendId);
  }
  return true;
};

const seedParticipantMemos = (
  entries: EpisodeParticipant[],
  edited: Record<string, ProfileMemo[]> | null,
  friendList: Friend[],
  savedEventId: string,
  defaultDate: string,
  myselfId: string | null
): { memos: Record<string, ProfileMemo[]>; baselines: Record<string, ProfileMemo[]> } => {
  const notesById = new Map(friendList.map((friend) => [friend.id, friend.notes ?? []]));
  const fromFriends = profileMemosFromFriends(entries, friendList, savedEventId, myselfId);
  if (!edited) {
    return {
      baselines: fromFriends,
      memos: withTrailingBlankMemos(fromFriends, defaultDate),
    };
  }
  const nextEdited: Record<string, ProfileMemo[]> = {};
  for (const friendId of memoTargetFriendIds(entries, myselfId)) {
    const draftRows = edited[friendId];
    nextEdited[friendId] = draftRows
      ? takeDraftEventMemos(draftRows, notesById.get(friendId) ?? [], savedEventId)
      : (fromFriends[friendId] ?? []);
  }
  return {
    baselines: fromFriends,
    memos: withTrailingBlankMemos(nextEdited, defaultDate),
  };
};
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
import { scheduleGoogleCalendarPush } from '@/utils/googleCalendarSync';
import { scheduleOwnedEventSync } from '@/lib/ownedEventSync';

type PickerTarget = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null;

function EventFieldDivider() {
  const content = useContentColors();
  return <View style={[styles.fieldDivider, { backgroundColor: content.contentDivider }]} />;
}

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
  const navigation = useNavigation();
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const fieldCorner = { borderRadius: Radius.sm };
  const params = useLocalSearchParams<{ eventId?: string; date?: string; draft?: string; section?: string }>();
  const eventId = parseRouteParam(params.eventId);
  const initialDate = parseRouteParam(params.date);
  const isEditing = eventId.length > 0;
  const memoOnly = parseRouteParam(params.section) === 'memos';

  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startDateKey, setStartDateKey] = useState(initialDate || formatDateKey(new Date()));
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endDateKey, setEndDateKey] = useState(initialDate || formatDateKey(new Date()));
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const previousStartRef = useRef<Date | null>(null);
  const savingRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const claimEventDraftRef = useRef<() => void>(() => {});
  const stopEventDraftRef = useRef<() => void>(() => {});
  const flushEventDraftRef = useRef<() => void>(() => {});
  const [isSaving, setIsSaving] = useState(false);

  const unlockScreen = () => {
    savingRef.current = false;
    setIsSaving(false);
  };

  const leaveScreen = () => {
    if (savingRef.current) {
      return;
    }
    allowLeaveRef.current = true;
    savingRef.current = true;
    router.back();
  };

  const finishAndLeave = () => {
    allowLeaveRef.current = true;
    stopEventDraftRef.current();
    deleteEventFormDraft(isEditing ? eventId : null);
    router.back();
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) {
        return;
      }
      if (savingRef.current) {
        event.preventDefault();
        return;
      }
      savingRef.current = true;
    });
    return unsubscribe;
  }, [navigation]);

  const [activePicker, setActivePicker] = useState<PickerTarget>(null);
  useDismissPickerOnKeyboardShow(activePicker != null, () => setActivePicker(null));
  const [isReady, setIsReady] = useState(false);
  const [modalViewportHeight, setModalViewportHeight] = useState(0);
  const [modalContentHeight, setModalContentHeight] = useState(0);
  const [draftBaseline, setDraftBaseline] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [participantEntries, setParticipantEntries] = useState<EpisodeParticipant[]>([]);
  const [participantMemos, setParticipantMemos] = useState<Record<string, ProfileMemo[]>>({});
  const [participantMemoBaselines, setParticipantMemoBaselines] = useState<Record<string, ProfileMemo[]>>(
    {}
  );
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

  const memoDateRange = useMemo(
    () => eventMemoDateRange(startDateKey, endDateKey),
    [endDateKey, startDateKey]
  );

  const participantMemoPeople = useMemo(() => {
    const people: {
      friendId: string;
      name: string;
      photoUri: string | null;
      memos: ProfileMemo[];
    }[] = [];
    for (const friendId of memoTargetFriendIds(participantEntries, myselfId)) {
      const memos = participantMemos[friendId];
      if (!memos) {
        continue;
      }
      people.push({
        friendId,
        name: friendNameById.get(friendId) ?? '',
        photoUri: friendPhotoById.get(friendId) ?? null,
        memos,
      });
    }
    return people;
  }, [friendNameById, friendPhotoById, myselfId, participantEntries, participantMemos]);

  const loadEvent = useCallback(() => {
    initializeDatabase();
    const currentMyselfId = getMyself();
    setMyselfId(currentMyselfId);
    const loadedFriends = getAllFriendsInDefaultOrder();
    setFriends(loadedFriends);
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
      const openedMemos = seedParticipantMemos([], null, loadedFriends, '', baseDate, currentMyselfId);
      setParticipantMemoBaselines(openedMemos.baselines);
      setParticipantMemos(openedMemos.memos);
      setNotifyEnabled(true);
      setNotifyTimingPreset(DEFAULT_NOTIFY_TIMING_PRESET);
      const loaded = buildNewEventForm(initialDate);
      const loadedBody = serializeEventForm(loaded);
      setDraftBaseline(loadedBody);
      if (params.draft === '1') {
        const stored = readEventFormDraft(null);
        if (stored) {
          const fields = stored.fields;
          setTitle(fields.title);
          setMemo(fields.memo);
          setEpisodeTag(fields.episodeTag);
          setAllDay(fields.allDay);
          setStartDateKey(fields.startDateKey);
          setEndDateKey(fields.endDateKey);
          setStartTime(fields.startTime);
          setEndTime(fields.endTime);
          setParticipantEntries(fields.participants);
          const seeded = seedParticipantMemos(
            fields.participants,
            fields.participantMemos,
            loadedFriends,
            '',
            fields.startDateKey,
            currentMyselfId
          );
          setParticipantMemoBaselines(seeded.baselines);
          setParticipantMemos(seeded.memos);
          setNotifyEnabled(fields.notifyEnabled);
          setNotifyTimingPreset(fields.notifyTimingPreset);
          previousStartRef.current = fields.allDay
            ? parseDateKey(fields.startDateKey)
            : combineLocalDateTime(fields.startDateKey, fields.startTime);
          claimEventDraftRef.current();
        }
      }
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
    const loadedParticipants = (() => {
      const excludeProfileId = currentMyselfId ? getDefaultProfile(currentMyselfId)?.id ?? null : null;
      const participantIds = getEventParticipants(eventId).map((participant) => participant.profileId);
      const profileIds = excludeProfileId
        ? participantIds.filter((profileId) => profileId !== excludeProfileId)
        : participantIds;
      return profileIdsToFriendIds(profileIds)
        .filter((friendId) => friendId !== currentMyselfId)
        .map((friendId) => ({ kind: 'individual' as const, value: friendId }));
    })();
    const loadedMemoStart = event.allDay
      ? getAllDayDateKeysFromEvent(event).startDateKey
      : formatDateKey(start);
    const seededMemos = profileMemosFromFriends(
      loadedParticipants,
      loadedFriends,
      event.id,
      currentMyselfId
    );
    setParticipantEntries(loadedParticipants);
    setParticipantMemoBaselines(seededMemos);
    setParticipantMemos(withTrailingBlankMemos(seededMemos, loadedMemoStart));
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
    const loaded = buildSavedEventForm(event, '');
    const loadedBody = serializeEventForm({
      ...loaded,
      participants: loadedParticipants,
      participantMemoBaselines: seededMemos,
      participantMemos: seededMemos,
    });
    setDraftBaseline(loadedBody);
    if (params.draft === '1') {
      const stored = readEventFormDraft(eventId);
      if (stored && !eventDraftBaseMatches(stored.base, loadedBody)) {
        deleteEventFormDraft(eventId);
      } else if (stored) {
        const fields = stored.fields;
        setTitle(fields.title);
        setMemo(fields.memo);
        setEpisodeTag(fields.episodeTag);
        setAllDay(fields.allDay);
        setStartDateKey(fields.startDateKey);
        setEndDateKey(fields.endDateKey);
        setStartTime(fields.startTime);
        setEndTime(fields.endTime);
        setParticipantEntries(fields.participants);
        const draftedMemos = seedParticipantMemos(
          fields.participants,
          fields.participantMemos,
          loadedFriends,
          event.id,
          fields.startDateKey,
          currentMyselfId
        );
        setParticipantMemoBaselines(draftedMemos.baselines);
        setParticipantMemos(draftedMemos.memos);
        setNotifyEnabled(fields.notifyEnabled);
        setNotifyTimingPreset(fields.notifyTimingPreset);
        previousStartRef.current = fields.allDay
          ? parseDateKey(fields.startDateKey)
          : combineLocalDateTime(fields.startDateKey, fields.startTime);
        claimEventDraftRef.current();
      }
    }
    setIsReady(true);
  }, [eventId, initialDate, isEditing, params.draft, router]);

  const eventDraftSnapshot = useMemo(
    () =>
      serializeEventForm({
        title,
        memo,
        episodeTag,
        allDay,
        startDateKey,
        endDateKey,
        startTime,
        endTime,
        participants: participantEntries,
        participantMemoBaselines: memosRecordForEntries(
          participantEntries,
          participantMemoBaselines,
          draftProfileMemos,
          myselfId
        ),
        participantMemos: memosRecordForEntries(
          participantEntries,
          participantMemos,
          draftProfileMemos,
          myselfId
        ),
        notifyEnabled,
        notifyTimingPreset,
        initialDate: isEditing ? '' : initialDate,
      }),
    [
      allDay,
      endDateKey,
      endTime,
      episodeTag,
      initialDate,
      isEditing,
      memo,
      myselfId,
      notifyEnabled,
      notifyTimingPreset,
      participantEntries,
      participantMemoBaselines,
      participantMemos,
      startDateKey,
      startTime,
      title,
    ]
  );
  const eventDraftKeep = useKeepFormDraft(
    isReady && draftBaseline != null,
    eventDraftKey(isEditing ? eventId : null),
    eventDraftSnapshot,
    draftBaseline
  );
  claimEventDraftRef.current = eventDraftKeep.claim;
  stopEventDraftRef.current = eventDraftKeep.stopKeeping;
  flushEventDraftRef.current = eventDraftKeep.flush;

  useEffect(() => {
    if (!isReady) {
      return;
    }
    const range = eventMemoDateRange(startDateKey, endDateKey);
    setParticipantMemos((prev) => {
      let changed = false;
      const next: Record<string, ProfileMemo[]> = {};
      for (const [friendId, rows] of Object.entries(prev)) {
        const normalized = withTrailingBlank(
          rows.map((row) => ({ ...row, date: clampEventMemoDate(row.date, range) })),
          range.startDateKey
        );
        next[friendId] = normalized;
        if (!eventMemoRowsEqual(rows, normalized)) {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [endDateKey, isReady, startDateKey]);

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
    return () => {
      flushEventDraftRef.current();
    };
  }, [loadEvent]);

  const blurTint = appTheme?.variant === 'black' ? 'dark' : 'light';
  const closeIconColor = appTheme?.colors.onScreenText ?? Theme.textPrimary;

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
        locationTag: null,
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
      locationTag: null,
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
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);

    const input = buildEventInput();
    if (!input) {
      unlockScreen();
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

    try {
      if (!isEditing) {
        await requestNotificationPermissionOnFirstCreate();
      }
    } catch {
      unlockScreen();
      return;
    }

    const persistEvent = async (options?: { skipClamp?: boolean }) => {
      if (isEditing) {
        const ok = updateEvent(eventId, input);
        if (!ok) {
          unlockScreen();
          Alert.alert('エラー', '予定の更新に失敗しました。');
          return;
        }
        registerSavedEpisodeTag(input.episodeTag);
        syncEventParticipants(eventId, selectedProfileIds);
        if (!options?.skipClamp) {
          clampLinkedEpisodeDatesToEvent(eventId);
        }
        await applySavedEventNotifications(eventId, previousNotificationId);
        scheduleGoogleCalendarPush(eventId);
        scheduleOwnedEventSync(eventId);
        if (
          !persistParticipantProfileMemos(
            participantEntries,
            participantMemos,
            participantMemoBaselines,
            eventId,
            eventMemoDateRange(startDateKey, endDateKey),
            myselfId
          )
        ) {
          unlockScreen();
          Alert.alert('エラー', '参加者メモの保存に失敗しました。');
          return;
        }
        finishAndLeave();
        return;
      }

      const created = createEvent(input);
      if (!created) {
        unlockScreen();
        Alert.alert('エラー', '予定の作成に失敗しました。');
        return;
      }
      registerSavedEpisodeTag(input.episodeTag);
      syncEventParticipants(created.id, selectedProfileIds);
      await applySavedEventNotifications(created.id, null);
      scheduleGoogleCalendarPush(created.id);
      scheduleOwnedEventSync(created.id);
      if (
        !persistParticipantProfileMemos(
          participantEntries,
          participantMemos,
          participantMemoBaselines,
          created.id,
          eventMemoDateRange(startDateKey, endDateKey),
          myselfId
        )
      ) {
        unlockScreen();
        Alert.alert('エラー', '参加者メモの保存に失敗しました。');
        return;
      }
      finishAndLeave();
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
            { text: 'キャンセル', style: 'cancel', onPress: unlockScreen },
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
    setParticipantMemos((prev) => {
      const next = { ...prev };
      for (const entry of nextEntries) {
        const friendId = entry.value.trim();
        if (!friendId || next[friendId]) {
          continue;
        }
        const notes = eventLinkedMemos(getFriendById(friendId)?.notes ?? [], isEditing ? eventId : '');
        next[friendId] = withTrailingBlank(notes, eventMemoDateRange(startDateKey, endDateKey).startDateKey);
      }
      return next;
    });
    setParticipantMemoBaselines((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const entry of nextEntries) {
        const friendId = entry.value.trim();
        if (!friendId || friendId in next) {
          continue;
        }
        next[friendId] = eventLinkedMemos(getFriendById(friendId)?.notes ?? [], isEditing ? eventId : '');
        changed = true;
      }
      return changed ? next : prev;
    });
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
    if (savingRef.current) {
      return;
    }
    router.push(detailHrefFromHost('person', { id: friendId }));
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
  const pickerTitle =
    activePicker === 'startDate'
      ? '開始日'
      : activePicker === 'endDate'
        ? '終了日'
        : activePicker === 'startTime'
          ? '開始時刻'
          : activePicker === 'endTime'
            ? '終了時刻'
            : '';
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

  const modalOverflows = modalViewportHeight > 0 && modalContentHeight > modalViewportHeight;

  return (
    <>
      <View
        style={styles.modalRoot}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.height);
          setModalViewportHeight((current) => (current === next ? current : next));
        }}
      >
        <BackdropBlur tint={blurTint} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={leaveScreen}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="閉じる"
        />
        <View style={[styles.modalCard, modalOverflows ? { height: modalViewportHeight } : null]}>
          <View
            style={[
              styles.modalCardInner,
              { backgroundColor: kit.screenBackground },
              modalOverflows ? styles.modalCardFill : null,
            ]}
          >
      <FormScreenTemplate
        useTopBar={false}
        fitContent={!modalOverflows}
        onContentSizeChange={(_width, height) => {
          const next = Math.round(height);
          setModalContentHeight((current) => (current === next ? current : next));
        }}
        extraScrollHeight={140}
        scrollContentStyle={styles.scrollContent}
      >
        <FormScreenBody style={{ borderRadius: kit.formPanelBorderRadius }}>
        <FormScreenSection style={styles.formSection}>
          {memoOnly ? (
            <>
              {participantMemoPeople.length > 0 ? (
                <EventParticipantMemoList
                  people={participantMemoPeople}
                  dateRange={memoDateRange}
                  onChangeMemos={(friendId, memos) => {
                    setParticipantMemos((prev) => ({ ...prev, [friendId]: memos }));
                  }}
                />
              ) : (
                <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
                  人物メモを書ける相手がいません
                </Text>
              )}
            </>
          ) : (
          <>
          <FormRow label="タイトル" labelStyle={styles.fieldLabel}>
            <TextInput
              style={[styles.textInput, fieldCorner, contentInputStyle(content)]}
              placeholder="入力"
              placeholderTextColor={content.contentTextSecondary}
              value={title}
              onChangeText={setTitle}
              autoFocus={!isEditing}
            />
          </FormRow>
          <EventFieldDivider />

          <FormRow label="終日" labelStyle={styles.fieldLabel} contentStyle={styles.switchField}>
            <Switch
              value={allDay}
              onValueChange={setAllDay}
              {...contentSwitchProps(content, allDay)}
            />
          </FormRow>
          <EventFieldDivider />

          <FormRow label={allDay ? '開始日' : '開始'} labelStyle={styles.fieldLabel}>
            <View style={styles.dateTimeRow}>
              <Pressable
                style={[styles.textInput, styles.dateTimeField, styles.dateButton, fieldCorner, contentInputStyle(content)]}
                onPress={() => openPicker('startDate')}
              >
                <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>{startDateKey}</Text>
              </Pressable>
              {!allDay ? (
                <Pressable
                  style={[styles.textInput, styles.dateTimeField, styles.timeButton, fieldCorner, contentInputStyle(content)]}
                  onPress={() => openPicker('startTime')}
                >
                  <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>{startTime}</Text>
                </Pressable>
              ) : null}
            </View>
          </FormRow>
          <EventFieldDivider />

          <FormRow label={allDay ? '終了日' : '終了'} labelStyle={styles.fieldLabel}>
            <View style={styles.dateTimeRow}>
              <Pressable
                style={[styles.textInput, styles.dateTimeField, styles.dateButton, fieldCorner, contentInputStyle(content)]}
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
                  style={[styles.textInput, styles.dateTimeField, styles.timeButton, fieldCorner, contentInputStyle(content)]}
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
          <EventFieldDivider />

          <FormRow label="会う人" labelStyle={styles.fieldLabel} style={styles.rowAlignStart}>
            <ParticipantChipList
              chips={participantChips}
              layout="wrap"
              onPressProfile={handleOpenProfileDetail}
              onRemoveChip={handleRemoveParticipantChip}
              trailing={
                <Pressable
                  accessibilityLabel="会う人を追加"
                  style={[styles.participantAddChip, contentPersonTagStyle(content)]}
                  onPress={openParticipantSelector}
                >
                  <Text style={[styles.participantAddChipText, contentTagTextStyle(content)]}>＋</Text>
                </Pressable>
              }
            />
          </FormRow>
          <EventFieldDivider />

          <FormRow label="タグ" labelStyle={styles.fieldLabel} contentLayout="compact">
            <Pressable
              style={[styles.selectChipButton, contentPersonTagStyle(content)]}
              onPress={() => {
                dismissKeyboardFocus();
                setTagModalVisible(true);
              }}
              accessibilityLabel="予定タグを選択"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.selectChipText,
                  episodeTag ? contentTextStyle(content) : contentMutedTextStyle(content),
                ]}
                numberOfLines={1}
              >
                {episodeTag || '予定タグ'}
              </Text>
              <Text style={[styles.selectChipChevron, contentMutedTextStyle(content)]}>▼</Text>
            </Pressable>
          </FormRow>
          <EventFieldDivider />

          <FormRow label="通知" labelStyle={styles.fieldLabel} contentStyle={styles.notifyRow}>
            <Switch
              value={notifyEnabled}
              onValueChange={setNotifyEnabled}
              {...contentSwitchProps(content, notifyEnabled)}
            />
            {notifyEnabled ? (
              <Pressable
                style={[styles.selectChipButton, contentPersonTagStyle(content)]}
                onPress={() => {
                  dismissKeyboardFocus();
                  setTimingModalVisible(true);
                }}
                accessibilityLabel={`通知タイミング ${selectedTimingLabel}`}
                accessibilityRole="button"
              >
                <Text style={[styles.selectChipText, contentTextStyle(content)]} numberOfLines={1}>
                  {selectedTimingLabel}
                </Text>
                <Text style={[styles.selectChipChevron, contentMutedTextStyle(content)]}>▼</Text>
              </Pressable>
            ) : null}
          </FormRow>
          <EventFieldDivider />

          <FormRow label="メモ" layout="vertical">
            <NoteBlockEditor
              formatToolbar={false}
              style={[styles.memoInput, fieldCorner, contentInputStyle(content)]}
              placeholder="入力"
              placeholderTextColor={content.contentTextSecondary}
              value={memo}
              onChangeText={setMemo}
              minHeight={86}
              uncapped
            />
          </FormRow>
          </>
          )}

          <View style={[styles.formActions, memoOnly ? styles.memoFormActions : null]}>
            <Pressable
              style={[styles.formCancelButton, fieldCorner, isSaving ? styles.saveButtonBusy : null]}
              onPress={leaveScreen}
              disabled={isSaving}
            >
              <Text style={styles.formCancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={[
                styles.formSaveButton,
                fieldCorner,
                contentFilledButtonStyle(content),
                isSaving ? styles.saveButtonBusy : null,
              ]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Text style={[styles.formSaveButtonText, contentFilledButtonTextStyle(content)]}>
                {isEditing ? '更新' : '保存'}
              </Text>
            </Pressable>
          </View>
        </FormScreenSection>
        </FormScreenBody>
      </FormScreenTemplate>
            <View pointerEvents="box-none" style={styles.modalHeader}>
              <BackdropBlur tint={blurTint} />
              <Text
                pointerEvents="none"
                style={[styles.modalTitle, contentTextStyle(content)]}
              >
                {memoOnly ? '参加者のメモ' : isEditing ? '予定編集' : '予定追加'}
              </Text>
              <Pressable
                style={[styles.closeButton, isSaving ? styles.saveButtonBusy : null]}
                onPress={leaveScreen}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel="閉じる"
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={closeIconColor} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={activePicker != null}
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.dateTimeModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setActivePicker(null)}
            accessibilityLabel="閉じる"
            accessibilityRole="button"
          />
          <View
            style={[
              styles.dateTimeModalCard,
              { backgroundColor: content.contentCard, borderColor: content.contentBorder },
            ]}
          >
            <Text style={[styles.dateTimeModalTitle, contentTextStyle(content)]}>{pickerTitle}</Text>
            <DateTimePicker
              value={Number.isNaN(pickerValue.getTime()) ? new Date() : pickerValue}
              mode={pickerMode}
              display="spinner"
              locale="ja-JP"
              style={styles.dateTimePicker}
              {...dateTimePickerProps}
              {...pickerBounds}
              onChange={handlePickerChange}
            />
            <Pressable
              style={[styles.dateTimeModalDone, fieldCorner, contentFilledButtonStyle(content)]}
              onPress={() => setActivePicker(null)}
            >
              <Text style={[styles.dateTimeModalDoneText, contentFilledButtonTextStyle(content)]}>完了</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
        columns={2}
      />

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
        onPersonCreated={() => setFriends(getAllFriendsInDefaultOrder())}
        enableGroupTab={false}
      />
    </>
  );
}

const EVENT_MODAL_SIDE_GUTTER = 36;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  modalCard: {
    maxHeight: '100%',
    alignSelf: 'stretch',
    marginHorizontal: EVENT_MODAL_SIDE_GUTTER,
    borderRadius: Radius.lg,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  modalCardInner: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  modalCardFill: {
    flex: 1,
  },
  saveButtonBusy: {
    opacity: 0.55,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  memoFormActions: {
    marginTop: 16,
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
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  formSaveButtonText: {
    fontWeight: '700',
    fontSize: Typography.base,
  },
  scrollContent: {
    paddingTop: 48,
    paddingBottom: Spacing.lg,
  },
  modalHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    zIndex: 2,
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    marginHorizontal: 44,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  formSection: {
    gap: 0,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  fieldLabel: {
    width: 72,
    textAlign: 'left',
  },
  rowAlignStart: {
    alignItems: 'flex-start',
  },
  switchField: {
    alignItems: 'flex-start',
  },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  textInput: {
    minHeight: 38,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.sm,
    backgroundColor: Theme.bgSurface,
    color: Theme.inputText,
    paddingHorizontal: 10,
    fontSize: 14,
    width: '100%',
  },
  dateTimeField: {
    justifyContent: 'center',
  },
  memoInput: {
    minHeight: 86,
    textAlignVertical: 'top',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 14,
    marginBottom: 8,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  dateButton: {
    flex: 1,
    width: undefined,
  },
  timeButton: {
    width: 96,
    flex: 0,
  },
  pickerButtonText: {
    fontSize: Typography.base,
  },
  pickerPlaceholder: {
    fontSize: Typography.base,
  },
  selectChipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  selectChipText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  selectChipChevron: {
    fontSize: 9,
    marginTop: 1,
  },
  participantAddChip: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAddChipText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  dateTimeModalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  dateTimeModalCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 16,
  },
  dateTimeModalTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dateTimePicker: {
    height: 216,
    width: '100%',
  },
  dateTimeModalDone: {
    alignSelf: 'flex-end',
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
  },
  dateTimeModalDoneText: {
    fontSize: 14,
    fontWeight: '700',
  },
  linkedTaskRow: {
    borderWidth: 1,
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
  linkedList: {
    gap: 8,
  },
  emptyText: {
    fontSize: Typography.base,
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
