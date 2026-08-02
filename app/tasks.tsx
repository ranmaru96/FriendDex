import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { AddCircleButton } from '@/components/AddCircleButton';
import { ListScreenTemplate } from '@/components/screen-templates';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  completeTemporaryTask,
  getOpenTemporaryTasks,
  getRecurringTasks,
  getTaskCompletionCount,
  getTaskCompletionDatesSet,
  initializeDatabase,
  isTaskCompletedOn,
  setRecurringTaskCompletion,
  getEvent,
  deleteTask,
} from '../db';
import { Task } from '../types';
import {
  calculateScheduledStreak,
  formatRecurrenceLabel,
  isRecurringDueOnDate,
  toYmd,
} from '@/utils/taskHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

type Segment = 'today' | 'recurring' | 'temporary';

export default function TasksScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const content = useContentColors();
  const [segment, setSegment] = useState<Segment>('today');
  const [recurring, setRecurring] = useState<Task[]>([]);
  const [temporary, setTemporary] = useState<Task[]>([]);
  const [completionTick, setCompletionTick] = useState(0);
  const todayYmd = toYmd(new Date());

  const reload = useCallback(() => {
    initializeDatabase();
    setRecurring(getRecurringTasks());
    setTemporary(getOpenTemporaryTasks());
    setCompletionTick((n) => n + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const todayRecurring = useMemo(() => {
    const today = new Date();
    return recurring.filter((task) => isRecurringDueOnDate(task, today));
  }, [recurring, completionTick]);

  const toggleRecurring = (task: Task) => {
    const done = isTaskCompletedOn(task.id, todayYmd);
    setRecurringTaskCompletion(task.id, todayYmd, !done);
    reload();
  };

  const completeTemp = (task: Task) => {
    completeTemporaryTask(task.id);
    reload();
  };

  const confirmDelete = (task: Task) => {
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

  const renderRecurringRow = (task: Task, showCheckbox: boolean) => {
    const doneToday = isTaskCompletedOn(task.id, todayYmd);
    const count = getTaskCompletionCount(task.id);
    const dates = getTaskCompletionDatesSet(task.id);
    const streak = calculateScheduledStreak(task, dates, new Date());
    const label = formatRecurrenceLabel(task.pace, task.recurrenceUnit, task.recurrenceConfig);

    return (
      <Pressable
        key={task.id}
        style={[styles.row, contentSurfaceStyle(content), { borderWidth: 1, borderRadius: 10 }]}
        onPress={() => router.push({ pathname: '/task-edit', params: { taskId: task.id } })}
        onLongPress={() => confirmDelete(task)}
      >
        {showCheckbox ? (
          <Pressable
            style={styles.checkboxHit}
            onPress={(e) => {
              e.stopPropagation?.();
              toggleRecurring(task);
            }}
            accessibilityLabel={doneToday ? '完了を解除' : '完了にする'}
          >
            <Ionicons
              name={doneToday ? 'checkbox' : 'square-outline'}
              size={26}
              color={doneToday ? content.contentText : content.contentTextSecondary}
            />
          </Pressable>
        ) : null}
        <View style={styles.rowMain}>
          <Text style={[styles.rowTitle, contentTextStyle(content)]}>{task.title}</Text>
          <Text style={[styles.rowMeta, contentMutedTextStyle(content)]}>
            {label} · 連続{streak} · 計{count}回
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderTemporaryRow = (task: Task) => {
    const eventTitle = task.eventId ? getEvent(task.eventId)?.title : null;
    return (
      <Pressable
        key={task.id}
        style={[styles.row, contentSurfaceStyle(content), { borderWidth: 1, borderRadius: 10 }]}
        onPress={() => router.push({ pathname: '/task-edit', params: { taskId: task.id } })}
        onLongPress={() => confirmDelete(task)}
      >
        <Pressable
          style={styles.checkboxHit}
          onPress={() => completeTemp(task)}
          accessibilityLabel="完了にする"
        >
          <Ionicons name="square-outline" size={26} color={content.contentTextSecondary} />
        </Pressable>
        <View style={styles.rowMain}>
          <Text style={[styles.rowTitle, contentTextStyle(content)]}>{task.title}</Text>
          <Text style={[styles.rowMeta, contentMutedTextStyle(content)]}>
            {task.dueDate ? `期限 ${task.dueDate}` : '期限なし'}
            {eventTitle ? ` · ${eventTitle}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <ListScreenTemplate
      fab={
        <AddCircleButton
          style={styles.fab}
          onPress={() =>
            router.push({
              pathname: '/task-edit',
              params:
                segment === 'recurring'
                  ? { kind: 'recurring' }
                  : segment === 'temporary'
                    ? { kind: 'temporary' }
                    : {},
            })
          }
          accessibilityLabel="タスクを追加"
        />
      }
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: kit.listScreenPaddingHorizontal, paddingBottom: 100 },
        ]}
      >
        <View style={styles.segmentRow}>
          {(
            [
              { key: 'today', label: '今日' },
              { key: 'recurring', label: '定期' },
              { key: 'temporary', label: '臨時' },
            ] as const
          ).map((item) => {
            const active = segment === item.key;
            return (
              <Pressable
                key={item.key}
                style={[
                  styles.segmentButton,
                  contentSurfaceStyle(content),
                  { borderWidth: 1 },
                  active ? { borderColor: content.contentText } : null,
                ]}
                onPress={() => setSegment(item.key)}
              >
                <Text style={[styles.segmentLabel, contentTextStyle(content)]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {segment === 'today' ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, contentTextStyle(content)]}>今日の定期</Text>
            {todayRecurring.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>今日の定期タスクはありません</Text>
            ) : (
              todayRecurring.map((task) => renderRecurringRow(task, true))
            )}
            <Text style={[styles.sectionTitle, contentTextStyle(content)]}>臨時（未完了）</Text>
            {temporary.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>未完了の臨時タスクはありません</Text>
            ) : (
              temporary.map(renderTemporaryRow)
            )}
          </View>
        ) : null}

        {segment === 'recurring' ? (
          <View style={styles.section}>
            {recurring.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>定期タスクがありません</Text>
            ) : (
              recurring.map((task) => renderRecurringRow(task, isRecurringDueOnDate(task, new Date())))
            )}
          </View>
        ) : null}

        {segment === 'temporary' ? (
          <View style={styles.section}>
            {temporary.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>未完了の臨時タスクはありません</Text>
            ) : (
              temporary.map(renderTemporaryRow)
            )}
          </View>
        ) : null}
      </ScrollView>
    </ListScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
    gap: 12,
  },
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 8,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  empty: {
    fontSize: 13,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  checkboxHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowMeta: {
    fontSize: 12,
  },
});
