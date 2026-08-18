import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FormScreenBody, FormScreenSection, FormScreenTemplate } from '@/components/screen-templates';
import {
  completeTemporaryTask,
  deleteTask,
  getEvent,
  getTask,
  getTaskCompletions,
  getTaskGroup,
  initializeDatabase,
  reopenTemporaryTask,
} from '../db';
import type { Event, Task, TaskCompletion, TaskGroup } from '../types';
import {
  calculateScheduledStreak,
  daysBetweenYmd,
  formatRecurrenceLabel,
  formatTaskDueDateLabel,
  getLastCompletionYmd,
  getRecentScheduledDotItems,
  getTaskDueUrgency,
  toYmd,
} from '@/utils/taskHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { syncTaskReminders } from '@/utils/taskNotifications';
import { Radius } from '@/constants/theme';
import { StreakFlameIcon } from '@/components/ui/StreakFlameIcon';
import { TaskRecentSevenDayDots, taskCompletionFillColor } from '@/components/task/TaskRecentSevenDayDots';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { getEventCalendarColor } from '@/utils/calendarEventColors';
import { formatEventScheduleLabel } from '@/utils/eventHelpers';

function formatStampDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  if (!m || !d) return ymd;
  return `${m}/${d}`;
}

function formatDaysAgo(ymd: string): string {
  const diff = daysBetweenYmd(ymd, toYmd(new Date()));
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  return `${diff}日前`;
}

function formatCompletedAt(iso: string): string {
  const ymd = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return formatStampDate(ymd);
  }
  return iso;
}

export default function TaskDetailScreen() {
  const router = useRouter();
  const content = useContentColors();
  const isBlack = useAppThemeOptional()?.variant === 'black';
  const checkedColor = taskCompletionFillColor(Boolean(isBlack));
  const params = useLocalSearchParams<{ taskId?: string }>();
  const taskId = typeof params.taskId === 'string' ? params.taskId : '';
  const [task, setTask] = useState<Task | null>(null);
  const [group, setGroup] = useState<TaskGroup | null>(null);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [linkedEvent, setLinkedEvent] = useState<Event | null>(null);

  const reload = useCallback(() => {
    initializeDatabase();
    if (!taskId) {
      setTask(null);
      setGroup(null);
      setCompletions([]);
      setLinkedEvent(null);
      return;
    }
    const loaded = getTask(taskId);
    if (!loaded) {
      Alert.alert('エラー', 'タスクが見つかりません', [{ text: 'OK', onPress: () => router.back() }]);
      return;
    }
    setTask(loaded);
    setGroup(loaded.groupId ? getTaskGroup(loaded.groupId) : null);
    setCompletions(loaded.kind === 'recurring' ? getTaskCompletions(taskId) : []);
    if (loaded.kind === 'temporary' && loaded.eventId) {
      setLinkedEvent(getEvent(loaded.eventId));
    } else {
      setLinkedEvent(null);
    }
  }, [router, taskId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const completionDates = useMemo(
    () => Array.from(new Set(completions.map((item) => item.completedOn))).sort((a, b) => (a < b ? 1 : -1)),
    [completions]
  );
  const completionSet = useMemo(() => new Set(completionDates), [completionDates]);
  const streak = useMemo(
    () => (task?.trackCompletions ? calculateScheduledStreak(task, completionSet, new Date()) : 0),
    [completionSet, task]
  );
  const lastYmd = useMemo(() => getLastCompletionYmd(completionSet), [completionSet]);
  const scheduledDays = useMemo(
    () =>
      task?.trackCompletions ? getRecentScheduledDotItems(task, completionSet, new Date()) : [],
    [completionSet, task]
  );

  const historyByYear = useMemo(() => {
    const map = new Map<string, string[]>();
    completionDates.forEach((ymd) => {
      const year = ymd.slice(0, 4);
      const list = map.get(year) ?? [];
      list.push(ymd);
      map.set(year, list);
    });
    return Array.from(map.entries());
  }, [completionDates]);

  const confirmDeleteFinally = () => {
    if (!task) return;
    deleteTask(task.id);
    void syncTaskReminders();
    router.back();
  };

  const handleDelete = () => {
    if (!task) return;
    if (task.kind === 'recurring') {
      Alert.alert(
        '定期タスクを削除',
        `「${task.title}」を削除すると、これまでの実施履歴もすべて消えます。\nこの操作は取り消せません。`,
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
    Alert.alert('タスクを削除', `「${task.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: confirmDeleteFinally },
    ]);
  };

  const toggleTemporaryComplete = () => {
    if (!task || task.kind !== 'temporary') return;
    if (task.completedAt) {
      reopenTemporaryTask(task.id);
    } else {
      completeTemporaryTask(task.id);
    }
    void syncTaskReminders();
    reload();
  };

  if (!task) {
    return null;
  }

  const isTemporary = task.kind === 'temporary';
  const isCompleted = Boolean(task.completedAt);
  const dueUrgency = task.dueDate ? getTaskDueUrgency(task.dueDate) : null;

  return (
    <FormScreenTemplate
      title="タスク詳細"
      onBack={() => router.back()}
      right={
        <Pressable
          onPress={() => router.push({ pathname: '/task-edit', params: { taskId: task.id } })}
          hitSlop={8}
          accessibilityLabel="編集"
        >
          <Text style={[styles.editText, contentTextStyle(content)]}>編集</Text>
        </Pressable>
      }
    >
      <FormScreenBody>
        <FormScreenSection>
          <View style={styles.titleRow}>
            <View style={[styles.titleIcon, contentSurfaceStyle(content), { borderColor: content.contentBorder }]}>
              <Ionicons
                name={isTemporary ? 'flash-outline' : 'checkmark-done-circle-outline'}
                size={22}
                color={content.contentText}
              />
            </View>
            <View style={styles.titleMain}>
              <Text style={[styles.title, contentTextStyle(content)]}>{task.title}</Text>
              {isTemporary ? (
                <Text style={[styles.subtitle, contentMutedTextStyle(content)]}>臨時</Text>
              ) : (
                <Text style={[styles.subtitle, contentMutedTextStyle(content)]}>
                  {formatRecurrenceLabel(task.pace, task.recurrenceUnit, task.recurrenceConfig) || '定期'}
                  {group ? ` · ${group.title}` : ''}
                </Text>
              )}
            </View>
          </View>
        </FormScreenSection>

        {isTemporary ? (
          <FormScreenSection>
            <View style={styles.temporaryMetaRow}>
              {task.dueDate ? (
                <View
                  style={[
                    styles.dueChip,
                    contentTagStyle(content),
                    { borderWidth: 1 },
                    dueUrgency === 'overdue'
                      ? { borderColor: '#dc2626', backgroundColor: 'rgba(220, 38, 38, 0.12)' }
                      : null,
                    dueUrgency === 'today'
                      ? { borderColor: checkedColor, backgroundColor: `${checkedColor}22` }
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.dueChipText,
                      contentTextStyle(content),
                      dueUrgency === 'overdue' ? { color: '#dc2626' } : null,
                      dueUrgency === 'today' ? { color: checkedColor } : null,
                    ]}
                  >
                    {formatTaskDueDateLabel(task.dueDate)}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.empty, contentMutedTextStyle(content)]}>期限なし</Text>
              )}
              <Pressable
                style={[
                  styles.statusToggle,
                  contentSurfaceStyle(content),
                  { borderColor: isCompleted ? checkedColor : content.contentBorder },
                ]}
                onPress={toggleTemporaryComplete}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isCompleted }}
                accessibilityLabel={isCompleted ? '完了を解除' : '完了にする'}
              >
                <Ionicons
                  name={isCompleted ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={isCompleted ? checkedColor : content.contentTextSecondary}
                />
                <Text style={[styles.statusToggleText, contentTextStyle(content)]}>
                  {isCompleted
                    ? `完了${task.completedAt ? ` · ${formatCompletedAt(task.completedAt)}` : ''}`
                    : '未完了'}
                </Text>
              </Pressable>
            </View>
          </FormScreenSection>
        ) : task.trackCompletions ? (
          <FormScreenSection>
            <View style={styles.topSummaryRow}>
              <View
                style={[
                  styles.streakBadge,
                  contentSurfaceStyle(content),
                  {
                    borderColor: streak > 0 ? content.contentText : content.contentBorder,
                    borderWidth: streak > 0 ? 2 : 1,
                  },
                ]}
              >
                {streak > 0 ? (
                  <View style={styles.streakActiveWrap}>
                    <StreakFlameIcon color={content.contentText} size={46} />
                    <Text style={[styles.streakActiveValue, contentTextStyle(content)]}>{streak}</Text>
                  </View>
                ) : (
                  <View style={styles.streakIdleWrap}>
                    <Ionicons name="time-outline" size={32} color={content.contentTextSecondary} />
                    <Text style={[styles.streakIdleValue, contentMutedTextStyle(content)]}>
                      {lastYmd ? formatDaysAgo(lastYmd) : '-'}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.sevenDayBlock}>
                <Text style={[styles.sevenDayLabel, contentMutedTextStyle(content)]}>直近7回</Text>
                <TaskRecentSevenDayDots
                  days={scheduledDays}
                  content={content}
                  compact={false}
                  showCaptions
                />
              </View>
            </View>
          </FormScreenSection>
        ) : (
          <FormScreenSection>
            <Text style={[styles.empty, contentMutedTextStyle(content)]}>
              このタスクは実施記録を残していません
            </Text>
          </FormScreenSection>
        )}

        {linkedEvent ? (
          <FormScreenSection>
            <Text style={[styles.linkedEventLabel, contentTextStyle(content)]}>紐づけられている予定</Text>
            <Pressable
              style={({ pressed }) => [
                styles.linkedEventCard,
                contentSurfaceStyle(content),
                { borderColor: content.contentBorder },
                pressed ? styles.linkedEventCardPressed : null,
              ]}
              onPress={() =>
                router.push({
                  pathname: '/event',
                  params: { eventId: linkedEvent.id },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`予定「${linkedEvent.title || '無題'}」を開く`}
            >
              <View
                style={[
                  styles.linkedEventIcon,
                  { backgroundColor: getEventCalendarColor(linkedEvent.episodeTag) },
                ]}
              >
                <Ionicons name="calendar-outline" size={19} color="#ffffff" />
              </View>
              <View style={styles.linkedEventMain}>
                <Text style={[styles.linkedEventTitle, contentTextStyle(content)]} numberOfLines={2}>
                  {linkedEvent.title || '無題'}
                </Text>
                <View style={styles.linkedEventScheduleRow}>
                  <Ionicons name="time-outline" size={14} color={content.contentTextSecondary} />
                  <Text style={[styles.linkedEventSchedule, contentMutedTextStyle(content)]}>
                    {formatEventScheduleLabel(linkedEvent)}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={content.contentTextSecondary} />
            </Pressable>
          </FormScreenSection>
        ) : null}

        {!isTemporary && task.trackCompletions ? (
        <FormScreenSection>
          <View style={styles.historyHeaderRow}>
            <Text style={[styles.sectionTitle, styles.historyTitle, contentTextStyle(content)]}>過去の実施日</Text>
            <View style={[styles.totalTag, contentSurfaceStyle(content), { borderColor: content.contentBorder }]}>
              <Text style={[styles.totalTagText, contentTextStyle(content)]}>Total {completionDates.length}</Text>
            </View>
          </View>
          {historyByYear.length === 0 ? (
            <Text style={[styles.empty, contentMutedTextStyle(content)]}>まだ実施記録がありません</Text>
          ) : (
            <View style={styles.yearList}>
              {historyByYear.map(([year, dates]) => (
                <View key={year} style={styles.yearBlock}>
                  <Text style={[styles.yearTitle, contentTextStyle(content)]}>{year}</Text>
                  <View style={styles.stampWrap}>
                    {dates.map((ymd) => (
                      <View
                        key={ymd}
                        style={[
                          styles.stamp,
                          contentSurfaceStyle(content),
                          { borderColor: content.contentBorder },
                          ymd === lastYmd ? { borderColor: content.contentText, borderWidth: 1 } : null,
                        ]}
                      >
                        <Text style={[styles.stampText, contentTextStyle(content)]}>{formatStampDate(ymd)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </FormScreenSection>
        ) : null}

        <FormScreenSection>
          <Text style={[styles.detailText, contentMutedTextStyle(content)]}>
            {task.memo.trim() || 'メモはありません'}
          </Text>
        </FormScreenSection>

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
      </FormScreenBody>
    </FormScreenTemplate>
  );
}

const styles = StyleSheet.create({
  editText: {
    fontSize: 16,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
  },
  temporaryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  linkedEventLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  linkedEventCard: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkedEventCardPressed: {
    opacity: 0.72,
  },
  linkedEventIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  linkedEventMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  linkedEventTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  linkedEventScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkedEventSchedule: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  dueChip: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dueChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusToggleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  topSummaryRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  sevenDayBlock: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  sevenDayLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  streakBadge: {
    width: 78,
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakActiveWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
    gap: 0,
  },
  streakActiveValue: {
    marginTop: -4,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
    includeFontPadding: false,
  },
  streakIdleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  streakIdleValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  historyTitle: {
    marginBottom: 0,
  },
  totalTag: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  totalTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    fontSize: 13,
    lineHeight: 20,
  },
  yearList: {
    gap: 14,
  },
  yearBlock: {
    gap: 8,
  },
  yearTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  stampWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  stamp: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 4,
    minWidth: 0,
    alignItems: 'center',
  },
  stampText: {
    fontSize: 13,
    fontWeight: '700',
  },
  detailText: {
    fontSize: 14,
    lineHeight: 22,
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
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  deleteText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
});
