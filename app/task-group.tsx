import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
  deleteTask,
  deleteTaskGroup,
  getRecurringTasksByGroupId,
  getTaskGroup,
  getTasksCompletionDatesUnion,
  initializeDatabase,
  isRecurringDoneOn,
  setRecurringDoneOn,
  updateTaskGroup,
} from '../db';
import type { Task, TaskGroup } from '../types';
import { TASK_GROUP_MEMBER_LIMIT } from '../types';
import {
  formatRecurrenceLabel,
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
import { useContentColors } from '@/utils/useContentColors';
import {
  contentInputStyle,
  contentMutedTextStyle,
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
  const [tick, setTick] = useState(0);
  const todayYmd = toYmd(new Date());

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
    setMembers(getRecurringTasksByGroupId(groupId));
    setTick((n) => n + 1);
  }, [groupId, router]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const completionDates = useMemo(() => {
    void tick;
    return getTasksCompletionDatesUnion(trackingMembers(members).map((task) => task.id));
  }, [members, tick]);

  const historyDates = useMemo(() => {
    return Array.from(completionDates).sort((a, b) => (a < b ? 1 : -1));
  }, [completionDates]);

  const tracks = useMemo(() => groupTracksCompletions(members), [members]);

  const activityLabel = useMemo(
    () => (tracks ? formatGroupActivityLabel(completionDates, new Date()) : ''),
    [completionDates, tracks]
  );

  const progress = useMemo(
    () => countGroupDueProgress(members, new Date(), isRecurringDoneOn),
    [members, tick]
  );

  const summaryMeta = useMemo(
    () => formatGroupListMeta(completionDates, progress, new Date()),
    [completionDates, progress]
  );

  const saveTitle = () => {
    if (!group) return;
    const title = titleDraft.trim();
    if (!title) {
      Alert.alert('入力エラー', 'グループ名を入力してください');
      setTitleDraft(group.title);
      setEditingTitle(false);
      return;
    }
    updateTaskGroup(group.id, { title });
    setEditingTitle(false);
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
          reload();
        },
      },
    ]);
  };

  const toggleTask = (task: Task) => {
    const done = isRecurringDoneOn(task, todayYmd);
    setRecurringDoneOn(task, todayYmd, !done);
    reload();
  };

  if (!group) {
    return null;
  }

  return (
    <FormScreenTemplate
      title="タスクグループ"
      onBack={() => router.back()}
      right={
        <Pressable
          onPress={() => {
            if (members.length >= TASK_GROUP_MEMBER_LIMIT) {
              Alert.alert(
                'グループ上限',
                `1つのグループに入れられるタスクは${TASK_GROUP_MEMBER_LIMIT}個までです。`
              );
              return;
            }
            router.push({
              pathname: '/task-edit',
              params: { kind: 'recurring', groupId: group.id },
            });
          }}
          hitSlop={8}
          accessibilityLabel="タスクを追加"
        >
          <Text style={[styles.addText, contentTextStyle(content)]}>追加</Text>
        </Pressable>
      }
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
          ) : (
            <Text style={[styles.summaryMeta, contentMutedTextStyle(content)]}>
              まだ実施記録がありません
            </Text>
          )}
          <Text style={[styles.summaryNote, contentMutedTextStyle(content)]}>
            中のタスクをどれか1つでも実施すると、その日はグループ実施になります
          </Text>
        </FormScreenSection>

        <FormScreenSection>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, contentTextStyle(content)]}>
              タスク（{members.length}）
            </Text>
            <Pressable
              style={styles.inlineAdd}
              onPress={() =>
                router.push({
                  pathname: '/task-edit',
                  params: { kind: 'recurring', groupId: group.id },
                })
              }
            >
              <Ionicons name="add-circle-outline" size={20} color={content.contentText} />
              <Text style={[styles.inlineAddText, contentTextStyle(content)]}>追加</Text>
            </Pressable>
          </View>
          {members.length === 0 ? (
            <Text style={[styles.empty, contentMutedTextStyle(content)]}>
              まだタスクがありません。追加するか、定期一覧からドロップで入れてください。
            </Text>
          ) : (
            <View style={styles.memberList}>
              {members.map((task) => {
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

        {tracks ? (
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

        <Pressable style={styles.deleteButton} onPress={handleDeleteGroup}>
          <Text style={styles.deleteText}>グループを解除</Text>
        </Pressable>
      </FormScreenBody>
    </FormScreenTemplate>
  );
}

const styles = StyleSheet.create({
  addText: {
    fontSize: 16,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
    fontSize: 12,
  },
  titleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 18,
    fontWeight: '700',
  },
  summaryMeta: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  summaryNote: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
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
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    marginTop: 8,
    marginBottom: 24,
    alignItems: 'center',
    paddingVertical: 14,
  },
  deleteText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 15,
  },
});
