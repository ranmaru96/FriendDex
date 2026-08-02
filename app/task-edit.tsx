import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  FormScreenBody,
  FormScreenSection,
  FormScreenTemplate,
} from '@/components/screen-templates';
import { FormRow } from '@/components/ui/FormRow';
import {
  createTask,
  deleteTask,
  getAllEvents,
  getEvent,
  getTask,
  initializeDatabase,
  updateTask,
} from '../db';
import { Event, TaskInput, TaskKind, TaskPace, TaskRecurrenceUnit } from '../types';
import {
  TaskRecurrenceConfig,
  WEEKDAY_OPTIONS,
  formatRecurrenceLabel,
} from '@/utils/taskHelpers';
import { formatDateKey, getAllDayDateKeysFromEvent } from '@/utils/eventHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

function eventStartDateKey(event: Event): string {
  if (event.allDay) {
    return getAllDayDateKeysFromEvent(event).startDateKey;
  }
  return formatDateKey(new Date(event.startAt));
}

export default function TaskEditScreen() {
  const router = useRouter();
  const content = useContentColors();
  const params = useLocalSearchParams<{ taskId?: string; eventId?: string; kind?: string }>();
  const taskId = typeof params.taskId === 'string' ? params.taskId : '';
  const presetEventId = typeof params.eventId === 'string' ? params.eventId : '';
  const presetKind: TaskKind | null =
    params.kind === 'recurring' || params.kind === 'temporary' ? params.kind : null;
  const isEditing = Boolean(taskId);
  /** 予定起点: 臨時固定・種類選択を出さない */
  const [lockedToEvent, setLockedToEvent] = useState(Boolean(presetEventId));

  const [kind, setKind] = useState<TaskKind>(presetKind ?? 'temporary');
  const [title, setTitle] = useState('');
  const [pace, setPace] = useState<TaskPace>('scheduled');
  const [unit, setUnit] = useState<TaskRecurrenceUnit>('day');
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [weekStartsOn, setWeekStartsOn] = useState(1);
  const [monthDay, setMonthDay] = useState('1');
  const [monthMode, setMonthMode] = useState<'day' | 'nth'>('day');
  const [monthNth, setMonthNth] = useState(1);
  const [monthWeekday, setMonthWeekday] = useState(1);
  const [yearMonth, setYearMonth] = useState('1');
  const [yearDay, setYearDay] = useState('1');
  const [dueDate, setDueDate] = useState('');
  const [eventId, setEventId] = useState(presetEventId);
  const [events, setEvents] = useState<Event[]>([]);
  const [ready, setReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      initializeDatabase();
      setEvents(getAllEvents());
      if (taskId) {
        const task = getTask(taskId);
        if (!task) {
          Alert.alert('エラー', 'タスクが見つかりません');
          router.back();
          return;
        }
        setKind(task.kind);
        setTitle(task.title);
        setPace(task.pace ?? 'unpaced');
        setUnit(task.recurrenceUnit ?? 'day');
        const config = task.recurrenceConfig ?? {};
        setWeekdays(config.weekdays?.length ? config.weekdays : [1]);
        setWeekStartsOn(config.weekStartsOn ?? 1);
        if (config.monthDay != null) {
          setMonthMode('day');
          setMonthDay(String(config.monthDay));
        } else if (config.monthNth != null) {
          setMonthMode('nth');
          setMonthNth(config.monthNth);
          setMonthWeekday(config.monthWeekday ?? 1);
        }
        if (config.yearMonth != null) setYearMonth(String(config.yearMonth));
        if (config.yearDay != null) setYearDay(String(config.yearDay));
        setDueDate(task.dueDate ?? '');
        setEventId(task.eventId ?? '');
        setLockedToEvent(Boolean(task.eventId));
      } else if (presetEventId) {
        setKind('temporary');
        setEventId(presetEventId);
        setLockedToEvent(true);
        const event = getEvent(presetEventId);
        setDueDate(event ? eventStartDateKey(event) : '');
      } else {
        setLockedToEvent(false);
        setKind(presetKind ?? 'temporary');
      }
      setReady(true);
    }, [presetEventId, presetKind, router, taskId])
  );

  const buildConfig = (): TaskRecurrenceConfig => {
    if (unit === 'week') {
      return { weekdays: weekdays.slice().sort((a, b) => a - b), weekStartsOn };
    }
    if (unit === 'month') {
      if (monthMode === 'nth') {
        return { monthNth, monthWeekday, weekStartsOn };
      }
      return { monthDay: Math.min(31, Math.max(1, Number(monthDay) || 1)), weekStartsOn };
    }
    if (unit === 'year') {
      return {
        yearMonth: Math.min(12, Math.max(1, Number(yearMonth) || 1)),
        yearDay: Math.min(31, Math.max(1, Number(yearDay) || 1)),
        weekStartsOn,
      };
    }
    return { weekStartsOn };
  };

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('入力エラー', 'タイトルを入力してください');
      return;
    }
    const effectiveKind: TaskKind = lockedToEvent ? 'temporary' : kind;
    if (effectiveKind === 'recurring' && pace === 'scheduled' && unit === 'week' && weekdays.length === 0) {
      Alert.alert('入力エラー', '曜日を1つ以上選んでください');
      return;
    }

    const input: TaskInput = {
      kind: effectiveKind,
      title: trimmed,
      pace: effectiveKind === 'recurring' ? pace : null,
      recurrenceUnit: effectiveKind === 'recurring' && pace === 'scheduled' ? unit : null,
      recurrenceConfig: effectiveKind === 'recurring' && pace === 'scheduled' ? buildConfig() : null,
      dueDate: effectiveKind === 'temporary' ? dueDate.trim() || null : null,
      eventId: effectiveKind === 'temporary' ? eventId.trim() || null : null,
    };

    initializeDatabase();
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

  const handleDelete = () => {
    if (!isEditing) return;
    Alert.alert('タスクを削除', 'このタスクを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          deleteTask(taskId);
          router.back();
        },
      },
    ]);
  };

  const previewLabel = useMemo(() => {
    if (kind !== 'recurring') return '';
    return formatRecurrenceLabel(pace, pace === 'scheduled' ? unit : null, buildConfig());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, pace, unit, weekdays, weekStartsOn, monthDay, monthMode, monthNth, monthWeekday, yearMonth, yearDay]);

  const toggleWeekday = (value: number) => {
    setWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b)
    );
  };

  if (!ready) {
    return null;
  }

  return (
    <FormScreenTemplate
      title={isEditing ? 'タスク編集' : 'タスク追加'}
      onBack={() => router.back()}
      right={
        <Pressable onPress={handleSave} hitSlop={8}>
          <Text style={[styles.saveText, contentTextStyle(content)]}>保存</Text>
        </Pressable>
      }
    >
      <FormScreenBody>
        {!lockedToEvent ? (
          <FormScreenSection>
            <Text style={[styles.label, contentTextStyle(content)]}>種類</Text>
            <View style={styles.chipRow}>
              {(
                [
                  { key: 'recurring' as const, label: '定期' },
                  { key: 'temporary' as const, label: '臨時' },
                ] as const
              ).map((item) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.chip,
                    contentSurfaceStyle(content),
                    { borderWidth: 1 },
                    kind === item.key ? contentSelectedOptionStyle(content) : null,
                  ]}
                  onPress={() => setKind(item.key)}
                >
                  <Text style={contentTextStyle(content)}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
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
        </FormScreenSection>

        {kind === 'recurring' ? (
          <>
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
                    <Text style={[styles.label, contentTextStyle(content)]}>曜日（複数可）</Text>
                    <View style={styles.chipRow}>
                      {WEEKDAY_OPTIONS.map((day) => (
                        <Pressable
                          key={day.value}
                          style={[
                            styles.chip,
                            contentSurfaceStyle(content),
                            { borderWidth: 1 },
                            weekdays.includes(day.value) ? contentSelectedOptionStyle(content) : null,
                          ]}
                          onPress={() => toggleWeekday(day.value)}
                        >
                          <Text style={contentTextStyle(content)}>{day.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={[styles.label, contentTextStyle(content)]}>週の起点</Text>
                    <View style={styles.chipRow}>
                      {WEEKDAY_OPTIONS.map((day) => (
                        <Pressable
                          key={`start-${day.value}`}
                          style={[
                            styles.chip,
                            contentSurfaceStyle(content),
                            { borderWidth: 1 },
                            weekStartsOn === day.value ? contentSelectedOptionStyle(content) : null,
                          ]}
                          onPress={() => setWeekStartsOn(day.value)}
                        >
                          <Text style={contentTextStyle(content)}>{day.label}</Text>
                        </Pressable>
                      ))}
                    </View>
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
                        onPress={() => setMonthMode('day')}
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
                        onPress={() => setMonthMode('nth')}
                      >
                        <Text style={contentTextStyle(content)}>第N曜日</Text>
                      </Pressable>
                    </View>
                    {monthMode === 'day' ? (
                      <FormRow label="日">
                        <TextInput
                          style={[styles.input, contentInputStyle(content)]}
                          value={monthDay}
                          onChangeText={setMonthDay}
                          keyboardType="number-pad"
                        />
                      </FormRow>
                    ) : (
                      <>
                        <View style={styles.chipRow}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Pressable
                              key={n}
                              style={[
                                styles.chip,
                                contentSurfaceStyle(content),
                                { borderWidth: 1 },
                                monthNth === n ? contentSelectedOptionStyle(content) : null,
                              ]}
                              onPress={() => setMonthNth(n)}
                            >
                              <Text style={contentTextStyle(content)}>{n === 5 ? '最終' : `第${n}`}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <View style={styles.chipRow}>
                          {WEEKDAY_OPTIONS.map((day) => (
                            <Pressable
                              key={`mw-${day.value}`}
                              style={[
                                styles.chip,
                                contentSurfaceStyle(content),
                                { borderWidth: 1 },
                                monthWeekday === day.value ? contentSelectedOptionStyle(content) : null,
                              ]}
                              onPress={() => setMonthWeekday(day.value)}
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
                    <FormRow label="月">
                      <TextInput
                        style={[styles.input, contentInputStyle(content)]}
                        value={yearMonth}
                        onChangeText={setYearMonth}
                        keyboardType="number-pad"
                      />
                    </FormRow>
                    <FormRow label="日">
                      <TextInput
                        style={[styles.input, contentInputStyle(content)]}
                        value={yearDay}
                        onChangeText={setYearDay}
                        keyboardType="number-pad"
                      />
                    </FormRow>
                  </FormScreenSection>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            <FormScreenSection>
              <FormRow label="期限 (YYYY-MM-DD)">
                <TextInput
                  style={[styles.input, contentInputStyle(content)]}
                  value={dueDate}
                  onChangeText={setDueDate}
                  placeholder="空欄で期限なし"
                  placeholderTextColor={content.contentTextSecondary}
                  autoCapitalize="none"
                />
              </FormRow>
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

        {isEditing ? (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteText}>タスクを削除</Text>
          </Pressable>
        ) : null}
      </FormScreenBody>
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
  deleteButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteText: {
    color: '#dc2626',
    fontWeight: '700',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
