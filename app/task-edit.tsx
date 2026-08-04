import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import {
  FormScreenBody,
  FormScreenSection,
  FormScreenTemplate,
} from '@/components/screen-templates';
import { FormRow } from '@/components/ui/FormRow';
import { ViewportCappedMultilineTextInput } from '@/components/ui/ViewportCappedMultilineTextInput';
import { DayRollPicker, MonthDayRollPicker, RollScrollLockProvider, useRollScrollLock } from '@/components/ui/RollSelect';
import {
  createTask,
  createTaskGroup,
  deleteAllTaskCompletions,
  deleteTask,
  getAllEvents,
  getAllTaskGroups,
  getEvent,
  getRecurringTasksByGroupId,
  getTask,
  getTaskCompletionCount,
  getTaskCompletions,
  initializeDatabase,
  updateTask,
} from '../db';
import {
  Event,
  TASK_GROUP_MEMBER_LIMIT,
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
import { formatDateKey, getAllDayDateKeysFromEvent, parseDateKey } from '@/utils/eventHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentDateTimePickerProps,
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';

const GROUP_NONE = '';
const GROUP_NEW = '__new__';

function eventStartDateKey(event: Event): string {
  if (event.allDay) {
    return getAllDayDateKeysFromEvent(event).startDateKey;
  }
  return formatDateKey(new Date(event.startAt));
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
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const [formScrollEnabled, setRollScrolling] = useRollScrollLock();
  const params = useLocalSearchParams<{
    taskId?: string;
    eventId?: string;
    kind?: string;
    groupId?: string;
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
  /** 予定起点: 臨時固定・種類選択を出さない */
  const [lockedToEvent, setLockedToEvent] = useState(Boolean(presetEventId));

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
  const [eventId, setEventId] = useState(presetEventId);
  const [events, setEvents] = useState<Event[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [groupSelect, setGroupSelect] = useState(GROUP_NONE);
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [trackCompletions, setTrackCompletions] = useState(true);
  const [initialTrackCompletions, setInitialTrackCompletions] = useState(true);
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      initializeDatabase();
      setEvents(getAllEvents());
      setTaskGroups(getAllTaskGroups());
      if (taskId) {
        const task = getTask(taskId);
        if (!task) {
          Alert.alert('エラー', 'タスクが見つかりません');
          router.back();
          return;
        }
        setKind(task.kind);
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
        setLockedToEvent(Boolean(task.eventId));
        setGroupSelect(task.groupId ?? GROUP_NONE);
        setNewGroupTitle('');
        setTrackCompletions(task.trackCompletions);
        setInitialTrackCompletions(task.trackCompletions);
        setCompletions(task.kind === 'recurring' ? getTaskCompletions(taskId) : []);
      } else if (presetEventId) {
        setKind('temporary');
        setEventId(presetEventId);
        setLockedToEvent(true);
        const event = getEvent(presetEventId);
        setDueDate(event ? eventStartDateKey(event) : '');
        setGroupSelect(GROUP_NONE);
        setNewGroupTitle('');
        setCompletions([]);
      } else {
        setLockedToEvent(false);
        setKind(presetKind ?? 'temporary');
        setGroupSelect(presetGroupId || GROUP_NONE);
        setNewGroupTitle('');
        setCompletions([]);
      }
      setReady(true);
    }, [presetEventId, presetGroupId, presetKind, router, taskId])
  );

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

  const persistTask = (nextTrack: boolean) => {
    const trimmed = title.trim();
    const effectiveKind: TaskKind = lockedToEvent ? 'temporary' : kind;

    initializeDatabase();

    let resolvedGroupId: string | null = null;
    if (effectiveKind === 'recurring') {
      if (groupSelect === GROUP_NEW) {
        const groupTitle = newGroupTitle.trim();
        if (!groupTitle) {
          Alert.alert('入力エラー', '新しいグループ名を入力してください');
          return;
        }
        const createdGroup = createTaskGroup({ title: groupTitle });
        if (!createdGroup) {
          Alert.alert('エラー', 'グループの作成に失敗しました');
          return;
        }
        resolvedGroupId = createdGroup.id;
      } else if (groupSelect) {
        resolvedGroupId = groupSelect;
      }
    }

    if (resolvedGroupId && (!isEditing || getTask(taskId)?.groupId !== resolvedGroupId)) {
      const existing = getRecurringTasksByGroupId(resolvedGroupId);
      const count = isEditing
        ? existing.filter((item) => item.id !== taskId).length
        : existing.length;
      if (count >= TASK_GROUP_MEMBER_LIMIT) {
        Alert.alert('グループ上限', `1つのグループに入れられるタスクは${TASK_GROUP_MEMBER_LIMIT}個までです。`);
        return;
      }
    }

    const input: TaskInput = {
      kind: effectiveKind,
      title: trimmed,
      memo,
      pace: effectiveKind === 'recurring' ? pace : null,
      recurrenceUnit: effectiveKind === 'recurring' && pace === 'scheduled' ? unit : null,
      recurrenceConfig: effectiveKind === 'recurring' && pace === 'scheduled' ? buildConfig() : null,
      dueDate: effectiveKind === 'temporary' ? dueDate.trim() || null : null,
      eventId: effectiveKind === 'temporary' ? eventId.trim() || null : null,
      groupId: resolvedGroupId,
      trackCompletions: effectiveKind === 'recurring' ? nextTrack : true,
    };

    if (isEditing && initialTrackCompletions && !nextTrack && effectiveKind === 'recurring') {
      deleteAllTaskCompletions(taskId);
    }

    if (isEditing) {
      const ok = updateTask(taskId, input);
      if (!ok) {
        Alert.alert('エラー', '保存に失敗しました');
        return;
      }
    } else {
      const created = createTask(input);
      if (!created) {
        Alert.alert('エラー', '作成に失敗しました');
        return;
      }
    }
    router.back();
  };

  const handleSave = () => {
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
      Alert.alert(
        '実施記録をやめる',
        `これまでの実施履歴（${historyCount}件）がすべて削除されます。この操作は取り消せません。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '次へ',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                '本当に履歴を消しますか？',
                '連続記録・過去の実施日もすべて消えます。',
                [
                  { text: 'キャンセル', style: 'cancel' },
                  {
                    text: '理解した',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert(
                        '最終確認',
                        '実施記録をオフにして、履歴を完全に削除します。',
                        [
                          { text: 'キャンセル', style: 'cancel' },
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

    persistTask(trackCompletions);
  };

  const confirmDeleteFinally = () => {
    deleteTask(taskId);
    router.back();
  };

  const handleDelete = () => {
    if (!isEditing) return;
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

  const groupPickerOptions = useMemo(
    () => [
      ...taskGroups.map((group) => ({ label: group.title, value: group.id })),
      { label: '新しいグループ…', value: GROUP_NEW },
    ],
    [taskGroups]
  );

  const groupSelectLabel = useMemo(() => {
    if (groupSelect === GROUP_NEW) return '新しいグループ…';
    if (!groupSelect) return 'なし';
    return taskGroups.find((group) => group.id === groupSelect)?.title ?? 'なし';
  }, [groupSelect, taskGroups]);

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
    return null;
  }

  return (
    <FormScreenTemplate
      title={isEditing ? 'タスク編集' : 'タスク追加'}
      onBack={() => router.back()}
      scrollEnabled={formScrollEnabled}
      right={
        <Pressable onPress={handleSave} hitSlop={8}>
          <Text style={[styles.saveText, contentTextStyle(content)]}>保存</Text>
        </Pressable>
      }
    >
      <RollScrollLockProvider setRollScrolling={setRollScrolling}>
      <FormScreenBody>
        {!lockedToEvent ? (
          <FormScreenSection>
            <FormRow label="タスク種別" contentLayout="action" labelWidth={96}>
              <View
                style={[
                  styles.kindSegment,
                  contentSurfaceStyle(content),
                  { borderColor: content.contentBorder },
                ]}
              >
                {(
                  [
                    { key: 'recurring' as const, label: '定期' },
                    { key: 'temporary' as const, label: '臨時' },
                  ] as const
                ).map((item) => {
                  const selected = kind === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      style={[
                        styles.kindSegmentItem,
                        selected
                          ? {
                              backgroundColor: content.contentText,
                            }
                          : null,
                      ]}
                      onPress={() => setKind(item.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={item.label}
                    >
                      <Text
                        style={[
                          styles.kindSegmentText,
                          {
                            color: selected ? content.contentCard : content.contentTextSecondary,
                            fontWeight: selected ? '700' : '600',
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormRow>
          </FormScreenSection>
        ) : null}

        <FormScreenSection>
          <FormRow label="タイトル">
            <TextInput
              style={[styles.input, contentInputStyle(content)]}
              value={title}
              onChangeText={setTitle}
              placeholder="タスク内容"
              placeholderTextColor={content.contentTextSecondary}
            />
          </FormRow>
          <FormRow label="メモ" style={styles.memoRow}>
            <ViewportCappedMultilineTextInput
              style={[styles.input, styles.memoInput, contentInputStyle(content)]}
              value={memo}
              onChangeText={setMemo}
              placeholder="メモ（任意）"
              placeholderTextColor={content.contentTextSecondary}
              minHeight={88}
            />
          </FormRow>
        </FormScreenSection>

        {kind === 'recurring' ? (
          <>
            <FormScreenSection>
              <FormRow label="グループ">
                <Pressable
                  style={[styles.pickerButton, contentInputStyle(content)]}
                  onPress={() => setGroupPickerVisible(true)}
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
                <FormRow label="グループ名">
                  <TextInput
                    style={[styles.input, contentInputStyle(content)]}
                    value={newGroupTitle}
                    onChangeText={setNewGroupTitle}
                    placeholder="例: 筋トレ"
                    placeholderTextColor={content.contentTextSecondary}
                  />
                </FormRow>
              ) : null}
              <Text style={[styles.hint, contentMutedTextStyle(content)]}>
                くくり用です。中のどれかを実行するとグループもその日「実施」になります
              </Text>
            </FormScreenSection>

            <FormScreenSection>
              <FormRow label="実施を記録">
                <View style={styles.trackRow}>
                  <Switch
                    value={trackCompletions}
                    onValueChange={setTrackCompletions}
                    trackColor={{ false: content.contentBorder, true: content.contentText }}
                    thumbColor="#ffffff"
                  />
                </View>
              </FormRow>
              <Text style={[styles.hint, contentMutedTextStyle(content)]}>
                オフにすると連続・ドット・履歴を残しません。チェックは今日の見た目だけ変わります。
              </Text>
            </FormScreenSection>

            <FormScreenSection>
              <Text style={[styles.label, contentTextStyle(content)]}>ペース</Text>
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
                    onPress={() => setPace(item.key)}
                  >
                    <Text style={contentTextStyle(content)}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              {pace === 'unpaced' ? (
                <Text style={[styles.hint, contentMutedTextStyle(content)]}>
                  やった日だけ記録します（1日1回まで）。
                </Text>
              ) : null}
            </FormScreenSection>

            {pace === 'scheduled' ? (
              <>
                <FormScreenSection>
                  <Text style={[styles.label, contentTextStyle(content)]}>周期単位</Text>
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
                        <Text style={contentTextStyle(content)}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.hint, contentMutedTextStyle(content)]}>プレビュー: {previewLabel}</Text>
                </FormScreenSection>

                {unit === 'week' ? (
                  <FormScreenSection>
                    <Text style={[styles.label, contentTextStyle(content)]}>曜日（必須）</Text>
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
                    {weekdaysUnspecified ? (
                      <>
                        <Text style={[styles.label, contentTextStyle(content)]}>週の起点</Text>
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
                      </>
                    ) : null}
                  </FormScreenSection>
                ) : null}

                {unit === 'month' ? (
                  <FormScreenSection>
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
                        <Text style={contentTextStyle(content)}>日付指定</Text>
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
                        <Text style={contentTextStyle(content)}>第N曜日</Text>
                      </Pressable>
                    </View>
                    {monthMode === 'day' ? (
                      <View style={styles.monthModeBody}>
                        <FormRow label="日">
                          <Pressable
                            style={[styles.pickerButton, contentInputStyle(content)]}
                            onPress={() => setShowMonthDayPicker(true)}
                          >
                            <Text style={[styles.pickerButtonText, contentTextStyle(content)]}>
                              {monthDay}日
                            </Text>
                          </Pressable>
                        </FormRow>
                        {showMonthDayPicker ? (
                          <View style={styles.pickerWrap}>
                            <DayRollPicker day={monthDay} onChange={setMonthDay} />
                            <Pressable
                              style={[styles.pickerDoneButton, contentTagStyle(content)]}
                              onPress={() => setShowMonthDayPicker(false)}
                            >
                              <Text style={[styles.pickerDoneText, contentTextStyle(content)]}>完了</Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <>
                        <Text style={[styles.label, contentTextStyle(content)]}>第N（複数可）</Text>
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
                              <Text style={contentTextStyle(content)}>{item.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={[styles.label, contentTextStyle(content)]}>曜日（複数可）</Text>
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
                              <Text style={contentTextStyle(content)}>{day.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    )}
                  </FormScreenSection>
                ) : null}

                {unit === 'year' ? (
                  <FormScreenSection>
                    <FormRow label="月日">
                      <Pressable
                        style={[styles.pickerButton, contentInputStyle(content)]}
                        onPress={() => setShowYearDatePicker(true)}
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
                        <Pressable
                          style={[styles.pickerDoneButton, contentTagStyle(content)]}
                          onPress={() => setShowYearDatePicker(false)}
                        >
                          <Text style={[styles.pickerDoneText, contentTextStyle(content)]}>完了</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </FormScreenSection>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            <FormScreenSection>
              <FormRow label="期限">
                <View style={styles.dueRow}>
                  <Pressable
                    style={[styles.pickerButton, contentInputStyle(content)]}
                    onPress={() => setShowDuePicker(true)}
                  >
                    <Text
                      style={
                        dueDate
                          ? [styles.pickerButtonText, contentTextStyle(content)]
                          : [styles.pickerPlaceholder, contentMutedTextStyle(content)]
                      }
                    >
                      {dueDate || 'yyyy-mm-dd'}
                    </Text>
                  </Pressable>
                  {dueDate ? (
                    <Pressable
                      style={[styles.clearDueButton, contentTagStyle(content)]}
                      onPress={() => {
                        setDueDate('');
                        setShowDuePicker(false);
                      }}
                    >
                      <Text style={contentTextStyle(content)}>クリア</Text>
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
                  <Pressable
                    style={[styles.pickerDoneButton, contentTagStyle(content)]}
                    onPress={() => setShowDuePicker(false)}
                  >
                    <Text style={[styles.pickerDoneText, contentTextStyle(content)]}>完了</Text>
                  </Pressable>
                </View>
              ) : null}
            </FormScreenSection>
            <FormScreenSection>
              <Text style={[styles.label, contentTextStyle(content)]}>
                {lockedToEvent ? '紐づく予定' : '予定に紐づけ（任意）'}
              </Text>
              {lockedToEvent ? (
                <Text style={[styles.hint, contentTextStyle(content)]}>
                  {events.find((event) => event.id === eventId)?.title || '予定'}
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable
                    style={[
                      styles.chip,
                      contentSurfaceStyle(content),
                      { borderWidth: 1 },
                      !eventId ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => setEventId('')}
                  >
                    <Text style={contentTextStyle(content)}>なし</Text>
                  </Pressable>
                  {events.map((event) => (
                    <Pressable
                      key={event.id}
                      style={[
                        styles.chip,
                        contentSurfaceStyle(content),
                        { borderWidth: 1 },
                        eventId === event.id ? contentSelectedOptionStyle(content) : null,
                      ]}
                      onPress={() => {
                        setEventId(event.id);
                        setDueDate(eventStartDateKey(event));
                      }}
                    >
                      <Text style={contentTextStyle(content)} numberOfLines={1}>
                        {event.title || '無題'}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </FormScreenSection>
          </>
        )}

        {isEditing && kind === 'recurring' && trackCompletions ? (
          <FormScreenSection>
            <Text style={[styles.label, contentTextStyle(content)]}>
              実施履歴{completions.length > 0 ? `（${completions.length}回）` : ''}
            </Text>
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
          </FormScreenSection>
        ) : null}

        {isEditing ? (
          <View style={styles.deleteButtonWrap}>
            <Pressable
              style={[styles.deleteButton, { borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.1)' }]}
              onPress={handleDelete}
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
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
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
  kindSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  kindSegmentItem: {
    minWidth: 56,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindSegmentText: {
    fontSize: 13,
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
    paddingVertical: 8,
    borderRadius: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  },
  memoInput: {
    minHeight: 88,
  },
  memoRow: {
    marginTop: 12,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pickerButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  pickerChevron: {
    fontSize: 10,
    marginLeft: 4,
  },
  trackRow: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: 44,
  },
  pickerPlaceholder: {
    fontSize: 15,
  },
  clearDueButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pickerWrap: {
    marginTop: 8,
    gap: 8,
  },
  picker: {
    alignSelf: 'stretch',
  },
  pickerDoneButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  pickerDoneText: {
    fontWeight: '700',
    fontSize: 13,
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
    fontSize: 15,
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
  saveText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
