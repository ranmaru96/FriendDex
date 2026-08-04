import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AddCircleButton } from '@/components/AddCircleButton';
import { ListScreenTemplate } from '@/components/screen-templates';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  completeTemporaryTask,
  deleteTask,
  getAllTaskGroups,
  getCompletedTemporaryTasks,
  getEvent,
  getOpenTemporaryTasks,
  getRecurringTasks,
  getTaskCompletionDatesSet,
  getTasksCompletionDatesUnion,
  initializeDatabase,
  isTaskCompletedOn,
  setRecurringTaskCompletion,
  setTaskGroupId,
} from '../db';
import type { Task, TaskGroup } from '../types';
import {
  formatRecurrenceLabel,
  isRecurringDueOnDate,
  toYmd,
} from '@/utils/taskHelpers';
import { TaskRecentSevenDayDots, taskCompletionFillColor } from '@/components/task/TaskRecentSevenDayDots';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import {
  countGroupDueProgress,
  formatGroupListMeta,
  partitionRecurringByGroup,
} from '@/utils/taskGroupHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { Radius } from '@/constants/theme';
import type { AppThemeContentColorFields } from '@/constants/appThemes/contentColors';

type Segment = 'today' | 'recurring' | 'temporary';

/** グループ ID。ヒットなしは undefined */
type DropTargetId = string;

type DropZoneRect = {
  id: DropTargetId;
  y: number;
  height: number;
};

function resolveDropTarget(pageY: number, zones: DropZoneRect[]): DropTargetId | undefined {
  for (const zone of zones) {
    if (pageY >= zone.y && pageY <= zone.y + zone.height) {
      return zone.id;
    }
  }
  return undefined;
}

type RecurringTaskRowProps = {
  task: Task;
  showCheckbox: boolean;
  indented?: boolean;
  todayYmd: string;
  content: AppThemeContentColorFields;
  dragEnabled: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onLongPressDelete: () => void;
  onDragStart: (task: Task) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
};

function RecurringTaskRow({
  task,
  showCheckbox,
  indented = false,
  todayYmd,
  content,
  dragEnabled,
  onOpen,
  onToggle,
  onLongPressDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: RecurringTaskRowProps) {
  const doneToday = isTaskCompletedOn(task.id, todayYmd);
  const dates = getTaskCompletionDatesSet(task.id);
  const label = formatRecurrenceLabel(task.pace, task.recurrenceUnit, task.recurrenceConfig);
  const isBlack = useAppThemeOptional()?.variant === 'black';
  const checkedColor = taskCompletionFillColor(Boolean(isBlack));

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const dragging = useSharedValue(false);
  const onDragStartRef = useRef(onDragStart);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  onDragStartRef.current = onDragStart;
  onDragMoveRef.current = onDragMove;
  onDragEndRef.current = onDragEnd;

  const notifyStart = useCallback(() => {
    onDragStartRef.current(task);
  }, [task]);
  const notifyMove = useCallback((pageX: number, pageY: number) => {
    onDragMoveRef.current(pageX, pageY);
  }, []);
  const notifyEnd = useCallback((pageX: number, pageY: number) => {
    onDragEndRef.current(pageX, pageY);
  }, []);

  const pan = useMemo(() => {
    if (!dragEnabled) {
      return Gesture.Pan().enabled(false);
    }
    return Gesture.Pan()
      .activateAfterLongPress(420)
      .onStart(() => {
        dragging.value = true;
        scale.value = withTiming(1.04, { duration: 120 });
        runOnJS(notifyStart)();
      })
      .onUpdate((event) => {
        translateX.value = event.translationX;
        translateY.value = event.translationY;
        runOnJS(notifyMove)(event.absoluteX, event.absoluteY);
      })
      .onEnd((event) => {
        runOnJS(notifyEnd)(event.absoluteX, event.absoluteY);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withTiming(1, { duration: 120 });
        dragging.value = false;
      })
      .onFinalize((_event, success) => {
        if (!success) {
          translateX.value = withSpring(0);
          translateY.value = withSpring(0);
          scale.value = withTiming(1, { duration: 120 });
          dragging.value = false;
          runOnJS(notifyEnd)(-1, -1);
        }
      });
  }, [dragEnabled, dragging, notifyEnd, notifyMove, notifyStart, scale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: dragging.value ? 20 : 0,
    opacity: dragging.value ? 0.92 : 1,
  }));

  const body = (
    <Animated.View
      style={[
        styles.row,
        contentSurfaceStyle(content),
        { borderWidth: 1, borderRadius: 10 },
        indented ? styles.rowIndented : null,
        animatedStyle,
      ]}
    >
      {showCheckbox ? (
        <Pressable
          style={styles.checkboxHit}
          onPress={(e) => {
            e.stopPropagation?.();
            onToggle();
          }}
          accessibilityLabel={doneToday ? '完了を解除' : '完了にする'}
        >
          <Ionicons
            name={doneToday ? 'checkbox' : 'square-outline'}
            size={26}
            color={doneToday ? checkedColor : content.contentTextSecondary}
          />
        </Pressable>
      ) : (
        dragEnabled ? (
          <View style={styles.checkboxHit}>
            <Ionicons name="menu" size={18} color={content.contentTextSecondary} />
          </View>
        ) : null
      )}
      <Pressable style={styles.rowMain} onPress={onOpen} onLongPress={dragEnabled ? undefined : onLongPressDelete}>
        <Text style={[styles.rowTitle, contentTextStyle(content)]}>{task.title}</Text>
        {label ? (
          <Text style={[styles.rowMeta, contentMutedTextStyle(content)]}>{label}</Text>
        ) : null}
        <TaskRecentSevenDayDots completedOnSet={dates} content={content} compact />
      </Pressable>
    </Animated.View>
  );

  if (!dragEnabled) {
    return body;
  }

  return <GestureDetector gesture={pan}>{body}</GestureDetector>;
}

export default function TasksScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const content = useContentColors();
  const isBlack = useAppThemeOptional()?.variant === 'black';
  const checkedColor = taskCompletionFillColor(Boolean(isBlack));
  const [segment, setSegment] = useState<Segment>('today');
  const [recurring, setRecurring] = useState<Task[]>([]);
  const [temporary, setTemporary] = useState<Task[]>([]);
  const [completedTemporary, setCompletedTemporary] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [completionTick, setCompletionTick] = useState(0);
  const [helpVisible, setHelpVisible] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [hoverDropId, setHoverDropId] = useState<DropTargetId | undefined>(undefined);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const dropZonesRef = useRef<DropZoneRect[]>([]);
  const dropZoneHostsRef = useRef<Map<string, View>>(new Map());
  const draggingTaskIdRef = useRef<string | null>(null);
  const todayYmd = toYmd(new Date());

  const reload = useCallback(() => {
    initializeDatabase();
    setRecurring(getRecurringTasks());
    setTemporary(getOpenTemporaryTasks());
    setCompletedTemporary(getCompletedTemporaryTasks());
    setGroups(getAllTaskGroups());
    setCompletionTick((n) => n + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const { bundles, ungrouped } = useMemo(
    () =>
      partitionRecurringByGroup(recurring, groups, {
        includeEmptyGroups: segment === 'recurring',
      }),
    [recurring, groups, completionTick, segment]
  );

  const todayUngrouped = useMemo(() => {
    const today = new Date();
    return ungrouped.filter((task) => isRecurringDueOnDate(task, today));
  }, [ungrouped, completionTick]);

  const todayBundles = useMemo(() => {
    const today = new Date();
    return bundles
      .map((bundle) => ({
        ...bundle,
        dueMembers: bundle.members.filter((task) => isRecurringDueOnDate(task, today)),
      }))
      .filter((bundle) => bundle.dueMembers.length > 0);
  }, [bundles, completionTick]);

  const toggleExpanded = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

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

  const openGroupScreen = (group: TaskGroup) => {
    router.push({ pathname: '/task-group', params: { groupId: group.id } });
  };

  const setDropZoneHost = useCallback((id: DropTargetId, node: View | null) => {
    if (node) {
      dropZoneHostsRef.current.set(id, node);
    } else {
      dropZoneHostsRef.current.delete(id);
    }
  }, []);

  const refreshDropZones = useCallback((after?: () => void) => {
    const entries = Array.from(dropZoneHostsRef.current.entries());
    if (entries.length === 0) {
      dropZonesRef.current = [];
      after?.();
      return;
    }
    let remaining = entries.length;
    const next: DropZoneRect[] = [];
    entries.forEach(([id, node]) => {
      node.measureInWindow((_x, y, _w, height) => {
        next.push({ id, y, height });
        remaining -= 1;
        if (remaining <= 0) {
          dropZonesRef.current = next;
          after?.();
        }
      });
    });
  }, []);

  const handleDragStart = useCallback(
    (task: Task) => {
      draggingTaskIdRef.current = task.id;
      setDraggingTaskId(task.id);
      setScrollEnabled(false);
      setHoverDropId(undefined);
      if (task.groupId) {
        setExpandedGroupIds((prev) => new Set(prev).add(task.groupId!));
      }
      // 展開後レイアウトを待ってからゾーン再計測
      requestAnimationFrame(() => {
        refreshDropZones();
      });
    },
    [refreshDropZones]
  );

  const handleDragMove = useCallback((pageX: number, pageY: number) => {
    if (pageX < 0 || pageY < 0) {
      setHoverDropId(undefined);
      return;
    }
    setHoverDropId(resolveDropTarget(pageY, dropZonesRef.current));
  }, []);

  const handleDragEnd = useCallback(
    (pageX: number, pageY: number) => {
      const taskId = draggingTaskIdRef.current;
      draggingTaskIdRef.current = null;
      setDraggingTaskId(null);
      setScrollEnabled(true);
      setHoverDropId(undefined);
      if (!taskId || pageX < 0 || pageY < 0) {
        return;
      }
      refreshDropZones(() => {
        const target = resolveDropTarget(pageY, dropZonesRef.current);
        if (target === undefined) {
          return;
        }
        const task = getRecurringTasks().find((item) => item.id === taskId);
        if (!task) {
          return;
        }
        const nextGroupId = target;
        if ((task.groupId ?? null) === nextGroupId) {
          return;
        }
        setTaskGroupId(taskId, nextGroupId);
        setExpandedGroupIds((prev) => new Set(prev).add(nextGroupId));
        reload();
      });
    },
    [refreshDropZones, reload]
  );

  const renderRecurringRow = (task: Task, showCheckbox: boolean, indented = false) => (
    <RecurringTaskRow
      key={task.id}
      task={task}
      showCheckbox={showCheckbox}
      indented={indented}
      todayYmd={todayYmd}
      content={content}
      dragEnabled={segment === 'recurring'}
      onOpen={() => router.push({ pathname: '/task-detail', params: { taskId: task.id } })}
      onToggle={() => toggleRecurring(task)}
      onLongPressDelete={() => confirmDelete(task)}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    />
  );

  const renderGroupHeader = (
    group: TaskGroup,
    members: Task[],
    options: { expanded: boolean; childSource?: Task[] }
  ) => {
    const dates = getTasksCompletionDatesUnion(members.map((m) => m.id));
    const progress = countGroupDueProgress(members, new Date(), isTaskCompletedOn);
    const meta = formatGroupListMeta(dates, progress, new Date());
    const children = options.childSource ?? members;
    const showChildren = options.expanded;
    const isHover = draggingTaskId != null && hoverDropId === group.id;

    return (
      <View
        key={group.id}
        ref={(node) => setDropZoneHost(group.id, node)}
        onLayout={() => refreshDropZones()}
        style={[
          styles.groupBlock,
          isHover
            ? {
                borderRadius: 12,
                borderWidth: 2,
                borderColor: content.contentText,
                backgroundColor: content.contentPersonTagBg,
                padding: 4,
                marginHorizontal: -4,
              }
            : null,
        ]}
      >
        <Pressable
          style={[
            styles.row,
            styles.groupHeaderRow,
            {
              backgroundColor: content.contentPersonTagBg,
              borderColor: content.contentText,
            },
            isHover ? styles.groupHeaderRowHover : null,
          ]}
          onPress={() => toggleExpanded(group.id)}
          onLongPress={() => openGroupScreen(group)}
        >
          <View style={styles.checkboxHit}>
            <Ionicons name="layers-outline" size={22} color={content.contentText} />
          </View>
          <View style={styles.rowMain}>
            <Text style={[styles.rowTitle, contentTextStyle(content)]}>{group.title}</Text>
            {meta ? (
              <Text style={[styles.rowMeta, contentMutedTextStyle(content)]}>{meta}</Text>
            ) : null}
            <TaskRecentSevenDayDots completedOnSet={dates} content={content} compact />
            {isHover ? (
              <Text style={[styles.dropHint, contentTextStyle(content)]}>ここにドロップ</Text>
            ) : null}
          </View>
          <View style={styles.checkboxHit}>
            <Ionicons
              name={options.expanded ? 'chevron-down' : 'chevron-forward'}
              size={20}
              color={content.contentTextSecondary}
            />
          </View>
        </Pressable>
        {showChildren
          ? children.map((task) =>
              renderRecurringRow(task, isRecurringDueOnDate(task, new Date()), true)
            )
          : null}
      </View>
    );
  };

  const renderTemporaryRow = (task: Task, completed = false) => {
    const eventTitle = task.eventId ? getEvent(task.eventId)?.title : null;
    return (
      <Pressable
        key={task.id}
        style={[
          styles.row,
          contentSurfaceStyle(content),
          { borderWidth: 1, borderRadius: 10 },
          completed ? styles.completedTemporaryRow : null,
        ]}
        onPress={() => router.push({ pathname: '/task-edit', params: { taskId: task.id } })}
        onLongPress={() => confirmDelete(task)}
      >
        {completed ? (
          <View style={styles.checkboxHit}>
            <Ionicons name="checkbox" size={26} color={checkedColor} />
          </View>
        ) : (
          <Pressable
            style={styles.checkboxHit}
            onPress={() => completeTemp(task)}
            accessibilityLabel="完了にする"
          >
            <Ionicons name="square-outline" size={26} color={content.contentTextSecondary} />
          </Pressable>
        )}
        <View style={styles.rowMain}>
          <Text
            style={[
              styles.rowTitle,
              contentTextStyle(content),
              completed ? styles.completedTemporaryTitle : null,
            ]}
          >
            {task.title}
          </Text>
          <Text style={[styles.rowMeta, contentMutedTextStyle(content)]}>
            {task.dueDate ? `期限 ${task.dueDate}` : '期限なし'}
            {eventTitle ? ` · ${eventTitle}` : ''}
            {completed && task.completedAt ? ` · 完了 ${task.completedAt.slice(0, 10)}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <ListScreenTemplate
      fab={
        <>
          <Pressable
            style={[
              styles.infoButton,
              contentSurfaceStyle(content),
              { borderColor: content.contentBorder },
            ]}
            onPress={() => setHelpVisible(true)}
            accessibilityLabel="使い方"
            accessibilityRole="button"
          >
            <Ionicons name="information-circle-outline" size={26} color={content.contentText} />
          </Pressable>
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
        </>
      }
    >
      <ScrollView
        scrollEnabled={scrollEnabled}
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
            {todayBundles.length === 0 && todayUngrouped.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                今日の定期タスクはありません
              </Text>
            ) : (
              <>
                {todayBundles.map((bundle) =>
                  renderGroupHeader(bundle.group, bundle.members, {
                    expanded: expandedGroupIds.has(bundle.group.id),
                    childSource: bundle.dueMembers,
                  })
                )}
                {todayUngrouped.map((task) => renderRecurringRow(task, true))}
              </>
            )}
            <Text style={[styles.sectionTitle, contentTextStyle(content)]}>臨時（未完了）</Text>
            {temporary.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                未完了の臨時タスクはありません
              </Text>
            ) : (
              temporary.map(renderTemporaryRow)
            )}
            <View style={[styles.completedDivider, { backgroundColor: content.contentBorder }]} />
            <Text style={[styles.sectionTitle, styles.completedSectionTitle, contentMutedTextStyle(content)]}>
              完了済み
            </Text>
            {completedTemporary.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                完了済みの臨時タスクはありません
              </Text>
            ) : (
              completedTemporary.map((task) => renderTemporaryRow(task, true))
            )}
          </View>
        ) : null}

        {segment === 'recurring' ? (
          <View style={styles.section}>
            {bundles.length === 0 && ungrouped.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>定期タスクがありません</Text>
            ) : (
              <>
                {bundles.map((bundle) =>
                  renderGroupHeader(bundle.group, bundle.members, {
                    expanded: expandedGroupIds.has(bundle.group.id) || draggingTaskId != null,
                  })
                )}
                {ungrouped.map((task) =>
                  renderRecurringRow(task, isRecurringDueOnDate(task, new Date()))
                )}
              </>
            )}
          </View>
        ) : null}

        {segment === 'temporary' ? (
          <View style={styles.section}>
            {temporary.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                未完了の臨時タスクはありません
              </Text>
            ) : (
              temporary.map(renderTemporaryRow)
            )}
            <View style={[styles.completedDivider, { backgroundColor: content.contentBorder }]} />
            <Text style={[styles.sectionTitle, styles.completedSectionTitle, contentMutedTextStyle(content)]}>
              完了済み
            </Text>
            {completedTemporary.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                完了済みの臨時タスクはありません
              </Text>
            ) : (
              completedTemporary.map((task) => renderTemporaryRow(task, true))
            )}
          </View>
        ) : null}
      </ScrollView>

      {helpVisible ? (
        <Modal
          transparent
          animationType="fade"
          visible={helpVisible}
          onRequestClose={() => setHelpVisible(false)}
        >
          <View style={styles.helpOverlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setHelpVisible(false)} />
            <View style={[styles.helpCard, contentSurfaceStyle(content)]}>
              <Text style={[styles.helpTitle, contentTextStyle(content)]}>タスクの使い方</Text>
              <Text style={[styles.helpBody, contentMutedTextStyle(content)]}>
                ・今日 / 定期 / 臨時タブで一覧を切り替えます。{'\n'}
                ・定期タスクはチェックでその日の実施を記録します。{'\n'}
                ・グループはくくりです。編集画面でグループを付けられます。{'\n'}
                ・今日・定期タブでグループ行をタップすると、中のタスクを開閉できます。{'\n'}
                ・グループ行を長押しすると、グループ画面（実施履歴・タスク追加）を開けます。{'\n'}
                ・定期タブでタスクを長押しし、グループ（中のタスク行含む）へドロップすると所属を変えられます。{'\n'}
                ・グループ内のどれかを実施すると、その日はグループも「実施」扱いになります。
              </Text>
              <Pressable style={styles.helpClose} onPress={() => setHelpVisible(false)}>
                <Text style={[styles.helpCloseText, contentTextStyle(content)]}>閉じる</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
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
  infoButton: {
    position: 'absolute',
    left: 14,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
  groupBlock: {
    gap: 6,
  },
  groupHeaderRow: {
    borderWidth: 2.5,
    borderRadius: 10,
  },
  groupHeaderRowHover: {
    borderWidth: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  rowIndented: {
    marginLeft: 18,
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
  completedDivider: {
    height: 1,
    marginTop: 10,
    marginBottom: 2,
  },
  completedSectionTitle: {
    marginTop: 0,
  },
  completedTemporaryRow: {
    opacity: 0.62,
  },
  completedTemporaryTitle: {
    textDecorationLine: 'line-through',
  },
  dropHint: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  helpOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  helpCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  helpTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  helpBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  helpClose: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  helpCloseText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
