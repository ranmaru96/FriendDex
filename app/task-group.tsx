import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  FormScreenBody,
  FormScreenSection,
  FormScreenTemplate,
} from '@/components/screen-templates';
import {
  completeTemporaryTask,
  deleteTask,
  deleteTaskGroup,
  getTaskGroup,
  getTasksByGroupId,
  getTasksCompletionDatesUnion,
  initializeDatabase,
  isRecurringDoneOn,
  reopenTemporaryTask,
  setRecurringDoneOn,
  updateTaskGroup,
} from '../db';
import type { Task, TaskGroup, TaskPace, TaskRecurrenceConfig, TaskRecurrenceUnit } from '../types';
import { TASK_GROUP_MEMBER_LIMIT } from '../types';
import {
  WEEKDAY_OPTIONS,
  formatRecurrenceLabel,
  formatTaskDueDateLabel,
  isRecurringDueOnDate,
  toYmd,
} from '@/utils/taskHelpers';
import {
  countGroupDueProgress,
  formatGroupActivityLabel,
  formatGroupListMeta,
  groupTracksCompletions,
  trackingMembers,
} from '@/utils/taskGroupHelpers';
import { TaskRemindFields } from '@/components/task/TaskRemindFields';
import { requestNotificationPermissionOnFirstCreate } from '@/utils/eventNotifications';
import { DEFAULT_REMIND_TIME, clampRemindTimeToNow, syncTaskReminders } from '@/utils/taskNotifications';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { Radius } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { taskCompletionFillColor } from '@/components/task/TaskRecentSevenDayDots';

function formatHistoryDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((part) => Number(part));
  if (!y || !m || !d) {
    return ymd;
  }
  return `${y}/${m}/${d}`;
}

export default function TaskGroupScreen() {
  const router = useRouter();
  const content = useContentColors();
  const isBlack = useAppThemeOptional()?.variant === 'black';
  const checkedColor = taskCompletionFillColor(Boolean(isBlack));
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = typeof params.groupId === 'string' ? params.groupId : '';
  const [group, setGroup] = useState<TaskGroup | null>(null);
  const [members, setMembers] = useState<Task[]>([]);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [pace, setPace] = useState<TaskPace>('unpaced');
  const [unit, setUnit] = useState<TaskRecurrenceUnit>('day');
  const [weekdaysUnspecified, setWeekdaysUnspecified] = useState(true);
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [monthDay, setMonthDay] = useState(1);
  const [yearMonth, setYearMonth] = useState(1);
  const [yearDay, setYearDay] = useState(1);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [tick, setTick] = useState(0);
  const todayYmd = toYmd(new Date());

  const applyGroupSchedule = (loaded: TaskGroup) => {
    const nextPace = loaded.pace === 'scheduled' ? 'scheduled' : 'unpaced';
    setPace(nextPace);
    setUnit(loaded.recurrenceUnit ?? 'day');
    const config = loaded.recurrenceConfig ?? {};
    if (loaded.recurrenceUnit === 'week') {
      const hasDays = Boolean(config.weekdays?.length);
      setWeekdaysUnspecified(!hasDays);
      setWeekdays(hasDays ? config.weekdays! : [1]);
    } else {
      setWeekdaysUnspecified(true);
      setWeekdays([1]);
    }
    setMonthDay(config.monthDay ?? 1);
    setYearMonth(config.yearMonth ?? 1);
    setYearDay(config.yearDay ?? 1);
  };

  const buildScheduleConfig = (): TaskRecurrenceConfig => {
    if (unit === 'week') {
      if (weekdaysUnspecified) {
        return { weekdays: [] };
      }
      return { weekdays: weekdays.slice().sort((a, b) => a - b) };
    }
    if (unit === 'month') {
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

  const formatSavedScheduleLabel = (target: TaskGroup): string => {
    if (target.pace !== 'scheduled') {
      return 'なし（メンバーの必須日のみ）';
    }
    const label = formatRecurrenceLabel(
      target.pace,
      target.recurrenceUnit,
      target.recurrenceConfig
    );
    return label || '周期あり';
  };

  const reload = useCallback(() => {
    initializeDatabase();
    if (!groupId) {
      setGroup(null);
      setMembers([]);
      return;
    }
    const loaded = getTaskGroup(groupId);
    if (!loaded) {
      Alert.alert('エラー', 'グループが見つかりません', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return;
    }
    setGroup(loaded);
    setTitleDraft(loaded.title);
    applyGroupSchedule(loaded);
    setEditingSchedule(false);
    setMembers(getTasksByGroupId(groupId, loaded.kind));
    setTick((n) => n + 1);
  }, [groupId, router]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const recurringMembers = useMemo(
    () => members.filter((task) => task.kind === 'recurring'),
    [members]
  );
  const temporaryMembers = useMemo(
    () => members.filter((task) => task.kind === 'temporary'),
    [members]
  );

  const completionDates = useMemo(() => {
    void tick;
    return getTasksCompletionDatesUnion(trackingMembers(recurringMembers).map((task) => task.id));
  }, [recurringMembers, tick]);

  const historyDates = useMemo(() => {
    return Array.from(completionDates).sort((a, b) => (a < b ? 1 : -1));
  }, [completionDates]);

  const tracks = useMemo(() => groupTracksCompletions(recurringMembers), [recurringMembers]);

  const activityLabel = useMemo(
    () => (tracks ? formatGroupActivityLabel(completionDates, new Date()) : ''),
    [completionDates, tracks]
  );

  const progress = useMemo(
    () => countGroupDueProgress(recurringMembers, new Date(), isRecurringDoneOn),
    [recurringMembers, tick]
  );

  const summaryMeta = useMemo(
    () => formatGroupListMeta(completionDates, progress, new Date()),
    [completionDates, progress]
  );

  const scheduleDraftPreview = useMemo(() => {
    if (pace !== 'scheduled') {
      return 'なし（メンバーの必須日のみ）';
    }
    return formatRecurrenceLabel(pace, unit, buildScheduleConfig()) || '周期あり';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pace, unit, weekdaysUnspecified, weekdays, monthDay, yearMonth, yearDay]);

  const savedScheduleLabel = useMemo(
    () => (group ? formatSavedScheduleLabel(group) : ''),
    [group]
  );

  const persistGroupRemind = (enabled: boolean, time: string) => {
    if (!group || group.kind !== 'recurring') return;
    updateTaskGroup(group.id, {
      title: group.title,
      kind: group.kind,
      pace: group.pace,
      recurrenceUnit: group.recurrenceUnit,
      recurrenceConfig: group.recurrenceConfig,
      remindEnabled: enabled,
      remindTime: enabled ? clampRemindTimeToNow(time || DEFAULT_REMIND_TIME) : null,
    });
    const loaded = getTaskGroup(group.id);
    if (loaded) {
      setGroup(loaded);
    }
    void (async () => {
      if (enabled) {
        await requestNotificationPermissionOnFirstCreate();
      }
      await syncTaskReminders();
    })();
  };

  const saveTitle = () => {
    if (!group) return;
    const title = titleDraft.trim();
    if (!title) {
      Alert.alert('入力エラー', 'グループ名を入力してください');
      setTitleDraft(group.title);
      setEditingTitle(false);
      return;
    }
    updateTaskGroup(group.id, {
      title,
      kind: group.kind,
      pace: group.pace,
      recurrenceUnit: group.recurrenceUnit,
      recurrenceConfig: group.recurrenceConfig,
    });
    setEditingTitle(false);
    void syncTaskReminders();
    reload();
  };

  const beginEditSchedule = () => {
    if (!group) return;
    applyGroupSchedule(group);
    setEditingSchedule(true);
  };

  const cancelEditSchedule = () => {
    if (group) {
      applyGroupSchedule(group);
    }
    setEditingSchedule(false);
  };

  const saveSchedule = () => {
    if (!group || group.kind !== 'recurring') return;
    const ok = updateTaskGroup(group.id, {
      title: group.title,
      kind: group.kind,
      pace,
      recurrenceUnit: pace === 'scheduled' ? unit : null,
      recurrenceConfig: pace === 'scheduled' ? buildScheduleConfig() : null,
    });
    if (!ok) {
      Alert.alert('エラー', '周期の保存に失敗しました');
      return;
    }
    setEditingSchedule(false);
    void syncTaskReminders();
    reload();
  };

  const handleDeleteGroup = () => {
    if (!group) return;
    Alert.alert(
      'グループを解除',
      `「${group.title}」を削除します。中のタスクは残ります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除',
          style: 'destructive',
          onPress: () => {
            deleteTaskGroup(group.id);
            void syncTaskReminders();
            router.back();
          },
        },
      ]
    );
  };

  const confirmDeleteTask = (task: Task) => {
    Alert.alert('タスクを削除', `「${task.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          deleteTask(task.id);
          void syncTaskReminders();
          reload();
        },
      },
    ]);
  };

  const toggleTask = (task: Task) => {
    if (task.kind === 'temporary') {
      if (task.completedAt) {
        reopenTemporaryTask(task.id);
      } else {
        completeTemporaryTask(task.id);
      }
      void syncTaskReminders();
      reload();
      return;
    }
    const done = isRecurringDoneOn(task, todayYmd);
    setRecurringDoneOn(task, todayYmd, !done);
    void syncTaskReminders();
    reload();
  };

  const promptAddTask = () => {
    if (!group) return;
    if (members.length >= TASK_GROUP_MEMBER_LIMIT) {
      Alert.alert(
        'グループ上限',
        `1つのグループに入れられるタスクは${TASK_GROUP_MEMBER_LIMIT}個までです。`
      );
      return;
    }
    router.push({
      pathname: '/task-edit',
      params: { kind: group.kind, groupId: group.id },
    });
  };

  const toggleWeekday = (day: number) => {
    setWeekdaysUnspecified(false);
    setWeekdays((prev) => {
      if (prev.includes(day)) {
        const next = prev.filter((value) => value !== day);
        return next.length > 0 ? next : prev;
      }
      return [...prev, day];
    });
  };

  if (!group) {
    return null;
  }

  return (
    <FormScreenTemplate
      title="タスクグループ"
      onBack={() => router.back()}
      keyboardShouldPersistTaps="always"
    >
      <FormScreenBody>
        <FormScreenSection>
          <View style={styles.titleRow}>
            <View style={styles.groupIconWrap}>
              <Ionicons name="layers-outline" size={22} color={content.contentText} />
            </View>
            {editingTitle ? (
              <TextInput
                style={[styles.titleInput, contentInputStyle(content)]}
                value={titleDraft}
                onChangeText={setTitleDraft}
                autoFocus
                onBlur={saveTitle}
                onSubmitEditing={saveTitle}
                placeholder="グループ名"
                placeholderTextColor={content.contentTextSecondary}
              />
            ) : (
              <Pressable style={styles.titlePress} onPress={() => setEditingTitle(true)}>
                <Text style={[styles.titleText, contentTextStyle(content)]}>{group.title}</Text>
                <Text style={[styles.titleEditHint, contentMutedTextStyle(content)]}>タップで改名</Text>
              </Pressable>
            )}
          </View>
          {summaryMeta ? (
            <Text style={[styles.summaryMeta, contentMutedTextStyle(content)]}>{summaryMeta}</Text>
          ) : group.kind === 'recurring' && recurringMembers.length > 0 ? (
            <Text style={[styles.summaryMeta, contentMutedTextStyle(content)]}>
              まだ実施記録がありません
            </Text>
          ) : group.kind === 'temporary' && temporaryMembers.length > 0 ? (
            <Text style={[styles.summaryMeta, contentMutedTextStyle(content)]}>
              臨時 {temporaryMembers.length}件
            </Text>
          ) : (
            <Text style={[styles.summaryMeta, contentMutedTextStyle(content)]}>
              まだタスクがありません
            </Text>
          )}
          {group.kind === 'recurring' && recurringMembers.length > 0 ? (
            <Text style={[styles.summaryNote, contentMutedTextStyle(content)]}>
              中の定期タスクをどれか1つでも実施すると、その日はグループ実施になります
            </Text>
          ) : null}
        </FormScreenSection>

        {group.kind === 'recurring' ? (
          <FormScreenSection>
            <View style={styles.sectionHeaderRow} pointerEvents="box-none">
              <Text
                style={[styles.sectionLabelInline, contentTextStyle(content)]}
                pointerEvents="none"
              >
                グループの周期
              </Text>
              {editingSchedule ? (
                <View style={styles.scheduleActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.scheduleSecondaryBtn,
                      contentSurfaceStyle(content),
                      { borderColor: content.contentBorder },
                    ]}
                    onPress={cancelEditSchedule}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="周期の編集をやめる"
                  >
                    <Text style={[styles.saveScheduleBtnText, contentTextStyle(content)]}>
                      キャンセル
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveScheduleBtn, contentFilledButtonStyle(content)]}
                    onPress={saveSchedule}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="周期を保存"
                  >
                    <Text style={[styles.saveScheduleBtnText, contentFilledButtonTextStyle(content)]}>
                      保存
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.saveScheduleBtn, contentFilledButtonStyle(content)]}
                  onPress={beginEditSchedule}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="周期を編集"
                >
                  <Text style={[styles.saveScheduleBtnText, contentFilledButtonTextStyle(content)]}>
                    編集
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {editingSchedule ? (
              <>
                <Text style={[styles.scheduleHint, contentMutedTextStyle(content)]}>
                  メンバーの必須日に加えて、グループ自体を必須にしたい日を設定します。
                </Text>
                <View style={styles.chipRow}>
                  {(
                    [
                      { key: 'scheduled' as const, label: 'あり（周期あり）' },
                      { key: 'unpaced' as const, label: 'なし' },
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
                {pace === 'scheduled' ? (
                  <>
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
                    {unit === 'week' ? (
                      <View style={styles.weekdayChipRow}>
                        <Pressable
                          style={[
                            styles.weekdayChip,
                            contentSurfaceStyle(content),
                            { borderWidth: 1 },
                            weekdaysUnspecified ? contentSelectedOptionStyle(content) : null,
                          ]}
                          onPress={() => setWeekdaysUnspecified(true)}
                        >
                          <Text style={[styles.weekdayChipText, contentTextStyle(content)]}>
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
                            <Text style={[styles.weekdayChipText, contentTextStyle(content)]}>
                              {day.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {unit === 'month' ? (
                      <View style={styles.numberRow}>
                        <Text style={[styles.numberLabel, contentMutedTextStyle(content)]}>日</Text>
                        <TextInput
                          style={[styles.numberInput, contentInputStyle(content)]}
                          keyboardType="number-pad"
                          value={String(monthDay)}
                          onChangeText={(text) =>
                            setMonthDay(Number(text.replace(/\D/g, '')) || 1)
                          }
                        />
                      </View>
                    ) : null}
                    {unit === 'year' ? (
                      <View style={styles.numberRow}>
                        <Text style={[styles.numberLabel, contentMutedTextStyle(content)]}>月</Text>
                        <TextInput
                          style={[styles.numberInput, contentInputStyle(content)]}
                          keyboardType="number-pad"
                          value={String(yearMonth)}
                          onChangeText={(text) =>
                            setYearMonth(Number(text.replace(/\D/g, '')) || 1)
                          }
                        />
                        <Text style={[styles.numberLabel, contentMutedTextStyle(content)]}>日</Text>
                        <TextInput
                          style={[styles.numberInput, contentInputStyle(content)]}
                          keyboardType="number-pad"
                          value={String(yearDay)}
                          onChangeText={(text) =>
                            setYearDay(Number(text.replace(/\D/g, '')) || 1)
                          }
                        />
                      </View>
                    ) : null}
                  </>
                ) : null}
                <Text style={[styles.scheduleHint, contentMutedTextStyle(content)]}>
                  プレビュー: {scheduleDraftPreview}
                </Text>
              </>
            ) : (
              <View
                style={[
                  styles.savedScheduleCard,
                  contentSurfaceStyle(content),
                  { borderColor: content.contentBorder },
                ]}
              >
                <Text style={[styles.savedScheduleLabel, contentTextStyle(content)]}>
                  {savedScheduleLabel}
                </Text>
                <Text style={[styles.scheduleHint, contentMutedTextStyle(content)]}>
                  メンバーの必須日との OR で、グループ必須日になります。
                </Text>
              </View>
            )}
          </FormScreenSection>
        ) : null}

        {group.kind === 'recurring' ? (
          <FormScreenSection>
            <TaskRemindFields
              mode="time-only"
              enabled={group.remindEnabled}
              daysBefore={0}
              time={group.remindTime ?? DEFAULT_REMIND_TIME}
              onEnabledChange={(value) =>
                persistGroupRemind(
                  value,
                  clampRemindTimeToNow(group.remindTime ?? DEFAULT_REMIND_TIME)
                )
              }
              onDaysBeforeChange={() => undefined}
              onTimeChange={(time) => persistGroupRemind(true, time)}
              hint="グループが要対応の日（赤枠）に、この時刻で通知します。メンバー個別の時刻は使いません。"
            />
          </FormScreenSection>
        ) : null}

        <FormScreenSection>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, contentTextStyle(content)]}>
              タスク（{members.length}）
            </Text>
            <Pressable style={styles.inlineAdd} onPress={promptAddTask}>
              <Ionicons name="add-circle-outline" size={20} color={content.contentText} />
              <Text style={[styles.inlineAddText, contentTextStyle(content)]}>追加</Text>
            </Pressable>
          </View>
          {members.length === 0 ? (
            <Text style={[styles.empty, contentMutedTextStyle(content)]}>
              まだタスクがありません。追加するか、一覧から所属を付けてください。
            </Text>
          ) : (
            <View style={styles.memberList}>
              {members.map((task) => {
                if (task.kind === 'temporary') {
                  const completed = Boolean(task.completedAt);
                  const dueLabel = task.dueDate ? formatTaskDueDateLabel(task.dueDate) : '';
                  return (
                    <Pressable
                      key={task.id}
                      style={[
                        styles.memberRow,
                        contentSurfaceStyle(content),
                        { borderColor: content.contentBorder },
                        completed ? styles.memberRowCompleted : null,
                      ]}
                      onPress={() =>
                        router.push({ pathname: '/task-detail', params: { taskId: task.id } })
                      }
                      onLongPress={() => confirmDeleteTask(task)}
                    >
                      <Pressable
                        style={styles.checkHit}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          toggleTask(task);
                        }}
                        accessibilityLabel={completed ? '未完了に戻す' : '完了にする'}
                      >
                        <Ionicons
                          name={completed ? 'checkbox' : 'square-outline'}
                          size={24}
                          color={completed ? checkedColor : content.contentTextSecondary}
                        />
                      </Pressable>
                      <View style={styles.memberMain}>
                        <Text
                          style={[
                            styles.memberTitle,
                            contentTextStyle(content),
                            completed ? styles.memberTitleCompleted : null,
                          ]}
                        >
                          {task.title}
                        </Text>
                        <Text style={[styles.memberMeta, contentMutedTextStyle(content)]}>
                          臨時{dueLabel ? ` · ${dueLabel}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }

                const dueToday = isRecurringDueOnDate(task, new Date());
                const doneToday = isRecurringDoneOn(task, todayYmd);
                const label = formatRecurrenceLabel(
                  task.pace,
                  task.recurrenceUnit,
                  task.recurrenceConfig
                );
                return (
                  <Pressable
                    key={task.id}
                    style={[
                      styles.memberRow,
                      contentSurfaceStyle(content),
                      { borderColor: content.contentBorder },
                    ]}
                    onPress={() =>
                      router.push({ pathname: '/task-detail', params: { taskId: task.id } })
                    }
                    onLongPress={() => confirmDeleteTask(task)}
                  >
                    {dueToday ? (
                      <Pressable
                        style={styles.checkHit}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          toggleTask(task);
                        }}
                        accessibilityLabel={doneToday ? '完了を解除' : '完了にする'}
                      >
                        <Ionicons
                          name={doneToday ? 'checkbox' : 'square-outline'}
                          size={24}
                          color={doneToday ? checkedColor : content.contentTextSecondary}
                        />
                      </Pressable>
                    ) : (
                      <View style={styles.checkHit}>
                        <Ionicons
                          name="ellipse-outline"
                          size={18}
                          color={content.contentTextSecondary}
                        />
                      </View>
                    )}
                    <View style={styles.memberMain}>
                      <Text style={[styles.memberTitle, contentTextStyle(content)]}>
                        {task.title}
                      </Text>
                      {label ? (
                        <Text style={[styles.memberMeta, contentMutedTextStyle(content)]}>
                          {label}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </FormScreenSection>

        {group.kind === 'recurring' && tracks ? (
          <FormScreenSection>
            <Text style={[styles.sectionLabel, contentTextStyle(content)]}>
              グループ実施履歴
              {historyDates.length > 0 ? `（${historyDates.length}日）` : ''}
            </Text>
            {activityLabel ? (
              <Text style={[styles.historyActivity, contentMutedTextStyle(content)]}>
                いま: {activityLabel}
              </Text>
            ) : null}
            {historyDates.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                まだグループとしての実施日がありません
              </Text>
            ) : (
              <View style={styles.historyList}>
                {historyDates.map((ymd) => (
                  <View
                    key={ymd}
                    style={[
                      styles.historyRow,
                      contentSurfaceStyle(content),
                      { borderColor: content.contentBorder },
                    ]}
                  >
                    <Text style={[styles.historyDate, contentTextStyle(content)]}>
                      {formatHistoryDate(ymd)}
                    </Text>
                    {ymd === todayYmd ? (
                      <Text style={[styles.historyBadge, contentMutedTextStyle(content)]}>今日</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </FormScreenSection>
        ) : null}

        <FormScreenSection>
          <Pressable style={styles.deleteBtn} onPress={handleDeleteGroup}>
            <Text style={styles.deleteText}>グループを解除</Text>
          </Pressable>
        </FormScreenSection>
      </FormScreenBody>
    </FormScreenTemplate>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titlePress: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '800',
  },
  titleEditHint: {
    fontSize: 11,
  },
  titleInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    paddingVertical: 4,
  },
  summaryMeta: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  summaryNote: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
  },
  scheduleHint: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  weekdayChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  weekdayChip: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  weekdayChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  numberLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  numberInput: {
    minWidth: 48,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionLabelInline: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
  },
  saveScheduleBtn: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scheduleSecondaryBtn: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scheduleActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  saveScheduleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  savedScheduleCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  savedScheduleLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  inlineAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  inlineAddText: {
    fontSize: 13,
    fontWeight: '700',
  },
  empty: {
    fontSize: 13,
    lineHeight: 20,
  },
  memberList: {
    gap: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  memberRowCompleted: {
    opacity: 0.7,
  },
  memberTitleCompleted: {
    textDecorationLine: 'line-through',
  },
  checkHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  memberMeta: {
    fontSize: 12,
  },
  historyActivity: {
    fontSize: 13,
    marginBottom: 8,
  },
  historyList: {
    gap: 6,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '700',
  },
});
