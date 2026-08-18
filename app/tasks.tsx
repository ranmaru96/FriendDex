import { Children, Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { OffsetCard } from '@/components/ui/OffsetCard';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { AddCircleButton } from '@/components/AddCircleButton';
import { ListScreenTemplate } from '@/components/screen-templates';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  completeTemporaryTask,
  deleteTask,
  getAllTaskGroups,
  getCompletedTemporaryTasks,
  getOpenTemporaryTasks,
  getRecurringTasks,
  getTask,
  getTasksByGroupId,
  getTaskCompletionDatesSet,
  getTasksCompletionDatesUnion,
  initializeDatabase,
  isRecurringDoneOn,
  reopenTemporaryTask,
  setRecurringDoneOn,
  setTaskGroupId,
} from '../db';
import type { Task, TaskGroup } from '../types';
import { TASK_GROUP_MEMBER_LIMIT } from '../types';
import {
  formatRecurrenceLabel,
  formatTaskDueDateLabel,
  getRecentGroupScheduledDotItems,
  getRecentScheduledDotItems,
  getTaskDueUrgency,
  isRecurringDueOnDate,
  toYmd,
} from '@/utils/taskHelpers';
import { TaskRecentSevenDayDots, taskCompletionFillColor } from '@/components/task/TaskRecentSevenDayDots';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import {
  countGroupDueProgress,
  formatGroupListMeta,
  getNearestTemporaryGroupDueDate,
  groupTracksCompletions,
  isCompletedOnLocalDay,
  isGroupFreeOnDate,
  isGroupOwnRequiredOnDate,
  isGroupRequiredOnDate,
  isRecurringTaskFree,
  isRecurringTaskRequiredOnDate,
  isTemporaryDueOnOrBefore,
  isTemporaryOpenIncompleteBucket,
  partitionTasksByGroup,
  trackingMembers,
} from '@/utils/taskGroupHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { syncTaskReminders } from '@/utils/taskNotifications';
import { Radius } from '@/constants/theme';
import type { AppThemeContentColorFields } from '@/constants/appThemes/contentColors';

type Segment = 'today' | 'recurring' | 'temporary';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatTasksTodayLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAY_LABELS[date.getDay()]})`;
}

const TASK_ACCENT = {
  required: '#dc2626',
  free: '#eab308',
  incomplete: '#2563eb',
  dim: '#9ca3af',
} as const;

type TaskAccent = (typeof TASK_ACCENT)[keyof typeof TASK_ACCENT];

/** 要対応（赤）枠は他アクセントの倍の太さ */
const accentBorderWidth = (accent: TaskAccent | undefined, showingRed: boolean): number => {
  if (showingRed) return 3;
  if (accent) return 1.5;
  return 1;
};

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

function groupInstanceKey(groupId: string, keySuffix?: string): string {
  return `${groupId}${keySuffix ?? ''}`;
}

function DragGrip({ color }: { color: string }) {
  return (
    <View style={styles.dragGrip} pointerEvents="none" accessibilityElementsHidden>
      <View style={[styles.dragGripDot, { backgroundColor: color }]} />
    </View>
  );
}

function MemberAccentBar({ color, thick }: { color: string; thick?: boolean }) {
  return (
    <View
      style={[
        styles.memberAccentBar,
        thick ? styles.memberAccentBarThick : null,
        { backgroundColor: color },
      ]}
    />
  );
}

function catalogPaceLabel(task: Task): string {
  if (task.kind !== 'recurring') {
    return '';
  }
  if (task.pace === 'unpaced') {
    return 'なし';
  }
  return formatRecurrenceLabel(task.pace, task.recurrenceUnit, task.recurrenceConfig);
}

type RecurringTaskRowProps = {
  task: Task;
  showCheckbox: boolean;
  indented?: boolean;
  muted?: boolean;
  accent?: TaskAccent;
  catalog?: boolean;
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
  muted = false,
  accent,
  catalog = false,
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
  const doneToday = isRecurringDoneOn(task, todayYmd);
  const dates = task.trackCompletions ? getTaskCompletionDatesSet(task.id) : new Set<string>();
  const label = formatRecurrenceLabel(task.pace, task.recurrenceUnit, task.recurrenceConfig);
  const paceBesideTitle = catalog ? catalogPaceLabel(task) : '';
  const appTheme = useAppThemeOptional();
  const isBlack = appTheme?.variant === 'black';
  const isCodex = usesOffsetChrome(appTheme?.patternId);
  const checkedColor = taskCompletionFillColor(Boolean(isBlack));
  const scheduledDays = task.trackCompletions
    ? getRecentScheduledDotItems(task, dates, new Date())
    : [];
  const softDoneLook = !task.trackCompletions && doneToday;
  const dimmed = muted || softDoneLook;
  /** 要対応などでチェック後は枠を赤→チェック色に揃える（muted 対象外はグレーのまま） */
  const borderColor = muted
    ? TASK_ACCENT.dim
    : doneToday
      ? checkedColor
      : accent ?? content.contentBorder;
  const showingRequiredRed = !muted && !doneToday && accent === TASK_ACCENT.required;

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

  const nested = indented;
  const useOffset = isCodex && !nested;
  const showAccentBar = nested && !catalog;
  const accentBarColor = muted
    ? TASK_ACCENT.dim
    : doneToday
      ? checkedColor
      : accent ?? content.contentBorder;

  const inner = (
    <View
      style={[
        styles.row,
        catalog && !nested ? styles.catalogRow : null,
        nested ? styles.catalogNestedRow : useOffset ? null : contentSurfaceStyle(content),
        {
          borderWidth: nested || useOffset ? 0 : catalog || dimmed ? 1 : accentBorderWidth(accent, showingRequiredRed),
          borderRadius: nested || useOffset ? 0 : 10,
          borderColor: catalog ? content.contentBorder : borderColor,
        },
        dimmed ? styles.dimmedBlock : null,
      ]}
    >
      {showAccentBar ? (
        <MemberAccentBar color={accentBarColor} thick={showingRequiredRed} />
      ) : null}
      {catalog ? (
        dragEnabled ? (
          <DragGrip color={content.contentTextSecondary} />
        ) : null
      ) : showCheckbox ? (
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
      ) : dragEnabled ? (
        <DragGrip color={content.contentTextSecondary} />
      ) : null}
      <Pressable
        style={styles.rowPress}
        onPress={onOpen}
        onLongPress={dragEnabled ? undefined : onLongPressDelete}
      >
        <View style={styles.rowMain}>
        <View style={catalog ? styles.catalogTitleRow : null}>
        <Text
          style={[
            styles.rowTitle,
            catalog ? styles.temporaryTitle : null,
            dimmed ? contentMutedTextStyle(content) : contentTextStyle(content),
            softDoneLook ? styles.completedTemporaryTitle : null,
          ]}
          numberOfLines={catalog ? 1 : undefined}
        >
          {task.title}
        </Text>
        {catalog && paceBesideTitle ? (
          <Text style={[styles.rowPaceBeside, contentMutedTextStyle(content)]} numberOfLines={1}>
            {paceBesideTitle}
          </Text>
        ) : null}
        </View>
        {!catalog || scheduledDays.length > 0 ? (
        <View style={styles.dotsMetaRow}>
          <View style={styles.dotsMetaDots}>
            {scheduledDays.length > 0 ? (
              <TaskRecentSevenDayDots days={scheduledDays} content={content} compact />
            ) : null}
          </View>
          {!catalog && label ? (
            <Text style={[styles.rowMetaEnd, contentMutedTextStyle(content)]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </View>
        ) : null}
        </View>
        {catalog ? (
          <View style={styles.checkboxHit} pointerEvents="none">
            <Ionicons name="chevron-forward" size={18} color={content.contentTextSecondary} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  const body = (
    <Animated.View style={animatedStyle}>
      {useOffset ? (
        <OffsetCard borderColor={catalog ? undefined : borderColor}>{inner}</OffsetCard>
      ) : (
        inner
      )}
    </Animated.View>
  );

  if (!dragEnabled) {
    return body;
  }

  return <GestureDetector gesture={pan}>{body}</GestureDetector>;
}

type TemporaryTaskRowProps = {
  task: Task;
  completed?: boolean;
  indented?: boolean;
  accent?: TaskAccent;
  catalog?: boolean;
  content: AppThemeContentColorFields;
  checkedColor: string;
  dragEnabled: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onLongPressDelete: () => void;
  onDragStart: (task: Task) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
};

function TemporaryTaskRow({
  task,
  completed = false,
  indented = false,
  accent,
  catalog = false,
  content,
  checkedColor,
  dragEnabled,
  onOpen,
  onToggle,
  onLongPressDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: TemporaryTaskRowProps) {
  const isCodex = usesOffsetChrome(useAppThemeOptional()?.patternId);
  const memoPreview = task.memo.trim();
  const dueUrgency = task.dueDate ? getTaskDueUrgency(task.dueDate) : null;
  const borderColor = completed ? TASK_ACCENT.dim : accent ?? content.contentBorder;
  const showingRequiredRed = !completed && accent === TASK_ACCENT.required;

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

  const nested = indented;
  const useOffset = isCodex && !nested;
  const showAccentBar = nested && !catalog;
  const accentBarColor = completed ? TASK_ACCENT.dim : accent ?? content.contentBorder;

  const inner = (
    <View
      style={[
        styles.row,
        catalog && !nested ? styles.catalogRow : null,
        nested ? styles.catalogNestedRow : useOffset ? null : contentSurfaceStyle(content),
        {
          borderWidth: nested || useOffset ? 0 : catalog || completed ? 1 : accentBorderWidth(accent, showingRequiredRed),
          borderRadius: nested || useOffset ? 0 : 10,
          borderColor: catalog ? content.contentBorder : borderColor,
        },
        completed && !indented ? styles.dimmedBlock : null,
      ]}
    >
      {showAccentBar ? (
        <MemberAccentBar color={accentBarColor} thick={showingRequiredRed} />
      ) : null}
      {catalog ? (
        dragEnabled ? (
          <DragGrip color={content.contentTextSecondary} />
        ) : null
      ) : (
        <Pressable
          style={styles.checkboxHit}
          onPress={(e) => {
            e.stopPropagation?.();
            onToggle();
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={completed ? '未完了に戻す' : '完了にする'}
        >
          <Ionicons
            name={completed ? 'checkbox' : 'square-outline'}
            size={26}
            color={completed ? TASK_ACCENT.dim : content.contentTextSecondary}
          />
        </Pressable>
      )}
      <Pressable
        style={styles.rowPress}
        onPress={onOpen}
        onLongPress={dragEnabled ? undefined : onLongPressDelete}
      >
        <View style={styles.rowMain}>
        <View style={styles.temporaryTitleRow}>
          <Text
            style={[
              styles.rowTitle,
              styles.temporaryTitle,
              completed ? contentMutedTextStyle(content) : contentTextStyle(content),
              completed ? styles.completedTemporaryTitle : null,
            ]}
            numberOfLines={1}
          >
            {task.title}
          </Text>
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
                  contentMutedTextStyle(content),
                  dueUrgency === 'overdue' ? { color: '#dc2626' } : null,
                  dueUrgency === 'today' ? { color: checkedColor } : null,
                ]}
                numberOfLines={1}
              >
                {formatTaskDueDateLabel(task.dueDate)}
              </Text>
            </View>
          ) : null}
        </View>
        {memoPreview ? (
          <Text style={[styles.rowMeta, contentMutedTextStyle(content)]} numberOfLines={1}>
            {memoPreview}
          </Text>
        ) : null}
        </View>
        {catalog ? (
          <View style={styles.checkboxHit} pointerEvents="none">
            <Ionicons name="chevron-forward" size={18} color={content.contentTextSecondary} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  const body = (
    <Animated.View style={animatedStyle}>
      {useOffset ? (
        <OffsetCard borderColor={catalog ? undefined : borderColor}>{inner}</OffsetCard>
      ) : (
        inner
      )}
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
  const appTheme = useAppThemeOptional();
  const isBlack = appTheme?.variant === 'black';
  const isCodex = usesOffsetChrome(appTheme?.patternId);
  const checkedColor = taskCompletionFillColor(Boolean(isBlack));
  const [segment, setSegment] = useState<Segment>('today');
  const [recurring, setRecurring] = useState<Task[]>([]);
  const [temporary, setTemporary] = useState<Task[]>([]);
  const [completedTemporary, setCompletedTemporary] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [collapsedLibraryGroupIds, setCollapsedLibraryGroupIds] = useState<Set<string>>(new Set());
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

  const recurringGroups = useMemo(
    () => groups.filter((group) => group.kind === 'recurring'),
    [groups]
  );
  const temporaryGroups = useMemo(
    () => groups.filter((group) => group.kind === 'temporary'),
    [groups]
  );

  const { bundles, ungrouped } = useMemo(
    () =>
      partitionTasksByGroup(recurring, recurringGroups, {
        includeEmptyGroups: segment === 'recurring',
      }),
    [recurring, recurringGroups, completionTick, segment]
  );

  const actionRequiredRecurringBundles = useMemo(() => {
    const today = new Date();
    return bundles.filter((bundle) => isGroupRequiredOnDate(bundle.group, bundle.members, today));
  }, [bundles, completionTick]);

  const actionRequiredRecurringUngrouped = useMemo(() => {
    const today = new Date();
    return ungrouped.filter((task) => isRecurringTaskRequiredOnDate(task, today));
  }, [ungrouped, completionTick]);

  const freeRecurringBundles = useMemo(() => {
    const today = new Date();
    return bundles.filter((bundle) => isGroupFreeOnDate(bundle.group, bundle.members, today));
  }, [bundles, completionTick]);

  const freeRecurringUngrouped = useMemo(() => {
    return ungrouped.filter((task) => isRecurringTaskFree(task));
  }, [ungrouped, completionTick]);

  const completedTodayTemporary = useMemo(
    () =>
      completedTemporary.filter((task) => isCompletedOnLocalDay(task.completedAt, todayYmd)),
    [completedTemporary, todayYmd, completionTick]
  );

  const {
    bundles: completedTodayTemporaryBundles,
    ungrouped: completedTodayTemporaryUngrouped,
  } = useMemo(
    () =>
      partitionTasksByGroup(completedTodayTemporary, temporaryGroups, {
        includeEmptyGroups: false,
      }),
    [completedTodayTemporary, temporaryGroups]
  );

  const temporaryGroupTodayProgress = useMemo(() => {
    const openCount = new Map<string, number>();
    for (const task of temporary) {
      const id = task.groupId?.trim();
      if (!id) continue;
      openCount.set(id, (openCount.get(id) ?? 0) + 1);
    }
    const doneCount = new Map<string, number>();
    for (const task of completedTodayTemporary) {
      const id = task.groupId?.trim();
      if (!id) continue;
      doneCount.set(id, (doneCount.get(id) ?? 0) + 1);
    }
    const progress = new Map<string, { done: number; total: number }>();
    for (const id of new Set([...openCount.keys(), ...doneCount.keys()])) {
      const done = doneCount.get(id) ?? 0;
      const open = openCount.get(id) ?? 0;
      progress.set(id, { done, total: done + open });
    }
    return progress;
  }, [temporary, completedTodayTemporary]);

  const {
    bundles: actionRequiredTemporaryBundles,
    ungrouped: actionRequiredTemporaryUngrouped,
  } = useMemo(() => {
    const { bundles: allBundles, ungrouped } = partitionTasksByGroup(temporary, temporaryGroups, {
      includeEmptyGroups: segment === 'temporary',
    });
    const actionBundles = allBundles.filter((bundle) =>
      bundle.members.some((task) => isTemporaryDueOnOrBefore(task, todayYmd))
    );
    return {
      bundles: actionBundles,
      ungrouped: ungrouped.filter((task) => isTemporaryDueOnOrBefore(task, todayYmd)),
    };
  }, [temporary, temporaryGroups, todayYmd, completionTick, segment]);

  const {
    bundles: openIncompleteTemporaryBundles,
    ungrouped: openIncompleteTemporaryUngrouped,
  } = useMemo(() => {
    const actionGroupIds = new Set(
      actionRequiredTemporaryBundles.map((bundle) => bundle.group.id)
    );
    const { bundles: allBundles, ungrouped } = partitionTasksByGroup(temporary, temporaryGroups, {
      includeEmptyGroups: segment === 'temporary',
    });
    return {
      bundles: allBundles.filter((bundle) => !actionGroupIds.has(bundle.group.id)),
      ungrouped: ungrouped.filter((task) => isTemporaryOpenIncompleteBucket(task, todayYmd)),
    };
  }, [
    temporary,
    temporaryGroups,
    actionRequiredTemporaryBundles,
    todayYmd,
    completionTick,
    segment,
  ]);

  const { bundles: libraryTemporaryBundles, ungrouped: libraryTemporaryUngrouped } = useMemo(
    () =>
      partitionTasksByGroup(temporary, temporaryGroups, {
        includeEmptyGroups: segment === 'temporary',
      }),
    [temporary, temporaryGroups, completionTick, segment]
  );

  const {
    bundles: libraryCompletedTemporaryBundles,
    ungrouped: libraryCompletedTemporaryUngrouped,
  } = useMemo(
    () =>
      partitionTasksByGroup(completedTemporary, temporaryGroups, {
        includeEmptyGroups: false,
      }),
    [completedTemporary, temporaryGroups]
  );

  const isLibrary = segment !== 'today';

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

  const toggleLibraryGroupExpanded = (groupId: string) => {
    setCollapsedLibraryGroupIds((prev) => {
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
    const done = isRecurringDoneOn(task, todayYmd);
    setRecurringDoneOn(task, todayYmd, !done);
    void syncTaskReminders();
    reload();
  };

  const toggleTemporary = (task: Task, completed: boolean) => {
    if (completed) {
      reopenTemporaryTask(task.id);
    } else {
      completeTemporaryTask(task.id);
    }
    void syncTaskReminders();
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
          void syncTaskReminders();
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
        setCollapsedLibraryGroupIds((prev) => {
          const next = new Set(prev);
          next.delete(groupInstanceKey(task.groupId!, '-lib'));
          return next;
        });
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
        const task = getTask(taskId);
        if (!task) {
          return;
        }
        const nextGroupId = target;
        if ((task.groupId ?? null) === nextGroupId) {
          return;
        }
        if (nextGroupId) {
          const members = getTasksByGroupId(nextGroupId);
          if (members.length >= TASK_GROUP_MEMBER_LIMIT) {
            Alert.alert('グループ上限', `1つのグループに入れられるタスクは${TASK_GROUP_MEMBER_LIMIT}個までです。`);
            return;
          }
        }
        const ok = setTaskGroupId(taskId, nextGroupId);
        if (!ok) {
          Alert.alert(
            '移動できません',
            'グループに入れられませんでした。上限に達しているか、種別が一致しません。'
          );
          return;
        }
        setCollapsedLibraryGroupIds((prev) => {
          const next = new Set(prev);
          next.delete(groupInstanceKey(nextGroupId, '-lib'));
          return next;
        });
        reload();
        void syncTaskReminders();
      });
    },
    [refreshDropZones, reload]
  );

  const renderRecurringRow = (
    task: Task,
    showCheckbox: boolean,
    indented = false,
    muted = false,
    accent?: TaskAccent
  ) => (
    <RecurringTaskRow
      key={`${task.id}${muted ? '-off' : ''}${accent ?? ''}`}
      task={task}
      showCheckbox={!isLibrary && showCheckbox}
      indented={indented}
      muted={muted}
      accent={isLibrary ? undefined : accent}
      catalog={isLibrary}
      todayYmd={todayYmd}
      content={content}
      dragEnabled={isLibrary && segment === 'recurring'}
      onOpen={() => router.push({ pathname: '/task-detail', params: { taskId: task.id } })}
      onToggle={() => toggleRecurring(task)}
      onLongPressDelete={() => confirmDelete(task)}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    />
  );

  const renderMembersWithRules = (memberNodes: ReactNode, ruleStyle: object) =>
    Children.toArray(memberNodes).map((child, index) => (
      <Fragment key={index}>
        {index > 0 ? (
          <View style={[ruleStyle, { backgroundColor: content.contentBorder }]} />
        ) : null}
        {child}
      </Fragment>
    ));

  const renderLibraryGroupCard = (
    group: TaskGroup,
    members: Task[],
    options: {
      keySuffix?: string;
      registerDropZone?: boolean;
      expanded?: boolean;
      completed?: boolean;
    },
    memberNodes: ReactNode
  ) => {
    const isHover =
      !options.completed && draggingTaskId != null && hoverDropId === group.id;
    const registerDropZone = options.registerDropZone !== false && !options.completed;
    const expanded = options.expanded !== false;
    const showMembers = expanded && members.length > 0;
    const instanceKey = groupInstanceKey(group.id, options.keySuffix);
    return (
      <View
        key={`${group.id}${options.keySuffix ?? ''}`}
        ref={(node) => {
          if (registerDropZone) {
            setDropZoneHost(group.id, node);
          }
        }}
        onLayout={() => {
          if (registerDropZone) {
            refreshDropZones();
          }
        }}
        style={[
          styles.catalogGroupCard,
          contentSurfaceStyle(content),
          { borderColor: content.contentBorder },
          options.completed ? styles.dimmedBlock : null,
          isHover
            ? {
                borderWidth: 2,
                borderColor: content.contentText,
              }
            : null,
          isCodex ? { borderWidth: 0, borderRadius: 0, overflow: 'visible' as const, backgroundColor: 'transparent' } : null,
        ]}
      >
        <Pressable
          style={styles.catalogGroupHeadRow}
          onPress={() => toggleLibraryGroupExpanded(instanceKey)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${group.title}グループを${expanded ? '閉じる' : '開く'}`}
        >
          <View style={styles.checkboxHit}>
            <Ionicons
              name="layers-outline"
              size={20}
              color={
                options.completed ? content.contentTextSecondary : content.contentText
              }
            />
          </View>
          <View style={styles.rowMain}>
            <Text
              style={[
                styles.catalogGroupTitle,
                options.completed ? contentMutedTextStyle(content) : contentTextStyle(content),
                options.completed ? styles.completedTemporaryTitle : null,
              ]}
            >
              {group.title}
            </Text>
            {isHover ? (
              <Text style={[styles.dropHint, contentTextStyle(content)]}>ここにドロップ</Text>
            ) : members.length === 0 ? (
              <Text style={[styles.rowMetaNear, contentMutedTextStyle(content)]}>ドロップで追加</Text>
            ) : !expanded ? (
              <Text style={[styles.rowMetaNear, contentMutedTextStyle(content)]}>
                {members.length}件
              </Text>
            ) : null}
          </View>
          <Pressable
            style={[styles.catalogGroupEditButton, { borderColor: content.contentBorder }]}
            onPress={() => openGroupScreen(group)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${group.title}グループを編集`}
          >
            <Text style={[styles.catalogGroupEdit, contentMutedTextStyle(content)]}>編集</Text>
          </Pressable>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={18}
            color={content.contentTextSecondary}
          />
        </Pressable>
        {showMembers ? (
          <>
            <View style={[styles.catalogGroupRule, { backgroundColor: content.contentBorder }]} />
            <View style={styles.catalogGroupMembers}>
              {renderMembersWithRules(memberNodes, styles.catalogMemberRule)}
            </View>
          </>
        ) : null}
      </View>
    );
    return isCodex ? (
      <OffsetCard key={`${group.id}${options.keySuffix ?? ''}`}>{groupCard}</OffsetCard>
    ) : (
      groupCard
    );
  };

  const renderGroupHeader = (
    group: TaskGroup,
    members: Task[],
    options: {
      expanded: boolean;
      childSource?: Task[];
      muted?: boolean;
      accent?: TaskAccent;
      keySuffix?: string;
      registerDropZone?: boolean;
    }
  ) => {
    const muted = options.muted === true;
    const accent = muted ? TASK_ACCENT.dim : options.accent;
    const today = new Date();
    const trackers = trackingMembers(members);
    const dates = getTasksCompletionDatesUnion(trackers.map((m) => m.id));
    const progress = countGroupDueProgress(members, today, isRecurringDoneOn);
    const individuallyRequired = members.filter((task) =>
      isRecurringTaskRequiredOnDate(task, today)
    );
    /**
     * 要対応グループ枠:
     * - 必須メンバがいれば全員完了で黄緑（自由メンバのチェックだけでは足りない）
     * - 必須メンバがおらずグループ周期のみなら、1件でも完了で黄緑
     */
    let requiredMet = false;
    if (!muted && options.accent === TASK_ACCENT.required) {
      if (individuallyRequired.length > 0) {
        requiredMet = individuallyRequired.every((task) => isRecurringDoneOn(task, todayYmd));
      } else if (isGroupOwnRequiredOnDate(group, today)) {
        requiredMet = members.some((task) => isRecurringDoneOn(task, todayYmd));
      }
    }
    const borderColor = isLibrary
      ? content.contentBorder
      : muted
        ? TASK_ACCENT.dim
        : requiredMet
          ? checkedColor
          : accent ?? content.contentBorder;
    const showingRequiredRed =
      !isLibrary && !muted && !requiredMet && options.accent === TASK_ACCENT.required;
    const meta = muted
      ? members.length === 0
        ? 'ドロップで追加'
        : ''
      : members.length === 0
        ? 'ドロップで追加'
        : formatGroupListMeta(dates, progress, today);
    const children = options.childSource ?? members;
    const showChildren = options.expanded;
    const isHover = draggingTaskId != null && hoverDropId === group.id;
    const registerDropZone = options.registerDropZone !== false;
    const showDots = groupTracksCompletions(members);
    const groupDays = showDots
      ? getRecentGroupScheduledDotItems(trackers, dates, today)
      : [];

    if (isLibrary) {
      return renderLibraryGroupCard(
        group,
        members,
        options,
        members.map((task) => renderRecurringRow(task, false, true, false))
      );
    }

    const memberNodes = showChildren
      ? children.map((task) => {
          const dueToday = isRecurringDueOnDate(task, today);
          let memberAccent = muted ? TASK_ACCENT.dim : accent;
          if (!muted) {
            if (isRecurringTaskRequiredOnDate(task, today)) {
              memberAccent = TASK_ACCENT.required;
            } else if (isRecurringTaskFree(task)) {
              memberAccent = TASK_ACCENT.free;
            }
          }
          return renderRecurringRow(
            task,
            dueToday,
            true,
            muted || !dueToday,
            memberAccent
          );
        })
      : [];

    const groupCard = (
      <View
        key={`${group.id}${options.keySuffix ?? ''}`}
        ref={(node) => {
          if (registerDropZone) {
            setDropZoneHost(group.id, node);
          }
        }}
        onLayout={() => {
          if (registerDropZone) {
            refreshDropZones();
          }
        }}
        style={[
          styles.catalogGroupCard,
          contentSurfaceStyle(content),
          {
            borderWidth: muted ? 1 : accentBorderWidth(accent, showingRequiredRed),
            borderColor,
          },
          muted ? styles.dimmedBlock : null,
          isHover
            ? {
                borderWidth: 2,
                borderColor: content.contentText,
              }
            : null,
          isCodex ? { borderWidth: 0, borderRadius: 0, overflow: 'visible' as const, backgroundColor: 'transparent' } : null,
        ]}
      >
        <Pressable
          style={styles.row}
          onPress={() => toggleExpanded(groupInstanceKey(group.id, options.keySuffix))}
          onLongPress={() => openGroupScreen(group)}
        >
          <View style={styles.checkboxHit}>
            <Ionicons
              name="layers-outline"
              size={22}
              color={muted ? content.contentTextSecondary : content.contentText}
            />
          </View>
          <View style={styles.rowMain}>
            <Text
              style={[
                styles.rowTitle,
                muted ? contentMutedTextStyle(content) : contentTextStyle(content),
              ]}
            >
              {group.title}
            </Text>
            <View style={styles.dotsMetaRowNear}>
              <View style={styles.dotsMetaDots}>
                {groupDays.length > 0 ? (
                  <TaskRecentSevenDayDots days={groupDays} content={content} compact />
                ) : null}
              </View>
              {meta ? (
                <Text style={[styles.rowMetaNear, contentMutedTextStyle(content)]} numberOfLines={1}>
                  {meta}
                </Text>
              ) : null}
            </View>
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
        {memberNodes.length > 0 ? (
          <>
            <View style={[styles.catalogGroupRule, { backgroundColor: content.contentBorder }]} />
            <View style={styles.todayGroupMembers}>
              {renderMembersWithRules(memberNodes, styles.todayMemberRule)}
            </View>
          </>
        ) : null}
      </View>
    );
    return isCodex ? (
      <OffsetCard
        key={`${group.id}${options.keySuffix ?? ''}`}
        borderColor={isHover ? content.contentText : borderColor}
      >
        {groupCard}
      </OffsetCard>
    ) : (
      groupCard
    );
  };

  const renderSectionTitle = (
    label: string,
    barColor: string,
    options?: { muted?: boolean }
  ) => (
    <View style={styles.sectionTitleRow}>
      <View style={[styles.sectionBar, { backgroundColor: barColor }]} />
      <Text
        style={[
          styles.sectionTitle,
          options?.muted ? contentMutedTextStyle(content) : contentTextStyle(content),
        ]}
      >
        {label}
      </Text>
    </View>
  );

  const renderTemporaryRow = (
    task: Task,
    completed = false,
    indented = false,
    accent?: TaskAccent
  ) => (
    <TemporaryTaskRow
      key={task.id}
      task={task}
      completed={completed}
      indented={indented}
      accent={accent}
      catalog={isLibrary}
      content={content}
      checkedColor={checkedColor}
      dragEnabled={isLibrary && segment === 'temporary' && !completed}
      onOpen={() => router.push({ pathname: '/task-detail', params: { taskId: task.id } })}
      onToggle={() => toggleTemporary(task, completed)}
      onLongPressDelete={() => confirmDelete(task)}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    />
  );

  const renderTemporaryGroupHeader = (
    group: TaskGroup,
    members: Task[],
    options: {
      expanded: boolean;
      completed?: boolean;
      accent?: TaskAccent;
      keySuffix?: string;
      registerDropZone?: boolean;
    }
  ) => {
    const completed = options.completed === true;
    const accent = completed ? TASK_ACCENT.dim : options.accent;
    const borderColor = accent ?? content.contentBorder;
    const showingRequiredRed = !completed && options.accent === TASK_ACCENT.required;
    const registerDropZone = options.registerDropZone === true;
    const isHover = !completed && draggingTaskId != null && hoverDropId === group.id;
    const nearestDue = getNearestTemporaryGroupDueDate(members);
    const dueUrgency = nearestDue ? getTaskDueUrgency(nearestDue) : null;
    const progress = temporaryGroupTodayProgress.get(group.id);
    const meta =
      members.length === 0
        ? 'ドロップで追加'
        : !isLibrary && progress && progress.done > 0
          ? `今日 ${progress.done}/${progress.total}`
          : '';

    if (isLibrary) {
      return renderLibraryGroupCard(
        group,
        members,
        options,
        members.map((task) => renderTemporaryRow(task, completed, true))
      );
    }
    const groupCard = (
      <View
        key={`${group.id}${options.keySuffix ?? ''}`}
        ref={(node) => {
          if (registerDropZone) {
            setDropZoneHost(group.id, node);
          }
        }}
        onLayout={() => {
          if (registerDropZone) {
            refreshDropZones();
          }
        }}
        style={[
          styles.catalogGroupCard,
          contentSurfaceStyle(content),
          {
            borderWidth: completed ? 1 : accentBorderWidth(accent, showingRequiredRed),
            borderColor,
          },
          completed ? styles.dimmedBlock : null,
          isHover
            ? {
                borderWidth: 2,
                borderColor: content.contentText,
              }
            : null,
          isCodex ? { borderWidth: 0, borderRadius: 0, overflow: 'visible' as const, backgroundColor: 'transparent' } : null,
        ]}
      >
        <Pressable
          style={styles.row}
          onPress={() => toggleExpanded(groupInstanceKey(group.id, options.keySuffix))}
          onLongPress={() => openGroupScreen(group)}
        >
          <View style={styles.checkboxHit}>
            <Ionicons
              name="layers-outline"
              size={22}
              color={completed ? content.contentTextSecondary : content.contentText}
            />
          </View>
          <View style={styles.rowMain}>
            <View style={styles.temporaryTitleRow}>
              <Text
                style={[
                  styles.rowTitle,
                  styles.temporaryTitle,
                  completed ? contentMutedTextStyle(content) : contentTextStyle(content),
                  completed ? styles.completedTemporaryTitle : null,
                ]}
                numberOfLines={1}
              >
                {group.title}
              </Text>
              {nearestDue && !completed ? (
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
                      contentMutedTextStyle(content),
                      dueUrgency === 'overdue' ? { color: '#dc2626' } : null,
                      dueUrgency === 'today' ? { color: checkedColor } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {formatTaskDueDateLabel(nearestDue)}
                  </Text>
                </View>
              ) : null}
            </View>
            {meta ? (
              <Text style={[styles.rowMetaNear, contentMutedTextStyle(content)]} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
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
        {options.expanded && members.length > 0 ? (
          <>
            <View style={[styles.catalogGroupRule, { backgroundColor: content.contentBorder }]} />
            <View style={styles.todayGroupMembers}>
              {renderMembersWithRules(
                members.map((task) => renderTemporaryRow(task, completed, true, accent)),
                styles.todayMemberRule
              )}
            </View>
          </>
        ) : null}
      </View>
    );
    return isCodex ? (
      <OffsetCard
        key={`${group.id}${options.keySuffix ?? ''}`}
        borderColor={isHover ? content.contentText : borderColor}
      >
        {groupCard}
      </OffsetCard>
    ) : (
      groupCard
    );
  };

  return (
    <ListScreenTemplate
      style={styles.screen}
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
          {isLibrary ? (
            <AddCircleButton
              style={styles.fab}
              onPress={() =>
                router.push({
                  pathname: '/task-edit',
                  params: { kind: segment === 'temporary' ? 'temporary' : 'recurring' },
                })
              }
              accessibilityLabel="タスクを追加"
            />
          ) : null}
        </>
      }
    >
      <View
        style={[
          styles.pageHeader,
          {
            backgroundColor: kit.screenBackground,
            paddingHorizontal: kit.listScreenPaddingHorizontal,
          },
        ]}
      >
        {segment === 'today' ? (
          <View style={styles.todayHeaderRow}>
            <View style={styles.todayTitleCluster}>
              <Text style={[styles.todayTitle, contentTextStyle(content)]} numberOfLines={1}>
                {formatTasksTodayLabel(new Date())}のタスク
              </Text>
            </View>
            <Pressable
              style={[
                styles.todayEditButton,
                {
                  borderColor: content.contentBorder,
                  backgroundColor: content.contentBorder,
                },
              ]}
              onPress={() => setSegment('recurring')}
              accessibilityRole="button"
              accessibilityLabel="タスクの追加・編集"
            >
              <Text style={[styles.todayEditButtonText, contentTextStyle(content)]}>
                タスクの追加・編集
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.libraryBar}>
            <Pressable
              style={styles.libraryBackBtn}
              onPress={() => setSegment('today')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="今日やる事に戻る"
            >
              <Ionicons name="chevron-back" size={22} color={content.contentText} />
            </Pressable>
            <View
              style={[
                styles.librarySegment,
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
                const selected = segment === item.key;
                return (
                  <Pressable
                    key={item.key}
                    style={[
                      styles.librarySegmentItem,
                      selected ? { backgroundColor: content.contentText } : null,
                    ]}
                    onPress={() => setSegment(item.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.label}タスク一覧・編集`}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: selected ? content.contentCard : content.contentTextSecondary,
                        fontWeight: selected ? '700' : '600',
                      }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <View
          style={[
            styles.pageHeaderDivider,
            { backgroundColor: content.contentSearchFieldBorder },
          ]}
        />
      </View>
      <ScrollView
        style={styles.list}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: kit.listScreenPaddingHorizontal, paddingBottom: 100 },
        ]}
      >
        {segment === 'today' ? (
          <View style={styles.section}>
            {renderSectionTitle('要対応', TASK_ACCENT.required)}
            {actionRequiredRecurringBundles.length === 0 &&
            actionRequiredRecurringUngrouped.length === 0 &&
            actionRequiredTemporaryBundles.length === 0 &&
            actionRequiredTemporaryUngrouped.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                要対応のタスクはありません
              </Text>
            ) : (
              <>
                {actionRequiredRecurringBundles.map((bundle) =>
                  renderGroupHeader(bundle.group, bundle.members, {
                    expanded: expandedGroupIds.has(groupInstanceKey(bundle.group.id, '-today-required')),
                    keySuffix: '-today-required',
                    accent: TASK_ACCENT.required,
                  })
                )}
                {actionRequiredRecurringUngrouped.map((task) =>
                  renderRecurringRow(task, true, false, false, TASK_ACCENT.required)
                )}
                {actionRequiredTemporaryBundles.map((bundle) =>
                  renderTemporaryGroupHeader(bundle.group, bundle.members, {
                    expanded: expandedGroupIds.has(groupInstanceKey(bundle.group.id, '-today-action-temp')),
                    keySuffix: '-today-action-temp',
                    accent: TASK_ACCENT.required,
                  })
                )}
                {actionRequiredTemporaryUngrouped.map((task) =>
                  renderTemporaryRow(task, false, false, TASK_ACCENT.required)
                )}
              </>
            )}

            {renderSectionTitle('自由対応', TASK_ACCENT.free)}
            {freeRecurringBundles.length === 0 && freeRecurringUngrouped.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                自由対応のタスクはありません
              </Text>
            ) : (
              <>
                {freeRecurringBundles.map((bundle) =>
                  renderGroupHeader(bundle.group, bundle.members, {
                    expanded: expandedGroupIds.has(groupInstanceKey(bundle.group.id, '-today-free')),
                    keySuffix: '-today-free',
                    accent: TASK_ACCENT.free,
                  })
                )}
                {freeRecurringUngrouped.map((task) =>
                  renderRecurringRow(task, true, false, false, TASK_ACCENT.free)
                )}
              </>
            )}

            {renderSectionTitle('未完了', TASK_ACCENT.incomplete)}
            {openIncompleteTemporaryBundles.length === 0 &&
            openIncompleteTemporaryUngrouped.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                未完了のタスクはありません
              </Text>
            ) : (
              <>
                {openIncompleteTemporaryBundles.map((bundle) =>
                  renderTemporaryGroupHeader(bundle.group, bundle.members, {
                    expanded: expandedGroupIds.has(groupInstanceKey(bundle.group.id, '-today-open')),
                    keySuffix: '-today-open',
                    accent: TASK_ACCENT.incomplete,
                  })
                )}
                {openIncompleteTemporaryUngrouped.map((task) =>
                  renderTemporaryRow(task, false, false, TASK_ACCENT.incomplete)
                )}
              </>
            )}

            <View style={[styles.completedDivider, { backgroundColor: content.contentBorder }]} />
            {renderSectionTitle('完了済み', TASK_ACCENT.dim, { muted: true })}
            {completedTodayTemporary.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                今日完了したタスクはありません
              </Text>
            ) : (
              <>
                {completedTodayTemporaryBundles.map((bundle) =>
                  renderTemporaryGroupHeader(bundle.group, bundle.members, {
                    expanded: expandedGroupIds.has(groupInstanceKey(bundle.group.id, '-today-done-temp')),
                    keySuffix: '-today-done-temp',
                    completed: true,
                    accent: TASK_ACCENT.dim,
                  })
                )}
                {completedTodayTemporaryUngrouped.map((task) =>
                  renderTemporaryRow(task, true, false, TASK_ACCENT.dim)
                )}
              </>
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
                    expanded: !collapsedLibraryGroupIds.has(groupInstanceKey(bundle.group.id, '-lib')),
                    keySuffix: '-lib',
                    registerDropZone: true,
                  })
                )}
                {ungrouped.length > 0 ? (
                  <>
                    {bundles.length > 0 ? (
                      <Text style={[styles.catalogUngroupedTitle, contentMutedTextStyle(content)]}>
                        未所属
                      </Text>
                    ) : null}
                    {ungrouped.map((task) => renderRecurringRow(task, false, false, false))}
                  </>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {segment === 'temporary' ? (
          <View style={styles.section}>
            {temporary.length === 0 &&
            completedTemporary.length === 0 &&
            temporaryGroups.length === 0 ? (
              <Text style={[styles.empty, contentMutedTextStyle(content)]}>
                臨時タスクがありません
              </Text>
            ) : (
              <>
                {libraryTemporaryBundles.map((bundle) =>
                  renderTemporaryGroupHeader(bundle.group, bundle.members, {
                    expanded: !collapsedLibraryGroupIds.has(groupInstanceKey(bundle.group.id, '-lib')),
                    keySuffix: '-lib',
                    registerDropZone: true,
                  })
                )}
                {libraryTemporaryUngrouped.length > 0 ? (
                  <>
                    {libraryTemporaryBundles.length > 0 ? (
                      <Text style={[styles.catalogUngroupedTitle, contentMutedTextStyle(content)]}>
                        未所属
                      </Text>
                    ) : null}
                    {libraryTemporaryUngrouped.map((task) => renderTemporaryRow(task, false, false))}
                  </>
                ) : null}
                {completedTemporary.length > 0 ? (
                  <>
                    <View style={[styles.completedDivider, { backgroundColor: content.contentBorder }]} />
                    {renderSectionTitle('完了済み', TASK_ACCENT.dim, { muted: true })}
                    {libraryCompletedTemporaryBundles.map((bundle) =>
                      renderTemporaryGroupHeader(bundle.group, bundle.members, {
                        expanded: !collapsedLibraryGroupIds.has(
                          groupInstanceKey(bundle.group.id, '-lib-done')
                        ),
                        keySuffix: '-lib-done',
                        completed: true,
                        registerDropZone: false,
                      })
                    )}
                    {libraryCompletedTemporaryUngrouped.map((task) =>
                      renderTemporaryRow(task, true, false, TASK_ACCENT.dim)
                    )}
                  </>
                ) : null}
              </>
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
            {isCodex ? (
              <OffsetCard contentStyle={{ padding: 18, gap: 12 }}>
                <Text style={[styles.helpTitle, contentTextStyle(content)]}>タスクの使い方</Text>
                <Text style={[styles.helpBody, contentMutedTextStyle(content)]}>
                  ・普段の確認・チェックは「今日やる事」で行います。{'\n'}
                  ・右上の「タスクの追加・編集」から定期・臨時を切り替え、追加や並び替えができます。{'\n'}
                  ・今日やる事は要対応 / 自由対応 / 未完了 / 完了済みに分かれます。{'\n'}
                  ・要対応は「期限が今日以前の臨時タスク」と「今日必須の定期タスク」です。{'\n'}
                  ・必須は周期の対象日、自由は周期なし（記録のみ）です。{'\n'}
                  ・グループにも周期を付けられ、メンバー必須との OR でグループ必須になります。{'\n'}
                  ・編集画面のグループ枠をタップすると、名前や周期を編集できます。{'\n'}
                  ・編集画面はチェックなしの一覧です。項目を長押しし、グループへドロップすると所属を変えられます。
                </Text>
                <Pressable style={styles.helpClose} onPress={() => setHelpVisible(false)}>
                  <Text style={[styles.helpCloseText, contentTextStyle(content)]}>閉じる</Text>
                </Pressable>
              </OffsetCard>
            ) : (
            <View style={[styles.helpCard, contentSurfaceStyle(content)]}>
              <Text style={[styles.helpTitle, contentTextStyle(content)]}>タスクの使い方</Text>
              <Text style={[styles.helpBody, contentMutedTextStyle(content)]}>
                ・普段の確認・チェックは「今日やる事」で行います。{'\n'}
                ・右上の「タスクの追加・編集」から定期・臨時を切り替え、追加や並び替えができます。{'\n'}
                ・今日やる事は要対応 / 自由対応 / 未完了 / 完了済みに分かれます。{'\n'}
                ・要対応は「期限が今日以前の臨時タスク」と「今日必須の定期タスク」です。{'\n'}
                ・必須は周期の対象日、自由は周期なし（記録のみ）です。{'\n'}
                ・グループにも周期を付けられ、メンバー必須との OR でグループ必須になります。{'\n'}
                ・編集画面のグループ枠をタップすると、名前や周期を編集できます。{'\n'}
                ・編集画面はチェックなしの一覧です。項目を長押しし、グループへドロップすると所属を変えられます。
              </Text>
              <Pressable style={styles.helpClose} onPress={() => setHelpVisible(false)}>
                <Text style={[styles.helpCloseText, contentTextStyle(content)]}>閉じる</Text>
              </Pressable>
            </View>
            )}
          </View>
        </Modal>
      ) : null}
    </ListScreenTemplate>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 0,
  },
  list: {
    flex: 1,
  },
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
  pageHeader: {
    paddingTop: 8,
  },
  pageHeaderDivider: {
    height: 1,
    marginTop: 10,
    alignSelf: 'stretch',
  },
  todayHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 10,
    rowGap: 8,
  },
  todayTitleCluster: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  todayTitle: {
    fontSize: 20,
    fontWeight: '800',
    flexShrink: 0,
  },
  todayEditButton: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  todayEditButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  libraryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  libraryBackBtn: {
    width: 32,
    height: 36,
    marginLeft: -6,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  librarySegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  librarySegmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogRow: {
    paddingVertical: 12,
  },
  catalogGroupCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  catalogGroupHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 10,
    gap: 2,
  },
  catalogGroupTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  catalogGroupEditButton: {
    marginRight: 14,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 6,
  },
  catalogGroupEdit: {
    fontSize: 13,
    fontWeight: '600',
  },
  catalogGroupRule: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
  },
  catalogGroupMembers: {
    paddingLeft: 12,
    paddingRight: 6,
    paddingBottom: 4,
  },
  catalogMemberRule: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 36,
  },
  catalogNestedRow: {
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  todayGroupMembers: {
    paddingLeft: 4,
    paddingRight: 6,
    paddingBottom: 4,
  },
  todayMemberRule: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  memberAccentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginVertical: 8,
  },
  memberAccentBarThick: {
    width: 5,
  },
  catalogUngroupedTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 2,
  },
  section: {
    gap: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  sectionBar: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 14,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  empty: {
    fontSize: 13,
    lineHeight: 20,
  },
  dimmedBlock: {
    opacity: 0.45,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  rowPress: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkboxHit: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragGrip: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragGripDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.55,
  },
  catalogTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowPaceBeside: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 'auto',
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
  temporaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  temporaryTitle: {
    flex: 1,
    minWidth: 0,
  },
  dueChip: {
    flexShrink: 0,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dueChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dotsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  dotsMetaRowNear: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    marginTop: 2,
  },
  dotsMetaDots: {
    flexGrow: 0,
    flexShrink: 0,
  },
  rowMetaEnd: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    marginLeft: 'auto',
  },
  rowMetaNear: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  rowMeta: {
    fontSize: 12,
  },
  completedDivider: {
    height: 1,
    marginTop: 10,
    marginBottom: 2,
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
