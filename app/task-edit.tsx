import { useCallback, useMemo, useRef, useState } from 'react';
import { useKeepFormDraft } from '@/hooks/useKeepFormDraft';
import {
  buildTaskBaseline,
  deleteTaskFormDraft,
  readTaskFormDraft,
  serializeTaskForm,
  taskDraftKey,
} from '@/utils/taskFormDraft';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { taskHrefMatch } from '@/utils/detailRouteMemory';
import { leaveForgottenDetail } from '@/utils/tabNavigation';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  FormScreenBody,
  FormScreenSection,
  FormScreenTemplate,
} from '@/components/screen-templates';
import { FormRow } from '@/components/ui/FormRow';
import { PickerDoneOverlay } from '@/components/ui/PickerDoneOverlay';
import { NoteBlockEditor } from '@/components/ui/NoteBlockEditor';
import { DayRollPicker, MonthDayRollPicker, RollScrollLockProvider, useRollScrollLock } from '@/components/ui/RollSelect';
import { EpisodeEventLinkField } from '@/components/episode/EpisodeEventLinkField';
import type { EpisodeEventLinkMode } from '@/hooks/useEpisodeForm';
import {
  createEvent,
  createTask,
  createTaskGroup,
  deleteAllTaskCompletions,
  deleteTask,
  getAllTaskGroups,
  getEvent,
  getTaskGroupsByKind,
  getTask,
  getTaskCompletionCount,
  getTaskCompletions,
  initializeDatabase,
  updateTask,
} from '../db';
import {
  Event,
  TaskCompletion,
  TaskGroup,
  TaskInput,
  TaskKind,
  TaskPace,
  TaskRecurrenceUnit,
} from '../types';
import {
  MONTH_NTH_OPTIONS,
  TaskRecurrenceConfig,
  WEEKDAY_OPTIONS,
  formatRecurrenceLabel,
  resolveMonthNths,
  resolveMonthWeekdays,
} from '@/utils/taskHelpers';
import {
  buildAllDayEndAt,
  buildAllDayStartAt,
  formatDateKey,
  getAllDayDateKeysFromEvent,
  parseDateKey,
} from '@/utils/eventHelpers';
import { scheduleGoogleCalendarPush } from '@/utils/googleCalendarSync';
import { scheduleOwnedEventSync } from '@/lib/ownedEventSync';
import { useContentColors } from '@/utils/useContentColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import { openRangeDatePickerBounds } from '@/utils/datePickerBounds';
import { useDismissPickerOnKeyboardShow } from '@/hooks/useDismissPickerOnKeyboardShow';
import {
  contentDateTimePickerProps,
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentSwitchProps,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import { TaskRemindFields } from '@/components/task/TaskRemindFields';
import { requestNotificationPermissionOnFirstCreate } from '@/utils/eventNotifications';
import {
  DEFAULT_REMIND_TIME,
  syncTaskReminders,
} from '@/utils/taskNotifications';

function TaskFieldDivider() {
  const content = useContentColors();
  return <View style={[styles.fieldDivider, { backgroundColor: content.contentDivider }]} />;
}

const GROUP_NONE = '';
const GROUP_NEW = '__new__';

function eventStartDateKey(event: Event): string {
  if (event.allDay) {
    return getAllDayDateKeysFromEvent(event).startDateKey;
  }
  return formatDateKey(new Date(event.startAt));
}

const DUE_QUICK_OPTIONS = [
  { days: 0, label: '今日' },
  { days: 1, label: '明日' },
  { days: 2, label: '明後日' },
] as const;

function dueDateKeyFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

function formatCompletionHistoryDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((part) => Number(part));
  if (!y || !m || !d) {
    return ymd;
  }
  return `${y}/${m}/${d}`;
}

export default function TaskEditScreen() {
  const router = useRouter();
  const content = useContentColors();
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const [formScrollEnabled, setRollScrolling] = useRollScrollLock();
  const params = useLocalSearchParams<{
    taskId?: string;
    eventId?: string;
    kind?: string;
    groupId?: string;
    draft?: string;
  }>();
  const taskId = typeof params.taskId === 'string' ? params.taskId : '';
  const presetEventId = typeof params.eventId === 'string' ? params.eventId : '';
  const presetGroupId = typeof params.groupId === 'string' ? params.groupId.trim() : '';
  const presetKind: TaskKind | null =
    params.kind === 'recurring' || params.kind === 'temporary'
      ? params.kind
      : presetGroupId
        ? 'recurring'
        : null;
  const isEditing = Boolean(taskId);
  /** 予定紐づけ中は臨時固定 */
  const [eventLinkMode, setEventLinkMode] = useState<EpisodeEventLinkMode>(
    presetEventId ? 'existing' : 'none'
  );
  const lockedToEvent = eventLinkMode === 'existing' || eventLinkMode === 'create_new';

  const [kind, setKind] = useState<TaskKind>(presetKind ?? 'temporary');
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [pace, setPace] = useState<TaskPace>('scheduled');
  const [unit, setUnit] = useState<TaskRecurrenceUnit>('day');
  const [weekdaysUnspecified, setWeekdaysUnspecified] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [weekStartsOn, setWeekStartsOn] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [monthMode, setMonthMode] = useState<'day' | 'nth'>('day');
  const [monthNths, setMonthNths] = useState<number[]>([1]);
  const [monthWeekdays, setMonthWeekdays] = useState<number[]>([1]);
  const [yearMonth, setYearMonth] = useState(1);
  const [yearDay, setYearDay] = useState(1);
  const [dueDate, setDueDate] = useState('');
  const [showDuePicker, setShowDuePicker] = useState(false);
  const [showMonthDayPicker, setShowMonthDayPicker] = useState(false);
  const [showYearDatePicker, setShowYearDatePicker] = useState(false);
  useDismissPickerOnKeyboardShow(
    showDuePicker || showMonthDayPicker || showYearDatePicker,
    () => {
      setShowDuePicker(false);
      setShowMonthDayPicker(false);
      setShowYearDatePicker(false);
    }
  );
  const [eventId, setEventId] = useState(presetEventId);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [groupSelect, setGroupSelect] = useState(GROUP_NONE);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [trackCompletions, setTrackCompletions] = useState(true);
  const [initialTrackCompletions, setInitialTrackCompletions] = useState(true);
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindDaysBefore, setRemindDaysBefore] = useState(0);
  const [remindTime, setRemindTime] = useState(DEFAULT_REMIND_TIME);
  const [ready, setReady] = useState(false);
  const [draftBaseline, setDraftBaseline] = useState<string | null>(null);
  const claimTaskDraftRef = useRef<() => void>(() => {});
  const stopTaskDraftRef = useRef<() => void>(() => {});
  const flushTaskDraftRef = useRef<() => void>(() => {});
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const unlockSave = () => {
    savingRef.current = false;
    setIsSaving(false);
  };
  const lockSave = () => {
    if (savingRef.current) {
      return false;
    }
    savingRef.current = true;
    setIsSaving(true);
    return true;
  };
  const leaveScreen = () => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    router.back();
  };

  useFocusEffect(
    useCallback(() => {
      initializeDatabase();
      setTaskGroups(getAllTaskGroups());
      if (taskId) {
        const task = getTask(taskId);
        if (!task) {
          Alert.alert('エラー', 'タスクが見つかりません');
          router.back();
          return;
        }
        setKind(task.eventId ? 'temporary' : task.kind);
        setTitle(task.title);
        setMemo(task.memo ?? '');
        setPace(task.pace ?? 'unpaced');
        setUnit(task.recurrenceUnit ?? 'day');
        const config = task.recurrenceConfig ?? {};
        if (task.recurrenceUnit === 'week') {
          const hasDays = Boolean(config.weekdays?.length);
          setWeekdaysUnspecified(!hasDays);
          setWeekdays(hasDays ? config.weekdays! : [1]);
        } else {
          setWeekdaysUnspecified(false);
          setWeekdays(config.weekdays?.length ? config.weekdays : [1]);
        }
        setWeekStartsOn(config.weekStartsOn ?? 1);
        if (config.monthDay != null) {
          setMonthMode('day');
          setMonthDay(config.monthDay);
        } else if (resolveMonthNths(config).length > 0) {
          setMonthMode('nth');
          setMonthNths(resolveMonthNths(config));
          setMonthWeekdays(resolveMonthWeekdays(config).length ? resolveMonthWeekdays(config) : [1]);
        }
        if (config.yearMonth != null) setYearMonth(config.yearMonth);
        if (config.yearDay != null) setYearDay(config.yearDay);
        setDueDate(task.dueDate ?? '');
        setEventId(task.eventId ?? '');
        setEventLinkMode(task.eventId ? 'existing' : 'none');
        setGroupSelect(task.groupId ?? GROUP_NONE);
        setNewGroupTitle('');
        setTrackCompletions(task.trackCompletions);
        setInitialTrackCompletions(task.trackCompletions);
        setRemindEnabled(task.remindEnabled);
        setRemindDaysBefore(task.remindDaysBefore ?? 0);
        setRemindTime(task.remindTime ?? DEFAULT_REMIND_TIME);
        setCompletions(task.kind === 'recurring' ? getTaskCompletions(taskId) : []);
      } else if (presetEventId) {
        setKind('temporary');
        setEventId(presetEventId);
        setEventLinkMode('existing');
        const event = getEvent(presetEventId);
        setDueDate(event ? eventStartDateKey(event) : '');
        setGroupSelect(GROUP_NONE);
        setNewGroupTitle('');
        setRemindEnabled(false);
        setRemindDaysBefore(0);
        setRemindTime(DEFAULT_REMIND_TIME);
        setCompletions([]);
      } else {
        setEventLinkMode('none');
        setKind(presetKind ?? 'temporary');
        setGroupSelect(presetGroupId || GROUP_NONE);
        setNewGroupTitle('');
        setRemindEnabled(false);
        setRemindDaysBefore(0);
        setRemindTime(DEFAULT_REMIND_TIME);
        setCompletions([]);
      }
      const loadedTask = taskId ? getTask(taskId) : null;
      const loaded = buildTaskBaseline({
        task: loadedTask,
        presetEventId,
        presetGroupId,
        presetKind,
        linkedEvent: presetEventId ? getEvent(presetEventId) : null,
      });
      const loadedBody = serializeTaskForm(loaded);
      setDraftBaseline(loadedBody);
      if (params.draft === '1') {
        const stored = readTaskFormDraft(taskId || null);
        if (stored && taskId && stored.base !== loadedBody) {
          deleteTaskFormDraft(taskId);
        } else if (stored) {
          const fields = stored.fields;
          setKind(fields.kind);
          setTitle(fields.title);
          setMemo(fields.memo);
          setPace(fields.pace);
          setUnit(fields.unit);
          setWeekdaysUnspecified(fields.weekdaysUnspecified);
          setWeekdays(fields.weekdays);
          setWeekStartsOn(fields.weekStartsOn);
          setMonthDay(fields.monthDay);
          setMonthMode(fields.monthMode);
          setMonthNths(fields.monthNths);
          setMonthWeekdays(fields.monthWeekdays);
          setYearMonth(fields.yearMonth);
          setYearDay(fields.yearDay);
          setDueDate(fields.dueDate);
          setEventLinkMode(fields.eventLinkMode);
          setEventId(fields.eventId);
          setGroupSelect(fields.groupSelect);
          setNewGroupTitle(fields.newGroupTitle);
          setTrackCompletions(fields.trackCompletions);
          setRemindEnabled(fields.remindEnabled);
          setRemindDaysBefore(fields.remindDaysBefore);
          setRemindTime(fields.remindTime);
          claimTaskDraftRef.current();
        }
      }
      setReady(true);
      return () => {
        flushTaskDraftRef.current();
      };
    }, [params.draft, presetEventId, presetGroupId, presetKind, router, taskId])
  );

  const taskDraftSnapshot = useMemo(
    () =>
      serializeTaskForm({
        kind,
        title,
        memo,
        pace,
        unit,
        weekdaysUnspecified,
        weekdays,
        weekStartsOn,
        monthDay,
        monthMode,
        monthNths,
        monthWeekdays,
        yearMonth,
        yearDay,
        dueDate,
        eventLinkMode,
        eventId,
        groupSelect,
        newGroupTitle,
        trackCompletions,
        remindEnabled,
        remindDaysBefore,
        remindTime,
        presetEventId,
        presetGroupId,
        presetKind: presetKind ?? '',
      }),
    [
      dueDate,
      eventId,
      eventLinkMode,
      groupSelect,
      kind,
      memo,
      monthDay,
      monthMode,
      monthNths,
      monthWeekdays,
      newGroupTitle,
      pace,
      presetEventId,
      presetGroupId,
      presetKind,
      remindDaysBefore,
      remindEnabled,
      remindTime,
      title,
      trackCompletions,
      unit,
      weekStartsOn,
      weekdays,
      weekdaysUnspecified,
      yearDay,
      yearMonth,
    ]
  );
  const taskDraftKeep = useKeepFormDraft(
    ready && draftBaseline != null,
    taskDraftKey(taskId || null),
    taskDraftSnapshot,
    draftBaseline
  );
  claimTaskDraftRef.current = taskDraftKeep.claim;
  stopTaskDraftRef.current = taskDraftKeep.stopKeeping;
  flushTaskDraftRef.current = taskDraftKeep.flush;

  const buildConfig = (): TaskRecurrenceConfig => {
    if (unit === 'week') {
      if (weekdaysUnspecified) {
        return { weekdays: [], weekStartsOn };
      }
      return { weekdays: weekdays.slice().sort((a, b) => a - b) };
    }
    if (unit === 'month') {
      if (monthMode === 'nth') {
        return {
          monthNths: monthNths.slice().sort((a, b) => a - b),
          monthWeekdays: monthWeekdays.slice().sort((a, b) => a - b),
        };
      }
      return { monthDay: Math.min(31, Math.max(1, monthDay || 1)) };
    }
    if (unit === 'year') {
      return {
        yearMonth: Math.min(12, Math.max(1, yearMonth || 1)),
        yearDay: Math.min(31, Math.max(1, yearDay || 1)),
      };
    }
    return {};
  };

  const handleEventLinkModeChange = (mode: EpisodeEventLinkMode) => {
    setEventLinkMode(mode);
    if (mode === 'none') {
      setEventId('');
      return;
    }
    setKind('temporary');
    if (
      groupSelect &&
      groupSelect !== GROUP_NEW &&
      !taskGroups.some((group) => group.id === groupSelect && group.kind === 'temporary')
    ) {
      setGroupSelect(GROUP_NONE);
      setNewGroupTitle('');
    }
    if (mode === 'create_new') {
      setEventId('');
    }
  };

  const handleSelectLinkedEvent = (selectedEventId: string) => {
    const normalized = selectedEventId.trim();
    if (!normalized) {
      setEventId('');
      setEventLinkMode('none');
      return;
    }
    const event = getEvent(normalized);
    if (!event) {
      return;
    }
    setKind('temporary');
    setEventLinkMode('existing');
    setEventId(normalized);
    setDueDate(eventStartDateKey(event));
    if (
      groupSelect &&
      groupSelect !== GROUP_NEW &&
      !taskGroups.some((group) => group.id === groupSelect && group.kind === 'temporary')
    ) {
      setGroupSelect(GROUP_NONE);
      setNewGroupTitle('');
    }
  };

  const persistTask = (nextTrack: boolean) => {
    const trimmed = title.trim();
    const effectiveKind: TaskKind = lockedToEvent ? 'temporary' : kind;

    initializeDatabase();

    let resolvedGroupId: string | null = null;
    if (groupSelect === GROUP_NEW) {
      const groupTitle = newGroupTitle.trim();
      if (!groupTitle) {
        unlockSave();
        Alert.alert('入力エラー', '新しいグループ名を入力してください');
        return;
      }
        const createdGroup = createTaskGroup({ title: groupTitle, kind: effectiveKind });
        if (!createdGroup) {
          unlockSave();
          Alert.alert('エラー', 'グループの作成に失敗しました');
          return;
        }
        resolvedGroupId = createdGroup.id;
      } else if (groupSelect) {
        resolvedGroupId = groupSelect;
      }

      if (resolvedGroupId && !getTaskGroupsByKind(effectiveKind).some((group) => group.id === resolvedGroupId)) {
        unlockSave();
        Alert.alert('入力エラー', 'グループの種別がタスクと一致しません');
        return;
      }

    let resolvedEventId: string | null = null;
    if (effectiveKind === 'temporary') {
      if (eventLinkMode === 'create_new') {
        const dateKey = dueDate.trim();
        if (!dateKey) {
          unlockSave();
          Alert.alert('入力エラー', '予定を新規作成するには期限を設定してください');
          return;
        }
        const createdEvent = createEvent({
          title: trimmed,
          startAt: buildAllDayStartAt(dateKey),
          endAt: buildAllDayEndAt(dateKey),
          allDay: true,
          memo: memo.trim() || null,
          notifyAt: null,
          notifyEnabled: false,
          autoEpisodeCreated: false,
          episodeTag: null,
          locationTag: null,
        });
        if (!createdEvent) {
          unlockSave();
          Alert.alert('エラー', '予定の作成に失敗しました');
          return;
        }
        scheduleGoogleCalendarPush(createdEvent.id);
        scheduleOwnedEventSync(createdEvent.id);
        resolvedEventId = createdEvent.id;
      } else if (eventLinkMode === 'existing') {
        const linked = eventId.trim();
        if (!linked) {
          unlockSave();
          Alert.alert('入力エラー', '紐づける予定を選択してください');
          return;
        }
        resolvedEventId = linked;
      }
    }

    const joiningRecurringGroup = Boolean(resolvedGroupId) && effectiveKind === 'recurring';
    const nextRemindEnabled = joiningRecurringGroup
      ? false
      : effectiveKind === 'temporary'
        ? Boolean(dueDate.trim()) && remindEnabled
        : pace === 'scheduled' && remindEnabled;

    const input: TaskInput = {
      kind: effectiveKind,
      title: trimmed,
      memo,
      pace: effectiveKind === 'recurring' ? pace : null,
      recurrenceUnit: effectiveKind === 'recurring' && pace === 'scheduled' ? unit : null,
      recurrenceConfig: effectiveKind === 'recurring' && pace === 'scheduled' ? buildConfig() : null,
      dueDate: effectiveKind === 'temporary' ? dueDate.trim() || null : null,
      eventId: resolvedEventId,
      groupId: resolvedGroupId,
      trackCompletions: effectiveKind === 'recurring' ? nextTrack : true,
      remindEnabled: nextRemindEnabled,
      remindDaysBefore: nextRemindEnabled && effectiveKind === 'temporary' ? remindDaysBefore : null,
      remindTime: nextRemindEnabled ? remindTime.trim() || DEFAULT_REMIND_TIME : null,
    };

    if (isEditing && initialTrackCompletions && !nextTrack && effectiveKind === 'recurring') {
      deleteAllTaskCompletions(taskId);
    }

    if (isEditing) {
      const ok = updateTask(taskId, input);
      if (!ok) {
        unlockSave();
        Alert.alert('エラー', '保存に失敗しました');
        return;
      }
    } else {
      const created = createTask(input);
      if (!created) {
        unlockSave();
        Alert.alert('エラー', '作成に失敗しました');
        return;
      }
    }
    void (async () => {
      if (nextRemindEnabled) {
        await requestNotificationPermissionOnFirstCreate();
      }
      await syncTaskReminders();
    })();
    stopTaskDraftRef.current();
    deleteTaskFormDraft(taskId || null);
    router.back();
  };

  const handleSave = () => {
    if (savingRef.current) {
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('入力エラー', 'タイトルを入力してください');
      return;
    }
    const effectiveKind: TaskKind = lockedToEvent ? 'temporary' : kind;
    if (effectiveKind === 'recurring' && pace === 'scheduled' && unit === 'week') {
      if (!weekdaysUnspecified && weekdays.length === 0) {
        Alert.alert('入力エラー', '曜日を選ぶか、指定なしを選んでください');
        return;
      }
    }
    if (effectiveKind === 'recurring' && pace === 'scheduled' && unit === 'month' && monthMode === 'nth') {
      if (monthNths.length === 0 || monthWeekdays.length === 0) {
        Alert.alert('入力エラー', '第Nと曜日をそれぞれ1つ以上選んでください');
        return;
      }
    }

    const turningOffTrack =
      isEditing &&
      effectiveKind === 'recurring' &&
      initialTrackCompletions &&
      !trackCompletions;
    const historyCount = turningOffTrack ? getTaskCompletionCount(taskId) : 0;

    if (turningOffTrack && historyCount > 0) {
      if (!lockSave()) {
        return;
      }
      Alert.alert(
        '実施記録をやめる',
        `これまでの実施履歴（${historyCount}件）がすべて削除されます。この操作は取り消せません。`,
        [
          { text: 'キャンセル', style: 'cancel', onPress: unlockSave },
          {
            text: '次へ',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                '本当に履歴を消しますか？',
                '連続記録・過去の実施日もすべて消えます。',
                [
                  { text: 'キャンセル', style: 'cancel', onPress: unlockSave },
                  {
                    text: '理解した',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert(
                        '最終確認',
                        '実施記録をオフにして、履歴を完全に削除します。',
                        [
                          { text: 'キャンセル', style: 'cancel', onPress: unlockSave },
                          {
                            text: '削除してオフにする',
                            style: 'destructive',
                            onPress: () => persistTask(false),
                          },
                        ]
                      );
                    },
                  },
                ]
              );
            },
          },
        ]
      );
      return;
    }

    if (!lockSave()) {
      return;
    }
    persistTask(trackCompletions);
  };

  const confirmDeleteFinally = () => {
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    deleteTask(taskId);
    void syncTaskReminders();
    stopTaskDraftRef.current();
    deleteTaskFormDraft(taskId || null);
    leaveForgottenDetail(taskHrefMatch(taskId));
  };

  const handleDelete = () => {
    if (savingRef.current || !isEditing) return;
    if (kind === 'recurring') {
      Alert.alert(
        '定期タスクを削除',
        'この定期タスクを削除すると、これまでの実施履歴もすべて消えます。\nこの操作は取り消せません。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: 'それでも削除する',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                '本当に削除しますか？',
                '実施履歴を含めて完全に削除されます。よろしいですか？',
                [
                  { text: 'キャンセル', style: 'cancel' },
                  { text: '完全に削除', style: 'destructive', onPress: confirmDeleteFinally },
                ]
              );
            },
          },
        ]
      );
      return;
    }
    Alert.alert('タスクを削除', 'このタスクを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: confirmDeleteFinally },
    ]);
  };

  const effectiveKindForGroup: TaskKind = lockedToEvent ? 'temporary' : kind;
  const kindScopedGroups = useMemo(
    () => taskGroups.filter((group) => group.kind === effectiveKindForGroup),
    [taskGroups, effectiveKindForGroup]
  );

  const groupPickerOptions = useMemo(
    () => [
      ...kindScopedGroups.map((group) => ({ label: group.title, value: group.id })),
      { label: '新しいグループ…', value: GROUP_NEW },
    ],
    [kindScopedGroups]
  );

  const groupSelectLabel = useMemo(() => {
    if (groupSelect === GROUP_NEW) return '新しいグループ…';
    if (!groupSelect) return 'なし';
    return kindScopedGroups.find((group) => group.id === groupSelect)?.title ?? 'なし';
  }, [groupSelect, kindScopedGroups]);

  const previewLabel = useMemo(() => {
    if (kind !== 'recurring') return '';
    return formatRecurrenceLabel(pace, pace === 'scheduled' ? unit : null, buildConfig());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kind,
    pace,
    unit,
    weekdaysUnspecified,
    weekdays,
    weekStartsOn,
    monthDay,
    monthMode,
    monthNths,
    monthWeekdays,
    yearMonth,
    yearDay,
  ]);

  const selectWeekdaysUnspecified = () => {
    setWeekdaysUnspecified(true);
  };

  const toggleWeekday = (value: number) => {
    setWeekdaysUnspecified(false);
    setWeekdays((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((d) => d !== value);
        return next.length === 0 ? prev : next;
      }
      return [...prev, value].sort((a, b) => a - b);
    });
  };

  const toggleMonthNth = (value: number) => {
    setMonthNths((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((n) => n !== value);
        return next.length === 0 ? prev : next;
      }
      return [...prev, value].sort((a, b) => a - b);
    });
  };

  const toggleMonthWeekday = (value: number) => {
    setMonthWeekdays((prev) => {
      if (prev.includes(value)) {
        const next = prev.filter((d) => d !== value);
        return next.length === 0 ? prev : next;
      }
      return [...prev, value].sort((a, b) => a - b);
    });
  };

  if (!ready) {
    return <View style={[styles.loadingScreen, { backgroundColor: kit.screenBackground }]} />;
  }

  return (
    <FormScreenTemplate
      title={isEditing ? 'タスク編集' : 'タスク追加'}
      onBack={leaveScreen}
      backDisabled={isSaving}
      scrollEnabled={formScrollEnabled}
      right={
        <Pressable
          style={[styles.saveButton, contentFilledButtonStyle(content), isSaving ? styles.saveTextBusy : null]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={[styles.saveText, contentFilledButtonTextStyle(content)]}>保存</Text>
        </Pressable>
      }
    >
      <RollScrollLockProvider setRollScrolling={setRollScrolling}>
      <FormScreenBody style={{ borderRadius: kit.formPanelBorderRadius }}>
        <FormScreenSection style={styles.formSection}>
          <FormRow label="タイトル" labelStyle={styles.fieldLabel}>
            <TextInput
              style={[styles.input, contentInputStyle(content)]}
              value={title}
              onChangeText={setTitle}
              autoFocus={!isEditing}
              placeholder="入力"
              placeholderTextColor={content.contentTextSecondary}
              accessibilityLabel="タイトル"
            />
          </FormRow>
          <TaskFieldDivider />
          <FormRow label="種別" labelStyle={styles.fieldLabel} contentStyle={styles.kindField}>
            <View
              style={[
                styles.kindSegment,
                contentSurfaceStyle(content),
                { borderColor: content.contentBorder },
                lockedToEvent ? styles.kindSegmentLocked : null,
              ]}
            >
                {(
                  [
                    { key: 'recurring' as const, label: '定期' },
                    { key: 'temporary' as const, label: '臨時' },
                  ] as const
                ).map((item) => {
                  const selected = (lockedToEvent ? 'temporary' : kind) === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      style={[
                        styles.kindSegmentItem,
                        selected
                          ? contentFilledButtonStyle(content)
                          : null,
                      ]}
                      disabled={lockedToEvent}
                      onPress={() => {
                        if (lockedToEvent) return;
                        setKind(item.key);
                        if (item.key === 'recurring') {
                          setEventLinkMode('none');
                          setEventId('');
                        }
                        if (
                          groupSelect &&
                          groupSelect !== GROUP_NEW &&
                          !taskGroups.some(
                            (group) => group.id === groupSelect && group.kind === item.key
                          )
                        ) {
                          setGroupSelect(GROUP_NONE);
                          setNewGroupTitle('');
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: lockedToEvent }}
                      accessibilityLabel={`タスク種別 ${item.label}`}
                      accessibilityHint={lockedToEvent ? '予定に紐づくタスクは臨時で固定です' : undefined}
                    >
                      <Text
                        style={[
                          styles.kindSegmentText,
                          selected
                            ? contentFilledButtonTextStyle(content)
                            : { color: content.contentTextSecondary },
                          { fontWeight: selected ? '700' : '600' },
                          !selected && lockedToEvent ? styles.kindSegmentTextLocked : null,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
          </FormRow>
          <TaskFieldDivider />
          <FormRow label="グループ" labelStyle={styles.fieldLabel}>
            <Pressable
              style={[styles.pickerButton, contentInputStyle(content)]}
              onPress={() => {
                dismissKeyboardFocus();
                setGroupPickerVisible(true);
              }}
            >
              <Text
                style={[
                  styles.pickerButtonText,
                  groupSelect ? contentTextStyle(content) : contentMutedTextStyle(content),
                ]}
              >
                {groupSelectLabel}
              </Text>
              <Text style={[styles.pickerChevron, contentMutedTextStyle(content)]}>▼</Text>
            </Pressable>
          </FormRow>
          {groupSelect === GROUP_NEW ? (
            <>
            <TaskFieldDivider />
            <FormRow label="グループ名" labelStyle={styles.fieldLabel}>
              <TextInput
                style={[styles.input, contentInputStyle(content)]}
                value={newGroupTitle}
                onChangeText={setNewGroupTitle}
                placeholder="例: 買い物"
                placeholderTextColor={content.contentTextSecondary}
              />
            </FormRow>
            </>
          ) : null}

        {kind === 'recurring' ? (
          <>
            <TaskFieldDivider />
              <FormRow label="実施を記録" labelStyle={styles.fieldLabel}>
                <View style={styles.trackRow}>
                  <Switch
                    value={trackCompletions}
                    onValueChange={setTrackCompletions}
                    {...contentSwitchProps(content, trackCompletions)}
                  />
                </View>
              </FormRow>
            <TaskFieldDivider />
            <FormRow label="ペース" labelStyle={styles.fieldLabel} style={styles.rowAlignStart}>
              <View style={styles.chipRow}>
                {(
                  [
                    { key: 'scheduled' as const, label: 'あり（周期あり）' },
                    { key: 'unpaced' as const, label: 'なし（記録のみ）' },
                  ] as const
                ).map((item) => (
                  <Pressable
                    key={item.key}
                    style={[
                      styles.chip,
                      contentSurfaceStyle(content),
                      { borderWidth: 1 },
                      pace === item.key ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => {
                      setPace(item.key);
                      if (item.key === 'unpaced') {
                        setRemindEnabled(false);
                      }
                    }}
                  >
                    <Text style={[styles.chipText, contentTextStyle(content)]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </FormRow>

            {groupSelect === GROUP_NONE && pace === 'scheduled' ? (
              <>
                <TaskFieldDivider />
                <TaskRemindFields
                  mode="time-only"
                  enabled={remindEnabled}
                  daysBefore={remindDaysBefore}
                  time={remindTime}
                  onEnabledChange={setRemindEnabled}
                  onDaysBeforeChange={setRemindDaysBefore}
                  onTimeChange={setRemindTime}
                />
              </>
            ) : null}

            {pace === 'scheduled' ? (
              <>
                <TaskFieldDivider />
                <FormRow label="周期" labelStyle={styles.fieldLabel} style={styles.rowAlignStart}>
                  <View style={styles.chipRow}>
                    {(
                      [
                        { key: 'day' as const, label: '毎日' },
                        { key: 'week' as const, label: '毎週' },
                        { key: 'month' as const, label: '毎月' },
                        { key: 'year' as const, label: '毎年' },
                      ] as const
                    ).map((item) => (
                      <Pressable
                        key={item.key}
                        style={[
                          styles.chip,
                          contentSurfaceStyle(content),
                          { borderWidth: 1 },
                          unit === item.key ? contentSelectedOptionStyle(content) : null,
                        ]}
                        onPress={() => setUnit(item.key)}
                      >
                        <Text style={[styles.chipText, contentTextStyle(content)]}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </FormRow>

                {unit === 'week' ? (
                  <>
                    <TaskFieldDivider />
                    <FormRow label="曜日" labelStyle={styles.fieldLabel} style={styles.rowAlignStart}>
                    <View style={styles.weekdayChipRow}>
                      <Pressable
                        style={[
                          styles.weekdayChip,
                          styles.weekdayChipAny,
                          contentSurfaceStyle(content),
                          { borderWidth: 1 },
                          weekdaysUnspecified ? contentSelectedOptionStyle(content) : null,
                        ]}
                        onPress={selectWeekdaysUnspecified}
                      >
                        <Text
                          style={[styles.weekdayChipText, contentTextStyle(content)]}
                          numberOfLines={1}
                        >
                          指定なし
                        </Text>
                      </Pressable>
                      {WEEKDAY_OPTIONS.map((day) => (
                        <Pressable
                          key={day.value}
                          style={[
                            styles.weekdayChip,
                            contentSurfaceStyle(content),
                            { borderWidth: 1 },
                            !weekdaysUnspecified && weekdays.includes(day.value)
                              ? contentSelectedOptionStyle(content)
                              : null,
                          ]}
                          onPress={() => toggleWeekday(day.value)}
                        >
                          <Text style={[styles.weekdayChipText, contentTextStyle(content)]}>{day.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    </FormRow>
                    {weekdaysUnspecified ? (
                      <>
                        <TaskFieldDivider />
                        <FormRow label="週の起点" labelStyle={styles.fieldLabel} style={styles.rowAlignStart}>
                        <View style={styles.weekdayChipRow}>
                          {WEEKDAY_OPTIONS.map((day) => (
                            <Pressable
                              key={`start-${day.value}`}
                              style={[
                                styles.weekdayChip,
                                contentSurfaceStyle(content),
                                { borderWidth: 1 },
                                weekStartsOn === day.value ? contentSelectedOptionStyle(content) : null,
                              ]}
                              onPress={() => setWeekStartsOn(day.value)}
                            >
                              <Text style={[styles.weekdayChipText, contentTextStyle(content)]}>
                                {day.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        </FormRow>
                      </>
                    ) : null}
                  </>
                ) : null}

                {unit === 'month' ? (
                  <>
                    <TaskFieldDivider />
                    <FormRow label="毎月" labelStyle={styles.fieldLabel} style={styles.rowAlignStart}>
                    <View style={styles.chipRow}>
                      <Pressable
                        style={[
                          styles.chip,
                          contentSurfaceStyle(content),
                          { borderWidth: 1 },
                          monthMode === 'day' ? contentSelectedOptionStyle(content) : null,
                        ]}
                        onPress={() => {
                          setMonthMode('day');
                          setShowMonthDayPicker(false);
                        }}
                      >
                        <Text style={[styles.chipText, contentTextStyle(content)]}>日付指定</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.chip,
                          contentSurfaceStyle(content),
                          { borderWidth: 1 },
                          monthMode === 'nth' ? contentSelectedOptionStyle(content) : null,
                        ]}
                        onPress={() => {
                          setMonthMode('nth');
                          setShowMonthDayPicker(false);
                        }}
                      >
                        <Text style={[styles.chipText, contentTextStyle(content)]}>第N曜日</Text>
                      </Pressable>
                    </View>
                    </FormRow>
                    {monthMode === 'day' ? (
                      <View style={styles.monthModeBody}>
                        <FormRow label="日" labelStyle={styles.fieldLabel}>
                          <Pressable
                            style={[styles.pickerButton, contentInputStyle(content)]}
                            onPress={() => {
                              dismissKeyboardFocus();
                              setShowMonthDayPicker(true);
                            }}
                          >
                            <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>
                              {monthDay}日
                            </Text>
                          </Pressable>
                        </FormRow>
                        {showMonthDayPicker ? (
                          <View style={styles.pickerWrap}>
                            <DayRollPicker day={monthDay} onChange={setMonthDay} />
                            <PickerDoneOverlay
                              style={contentTagStyle(content)}
                              textStyle={contentTextStyle(content)}
                              onPress={() => setShowMonthDayPicker(false)}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <>
                        <TaskFieldDivider />
                        <FormRow label="第N" labelStyle={styles.fieldLabel} style={styles.rowAlignStart}>
                        <View style={styles.chipRow}>
                          {MONTH_NTH_OPTIONS.map((item) => (
                            <Pressable
                              key={item.value}
                              style={[
                                styles.chip,
                                contentSurfaceStyle(content),
                                { borderWidth: 1 },
                                monthNths.includes(item.value) ? contentSelectedOptionStyle(content) : null,
                              ]}
                              onPress={() => toggleMonthNth(item.value)}
                            >
                              <Text style={[styles.chipText, contentTextStyle(content)]}>{item.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        </FormRow>
                        <TaskFieldDivider />
                        <FormRow label="曜日" labelStyle={styles.fieldLabel} style={styles.rowAlignStart}>
                        <View style={styles.chipRow}>
                          {WEEKDAY_OPTIONS.map((day) => (
                            <Pressable
                              key={`mw-${day.value}`}
                              style={[
                                styles.chip,
                                contentSurfaceStyle(content),
                                { borderWidth: 1 },
                                monthWeekdays.includes(day.value) ? contentSelectedOptionStyle(content) : null,
                              ]}
                              onPress={() => toggleMonthWeekday(day.value)}
                            >
                              <Text style={[styles.chipText, contentTextStyle(content)]}>{day.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        </FormRow>
                      </>
                    )}
                  </>
                ) : null}

                {unit === 'year' ? (
                  <>
                    <TaskFieldDivider />
                    <FormRow label="月日" labelStyle={styles.fieldLabel}>
                      <Pressable
                        style={[styles.pickerButton, contentInputStyle(content)]}
                        onPress={() => {
                          dismissKeyboardFocus();
                          setShowYearDatePicker(true);
                        }}
                      >
                        <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>
                          {`${String(yearMonth).padStart(2, '0')}-${String(yearDay).padStart(2, '0')}`}
                        </Text>
                      </Pressable>
                    </FormRow>
                    {showYearDatePicker ? (
                      <View style={styles.pickerWrap}>
                        <MonthDayRollPicker
                          month={yearMonth}
                          day={yearDay}
                          onChange={({ month, day }) => {
                            setYearMonth(month);
                            setYearDay(day);
                          }}
                        />
                        <PickerDoneOverlay
                          style={contentTagStyle(content)}
                          textStyle={contentTextStyle(content)}
                          onPress={() => setShowYearDatePicker(false)}
                        />
                      </View>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            <TaskFieldDivider />
              <FormRow label="期限" labelStyle={styles.fieldLabel}>
                <View style={styles.dueRow}>
                  <Pressable
                    style={[styles.dueDateButton, contentInputStyle(content)]}
                    onPress={() => {
                      dismissKeyboardFocus();
                      if (!dueDate) {
                        setDueDate(formatDateKey(new Date()));
                      }
                      setShowDuePicker(true);
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={
                        dueDate
                          ? [styles.dueDateButtonText, contentTextStyle(content)]
                          : [styles.dueDateButtonText, contentMutedTextStyle(content)]
                      }
                    >
                      {dueDate || 'yyyy-mm-dd'}
                    </Text>
                  </Pressable>
                  {DUE_QUICK_OPTIONS.map((option) => {
                    const key = dueDateKeyFromToday(option.days);
                    const selected = dueDate === key;
                    return (
                      <Pressable
                        key={option.label}
                        style={[
                          styles.dueQuickButton,
                          contentSurfaceStyle(content),
                          { borderColor: content.contentBorder },
                          selected ? contentSelectedOptionStyle(content) : null,
                        ]}
                        onPress={() => {
                          dismissKeyboardFocus();
                          setDueDate(key);
                          setShowDuePicker(false);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`期限を${option.label}にする`}
                      >
                        <Text
                          numberOfLines={1}
                          style={[styles.dueQuickButtonText, contentTextStyle(content)]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {dueDate ? (
                    <Pressable
                      style={[styles.clearDueButton, { borderColor: content.contentBorder }]}
                      onPress={() => {
                        setDueDate('');
                        setShowDuePicker(false);
                        setRemindEnabled(false);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="期限をクリア"
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={18} color={content.contentText} />
                    </Pressable>
                  ) : null}
                </View>
              </FormRow>
              {showDuePicker ? (
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    value={dueDate ? parseDateKey(dueDate) : new Date()}
                    mode="date"
                    display="spinner"
                    locale="ja-JP"
                    style={styles.picker}
                    {...dateTimePickerProps}
                    {...openRangeDatePickerBounds()}
                    onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                      if (!selected) {
                        return;
                      }
                      if (Platform.OS !== 'ios') {
                        setShowDuePicker(false);
                      }
                      setDueDate(formatDateKey(selected));
                    }}
                  />
                  <PickerDoneOverlay
                    style={contentTagStyle(content)}
                    textStyle={contentTextStyle(content)}
                    onPress={() => setShowDuePicker(false)}
                  />
                </View>
              ) : null}
            {dueDate ? (
              <>
                <TaskFieldDivider />
                <TaskRemindFields
                  mode="temporary"
                  enabled={remindEnabled}
                  daysBefore={remindDaysBefore}
                  time={remindTime}
                  onEnabledChange={setRemindEnabled}
                  onDaysBeforeChange={setRemindDaysBefore}
                  onTimeChange={setRemindTime}
                />
              </>
            ) : null}
            <TaskFieldDivider />
              <FormRow
                label="対象予定"
                labelStyle={styles.fieldLabel}
                style={styles.rowAlignStart}
              >
                <EpisodeEventLinkField
                  dateKey={dueDate}
                  mode={eventLinkMode}
                  linkedEventId={eventId.trim() || null}
                  onModeChange={handleEventLinkModeChange}
                  onSelectEvent={handleSelectLinkedEvent}
                  eventTimeScope="todayOrFuture"
                  fieldCorner={{ borderRadius: Radius.sm }}
                  compact
                  hints={{
                    create_new:
                      '保存時に、このタスクの期限・タイトルで予定を新しく作り、紐づけます。',
                    none: 'カレンダー予定には紐づけません。',
                  }}
                />
              </FormRow>
          </>
        )}

        {isEditing && kind === 'recurring' && trackCompletions ? (
          <>
            <TaskFieldDivider />
            <FormRow
              label="実施履歴"
              labelStyle={styles.fieldLabel}
              style={styles.rowAlignStart}
            >
              {completions.length === 0 ? (
                <Text style={[styles.hint, contentMutedTextStyle(content), styles.historyEmpty]}>
                  まだ記録がありません
                </Text>
              ) : (
                <View style={styles.historyList}>
                  {completions.map((item) => (
                    <View
                      key={item.id}
                      style={[styles.historyRow, contentSurfaceStyle(content), { borderWidth: 1 }]}
                    >
                      <Text style={[styles.historyDate, contentTextStyle(content)]}>
                        {formatCompletionHistoryDate(item.completedOn)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </FormRow>
          </>
        ) : null}

        <TaskFieldDivider />
        <FormRow label="メモ" layout="vertical">
          <NoteBlockEditor
            style={[styles.memoInput, contentInputStyle(content)]}
            value={memo}
            onChangeText={setMemo}
            placeholder="入力"
            placeholderTextColor={content.contentTextSecondary}
            accessibilityLabel="メモ"
            minHeight={86}
            uncapped
          />
        </FormRow>
        </FormScreenSection>

        {isEditing ? (
          <View style={styles.deleteButtonWrap}>
            <Pressable
              style={[styles.deleteButton, { borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.1)' }]}
              onPress={handleDelete}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="タスクを削除"
            >
              <Text style={styles.deleteText}>タスクを削除</Text>
            </Pressable>
          </View>
        ) : null}
      </FormScreenBody>
      </RollScrollLockProvider>

      <OptionPickerModal
        visible={groupPickerVisible}
        label="グループ"
        value={groupSelect}
        options={groupPickerOptions}
        clearLabel="なし"
        onValueChange={(value) => {
          setGroupSelect(value);
          if (value !== GROUP_NEW) {
            setNewGroupTitle('');
          }
        }}
        onClose={() => setGroupPickerVisible(false)}
      />
    </FormScreenTemplate>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
  },
  formSection: {
    gap: 0,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 8,
  },
  fieldLabel: {
    width: 72,
    textAlign: 'left',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kindField: {
    alignItems: 'flex-start',
  },
  kindSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: 2,
    gap: 2,
  },
  kindSegmentItem: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindSegmentText: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  kindSegmentLocked: {
    opacity: 0.7,
  },
  kindSegmentTextLocked: {
    opacity: 0.45,
  },
  monthModeBody: {
    marginTop: 12,
    gap: 8,
  },
  weekdayChipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 4,
  },
  weekdayChip: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayChipAny: {
    flex: 1.7,
  },
  weekdayChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  chipText: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    fontSize: 14,
    width: '100%',
  },
  memoInput: {
    minHeight: 86,
    textAlignVertical: 'top',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleInput: {
    flex: 1,
    minWidth: 0,
    width: undefined,
  },
  rowAlignStart: {
    alignItems: 'flex-start',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  dueDateButton: {
    width: 108,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dueDateButtonText: {
    fontSize: Typography.base,
    textAlign: 'center',
  },
  dueQuickButton: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dueQuickButtonText: {
    fontSize: Typography.base * 0.7,
    fontWeight: '600',
  },
  pickerButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  pickerButtonText: {
    flex: 1,
    fontSize: Typography.base,
  },
  pickerChevron: {
    fontSize: 10,
    marginLeft: 4,
  },
  trackRow: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  pickerPlaceholder: {
    fontSize: Typography.base,
  },
  clearDueButton: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerWrap: {
    marginTop: 8,
  },
  picker: {
    alignSelf: 'stretch',
  },
  historyEmpty: {
    marginTop: 0,
  },
  historyList: {
    gap: 6,
  },
  historyRow: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButtonWrap: {
    marginTop: 28,
    marginBottom: 32,
    alignItems: 'center',
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    minWidth: 120,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
  },
  saveText: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveTextBusy: {
    opacity: 0.55,
  },
});
