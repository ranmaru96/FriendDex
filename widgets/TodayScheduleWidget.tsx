import { Button, HStack, Image, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  background,
  buttonStyle,
  containerBackground,
  containerRelativeFrame,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  clipShape,
  padding,
  shapes,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type TodayScheduleWidgetProps = {
  dateLabel: string;
  openUrl: string;
  eventCount: number;
  taskCount: number;
  screenTaskCount: number;
  eventTime0: string;
  eventTitle0: string;
  eventTime1: string;
  eventTitle1: string;
  eventTime2: string;
  eventTitle2: string;
  eventTime3: string;
  eventTitle3: string;
  eventTime4: string;
  eventTitle4: string;
  taskKind0: string;
  taskTitle0: string;
  taskKind1: string;
  taskTitle1: string;
  taskKind2: string;
  taskTitle2: string;
  taskRows: string;
};

const TodayScheduleWidgetView = (
  props: TodayScheduleWidgetProps,
  environment: WidgetEnvironment
) => {
  'widget';
  const isDark = environment.colorScheme === 'dark';
  const useCustomColor =
    !environment.widgetRenderingMode || environment.widgetRenderingMode === 'fullColor';
  const textColor = isDark ? '#F2F2F2' : '#111111';
  const mutedColor = isDark ? '#A8A8A8' : '#6B7280';
  const scheduleColor = '#4E9A87';
  const taskColor = '#dc2626';
  const textModifiers = useCustomColor ? [foregroundStyle(textColor)] : [];
  const events = [
    { time: props.eventTime0, title: props.eventTitle0 },
    { time: props.eventTime1, title: props.eventTitle1 },
    { time: props.eventTime2, title: props.eventTitle2 },
    { time: props.eventTime3, title: props.eventTitle3 },
    { time: props.eventTime4, title: props.eventTitle4 },
  ].filter((event) => event.title.length > 0);
  const taskRows = (props.taskRows ?? '')
    .split(String.fromCharCode(10))
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split(String.fromCharCode(9));
      return {
        required: parts[0] === '1',
        done: parts[1] === '1',
        title: parts[2] ?? '',
        due: parts[3] ?? '',
        id: parts[4] ?? '',
        pendingAt: parts[5] ?? '',
      };
    })
    .filter((task) => task.title.length > 0);
  const holdMs = 10000;
  const nowMs = Date.now();
  const openTaskRows = taskRows.filter((task) => {
    if (!task.done) {
      return true;
    }
    const pendingAt = Number(task.pendingAt || '0');
    return pendingAt > 0 && nowMs < pendingAt + holdMs;
  });
  const toggleTaskRow = (taskId = '') => {
    const nl = String.fromCharCode(10);
    const tab = String.fromCharCode(9);
    const stamped = String(Date.now());
    const next = (props.taskRows ?? '')
      .split(nl)
      .map((line) => {
        const parts = line.split(tab);
        if ((parts[4] ?? '') !== taskId) {
          return line;
        }
        if (parts[1] === '1') {
          parts[1] = '0';
          parts[5] = '';
        } else {
          parts[1] = '1';
          parts[5] = stamped;
        }
        return parts.join(tab);
      })
      .join(nl);
    return { taskRows: next };
  };
  const tasks = [
    { kind: props.taskKind0, title: props.taskTitle0 },
    { kind: props.taskKind1, title: props.taskTitle1 },
    { kind: props.taskKind2, title: props.taskTitle2 },
  ].filter((task) => task.title.length > 0);
  const clock = new Date();
  const todayMd = String(clock.getMonth() + 1) + '/' + String(clock.getDate());
  const taskFill = isDark ? '#222224' : '#E4E4E8';
  const lineColor = isDark ? '#5C5C60' : '#D1D5DB';
  const fillWidth = frame({ maxWidth: 1000, alignment: 'leading' });
  const halfColumn = containerRelativeFrame({
    axes: 'horizontal',
    count: 2,
    span: 1,
    spacing: 28,
    alignment: 'topLeading',
  });
  const eventCardModifiers = [padding({ vertical: 2 }), fillWidth];
  const eventMarkModifiers = [
    ...(useCustomColor ? [foregroundStyle(scheduleColor)] : []),
    frame({ width: 3, height: 28 }),
    clipShape('capsule'),
  ];
  const taskCardModifiers = [
    fillWidth,
    ...(useCustomColor ? [background(taskFill, shapes.capsule())] : []),
  ];
  const widgetBackground = {
    type: 'linearGradient',
    colors: isDark ? ['#2C2C2E', '#242426', '#1C1C1E'] : ['#FFFFFF', '#F2F2F7'],
    startPoint: { x: 0.5, y: 0 },
    endPoint: { x: 0.5, y: 1 },
  };
  const widgetBackgroundModifiers = useCustomColor
    ? [containerBackground(widgetBackground, 'widget')]
    : [];

  if (environment.widgetFamily === 'systemMedium') {
    const mediumEvents = events.slice(0, 3);
    const occupiedEventSlots = mediumEvents.length === 0 ? 1 : mediumEvents.length;
    const leftTaskRoom = occupiedEventSlots >= 3 ? 0 : occupiedEventSlots === 2 ? 1 : 2;
    const leftTasks = openTaskRows.slice(0, leftTaskRoom);
    const rightTasks = openTaskRows.slice(leftTaskRoom, leftTaskRoom + 4);
    const shownTaskCount = leftTasks.length + rightTasks.length;
    const moreEvents = props.eventCount > mediumEvents.length;
    const moreTodayTasks = openTaskRows.some(
      (task, index) => task.required && !task.done && index >= shownTaskCount
    );
    return (
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[
          padding({ all: 12 }),
          containerRelativeFrame({ axes: 'both', alignment: 'topLeading' }),
          widgetURL(props.openUrl),
          ...widgetBackgroundModifiers,
        ]}
      >
        <HStack alignment="top" spacing={6}>
          <VStack alignment="leading" spacing={4} modifiers={[fixedSize({ horizontal: true, vertical: false })]}>
            <Text modifiers={[font({ size: 14, weight: 'bold' }), lineLimit(1), ...textModifiers]}>
              {props.dateLabel}
            </Text>
            <Rectangle
              modifiers={[
                ...(useCustomColor ? [foregroundStyle(lineColor)] : []),
                frame({ height: 1 }),
              ]}
            />
          </VStack>
          {moreEvents ? (
            <HStack alignment="center" spacing={1}>
              <Image
                systemName="calendar"
                size={13}
                color={useCustomColor ? scheduleColor : undefined}
              />
              <Text
                modifiers={[
                  font({ size: 13, weight: 'bold' }),
                  ...(useCustomColor ? [foregroundStyle(scheduleColor)] : []),
                ]}
              >
                +
              </Text>
            </HStack>
          ) : null}
          {moreTodayTasks ? (
            <HStack alignment="center" spacing={1}>
              <Image
                systemName="checklist"
                size={13}
                color={useCustomColor ? scheduleColor : undefined}
              />
              <Text
                modifiers={[
                  font({ size: 13, weight: 'bold' }),
                  ...(useCustomColor ? [foregroundStyle(taskColor)] : []),
                ]}
              >
                +
              </Text>
            </HStack>
          ) : null}
        </HStack>
        <HStack alignment="top" spacing={4}>
          <VStack alignment="leading" spacing={4} modifiers={[halfColumn]}>
            {mediumEvents.length === 0 ? (
              <Text
                modifiers={[
                  font({ size: 13, weight: 'regular' }),
                  lineLimit(1),
                  frame({ minHeight: 38, maxWidth: 1000, alignment: 'leading' }),
                  ...(useCustomColor ? [foregroundStyle(mutedColor)] : []),
                ]}
              >
                予定なし
              </Text>
            ) : null}
            {mediumEvents.map((event) => (
              <HStack key={event.time + event.title} alignment="center" spacing={8} modifiers={eventCardModifiers}>
                <Rectangle modifiers={eventMarkModifiers} />
                <Image
                  systemName="calendar"
                  size={14}
                  color={useCustomColor ? scheduleColor : undefined}
                />
                <VStack alignment="leading" spacing={1}>
                  <Text
                    modifiers={[
                      font({ size: 12, weight: 'bold' }),
                      lineLimit(1),
                      ...textModifiers,
                    ]}
                  >
                    {event.title}
                  </Text>
                  {event.time.length > 0 ? (
                    <Text
                      modifiers={[
                        font({ size: 11, weight: 'regular' }),
                        lineLimit(1),
                        ...(useCustomColor ? [foregroundStyle(scheduleColor)] : []),
                      ]}
                    >
                      {event.time}
                    </Text>
                  ) : null}
                </VStack>
              </HStack>
            ))}
            {leftTasks.map((task) => (
              <ZStack key={task.id + task.title} alignment="center" modifiers={taskCardModifiers}>
                <HStack
                  alignment="center"
                  spacing={4}
                  modifiers={[padding({ horizontal: 10, vertical: 4 }), fillWidth]}
                >
                  <Button
                    target={'task:' + task.id}
                    modifiers={[
                      buttonStyle('plain'),
                      ...(useCustomColor ? [tint(scheduleColor)] : []),
                    ]}
                    onPress={() => toggleTaskRow(task.id)}
                  >
                    <Image
                      systemName="checklist"
                      size={14}
                      color={useCustomColor ? scheduleColor : undefined}
                    />
                  </Button>
                  <Text modifiers={[font({ size: 13, weight: 'bold' }), lineLimit(1), ...textModifiers]}>
                    {task.title}
                  </Text>
                  {task.due.length > 0 ? <Spacer minLength={4} /> : null}
                  {task.due.length > 0 ? (
                    <Text
                      modifiers={[
                        font({ size: 11, weight: 'regular' }),
                        lineLimit(1),
                        layoutPriority(1),
                        ...(useCustomColor
                          ? [foregroundStyle(task.due === todayMd ? taskColor : mutedColor)]
                          : []),
                      ]}
                    >
                      {task.due}
                    </Text>
                  ) : null}
                </HStack>
                {task.done ? (
                  <Rectangle
                    modifiers={[
                      ...(useCustomColor ? [foregroundStyle(textColor)] : []),
                      frame({ height: 1.5 }),
                      padding({ horizontal: 12 }),
                    ]}
                  />
                ) : null}
              </ZStack>
            ))}
          </VStack>
          <VStack alignment="leading" spacing={4} modifiers={[halfColumn]}>
            {rightTasks.map((task) => (
              <ZStack key={task.id + task.title} alignment="center" modifiers={taskCardModifiers}>
                <HStack
                  alignment="center"
                  spacing={4}
                  modifiers={[padding({ horizontal: 10, vertical: 4 }), fillWidth]}
                >
                  <Button
                    target={'task:' + task.id}
                    modifiers={[
                      buttonStyle('plain'),
                      ...(useCustomColor ? [tint(scheduleColor)] : []),
                    ]}
                    onPress={() => toggleTaskRow(task.id)}
                  >
                    <Image
                      systemName="checklist"
                      size={14}
                      color={useCustomColor ? scheduleColor : undefined}
                    />
                  </Button>
                  <Text modifiers={[font({ size: 13, weight: 'bold' }), lineLimit(1), ...textModifiers]}>
                    {task.title}
                  </Text>
                  {task.due.length > 0 ? <Spacer minLength={4} /> : null}
                  {task.due.length > 0 ? (
                    <Text
                      modifiers={[
                        font({ size: 11, weight: 'regular' }),
                        lineLimit(1),
                        layoutPriority(1),
                        ...(useCustomColor
                          ? [foregroundStyle(task.due === todayMd ? taskColor : mutedColor)]
                          : []),
                      ]}
                    >
                      {task.due}
                    </Text>
                  ) : null}
                </HStack>
                {task.done ? (
                  <Rectangle
                    modifiers={[
                      ...(useCustomColor ? [foregroundStyle(textColor)] : []),
                      frame({ height: 1.5 }),
                      padding({ horizontal: 12 }),
                    ]}
                  />
                ) : null}
              </ZStack>
            ))}
          </VStack>
        </HStack>
      </VStack>
    );
  }

  if (environment.widgetFamily === 'systemSmall') {
    const eventCap = openTaskRows.length > 0 ? 2 : 3;
    let eventShown = Math.min(events.length, eventCap);
    const occupiedEventSlots = eventShown === 0 ? 1 : eventShown;
    let taskShown = occupiedEventSlots >= 2 ? 1 : occupiedEventSlots === 1 ? 2 : 4;
    taskShown = Math.min(openTaskRows.length, taskShown);
    const moreEvents = props.eventCount > eventShown;
    const moreTodayTasks = openTaskRows.some(
      (task, index) => task.required && !task.done && index >= taskShown
    );
    const smallEvents = events.slice(0, eventShown);
    const smallTasks = openTaskRows.slice(0, taskShown);
    return (
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[
          padding({ all: 12 }),
          containerRelativeFrame({ axes: 'both', alignment: 'topLeading' }),
          widgetURL(props.openUrl),
          ...widgetBackgroundModifiers,
        ]}
      >
        <HStack alignment="top" spacing={6}>
          <VStack alignment="leading" spacing={4} modifiers={[fixedSize({ horizontal: true, vertical: false })]}>
            <Text modifiers={[font({ size: 14, weight: 'bold' }), lineLimit(1), ...textModifiers]}>
              {props.dateLabel}
            </Text>
            <Rectangle
              modifiers={[
                ...(useCustomColor ? [foregroundStyle(lineColor)] : []),
                frame({ height: 1 }),
              ]}
            />
          </VStack>
          {moreEvents ? (
            <HStack alignment="center" spacing={1}>
              <Image
                systemName="calendar"
                size={13}
                color={useCustomColor ? scheduleColor : undefined}
              />
              <Text
                modifiers={[
                  font({ size: 13, weight: 'bold' }),
                  ...(useCustomColor ? [foregroundStyle(scheduleColor)] : []),
                ]}
              >
                +
              </Text>
            </HStack>
          ) : null}
          {moreTodayTasks ? (
            <HStack alignment="center" spacing={1}>
              <Image
                systemName="checklist"
                size={13}
                color={useCustomColor ? scheduleColor : undefined}
              />
              <Text
                modifiers={[
                  font({ size: 13, weight: 'bold' }),
                  ...(useCustomColor ? [foregroundStyle(taskColor)] : []),
                ]}
              >
                +
              </Text>
            </HStack>
          ) : null}
        </HStack>
        <VStack alignment="leading" spacing={4}>
          {smallEvents.length === 0 ? (
            <Text
              modifiers={[
                font({ size: 13, weight: 'regular' }),
                lineLimit(1),
                frame({ minHeight: 38, maxWidth: 1000, alignment: 'leading' }),
                ...(useCustomColor ? [foregroundStyle(mutedColor)] : []),
              ]}
            >
              予定なし
            </Text>
          ) : null}
          {smallEvents.map((event) => (
            <HStack key={event.time + event.title} alignment="center" spacing={8} modifiers={eventCardModifiers}>
              <Rectangle modifiers={eventMarkModifiers} />
              <Image
                systemName="calendar"
                size={14}
                color={useCustomColor ? scheduleColor : undefined}
              />
              <VStack alignment="leading" spacing={1}>
                <Text
                  modifiers={[
                    font({ size: 12, weight: 'bold' }),
                    lineLimit(1),
                    ...textModifiers,
                  ]}
                >
                  {event.title}
                </Text>
                {event.time.length > 0 ? (
                  <Text
                    modifiers={[
                      font({ size: 11, weight: 'regular' }),
                      lineLimit(1),
                      ...(useCustomColor ? [foregroundStyle(scheduleColor)] : []),
                    ]}
                  >
                    {event.time}
                  </Text>
                ) : null}
              </VStack>
            </HStack>
          ))}
          {smallTasks.map((task) => (
            <ZStack key={task.id + task.title} alignment="center" modifiers={taskCardModifiers}>
              <HStack
                alignment="center"
                spacing={4}
                modifiers={[padding({ horizontal: 10, vertical: 4 }), fillWidth]}
              >
                <Button
                  target={'task:' + task.id}
                  modifiers={[
                    buttonStyle('plain'),
                    ...(useCustomColor ? [tint(scheduleColor)] : []),
                  ]}
                  onPress={() => toggleTaskRow(task.id)}
                >
                  <Image
                    systemName="checklist"
                    size={14}
                    color={useCustomColor ? scheduleColor : undefined}
                  />
                </Button>
                <Text modifiers={[font({ size: 13, weight: 'bold' }), lineLimit(1), ...textModifiers]}>
                  {task.title}
                </Text>
                {task.due.length > 0 ? <Spacer minLength={4} /> : null}
                {task.due.length > 0 ? (
                  <Text
                    modifiers={[
                      font({ size: 11, weight: 'regular' }),
                      lineLimit(1),
                      layoutPriority(1),
                      ...(useCustomColor
                        ? [foregroundStyle(task.due === todayMd ? taskColor : mutedColor)]
                        : []),
                    ]}
                  >
                    {task.due}
                  </Text>
                ) : null}
              </HStack>
              {task.done ? (
                <Rectangle
                  modifiers={[
                    ...(useCustomColor ? [foregroundStyle(textColor)] : []),
                    frame({ height: 1.5 }),
                    padding({ horizontal: 12 }),
                  ]}
                />
              ) : null}
            </ZStack>
            ))}
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[padding({ all: 2 }), widgetURL(props.openUrl), ...widgetBackgroundModifiers]}
    >
      <HStack alignment="center" spacing={4}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), ...textModifiers]}>
          {props.dateLabel}
        </Text>
        <Image
          systemName="calendar"
          size={14}
          color={useCustomColor ? scheduleColor : undefined}
        />
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), ...textModifiers]}>
          {String(props.eventCount)}
        </Text>
        <Image
          systemName="checklist"
          size={14}
          color={useCustomColor ? scheduleColor : undefined}
          modifiers={[padding({ leading: 8 })]}
        />
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), ...textModifiers]}>
          {String(props.taskCount)}
        </Text>
      </HStack>
      {events.slice(0, 3).map((event) => (
        <HStack key={`${event.time}-${event.title}`} alignment="center" spacing={4}>
          <Image
            systemName="calendar"
            size={12}
            color={useCustomColor ? scheduleColor : undefined}
          />
          <Text
            modifiers={[
              font({ size: 12, weight: 'semibold' }),
              ...(useCustomColor ? [foregroundStyle(scheduleColor)] : []),
            ]}
          >
            {event.time}
          </Text>
          <Text
            modifiers={[
              font({ size: 13 }),
              lineLimit(1),
              layoutPriority(1),
              ...textModifiers,
            ]}
          >
            {event.title}
          </Text>
        </HStack>
      ))}
      {tasks.length > 0 ? (
        <HStack alignment="center" spacing={8}>
          {tasks.map((task) => (
            <HStack key={`${task.kind}-${task.title}`} alignment="center" spacing={3}>
              <Image
                systemName="checklist"
                size={12}
                color={useCustomColor ? scheduleColor : undefined}
              />
              <Text modifiers={[font({ size: 12 }), lineLimit(1), ...textModifiers]}>{task.title}</Text>
            </HStack>
          ))}
        </HStack>
      ) : null}
    </VStack>
  );
};

const unavailableWidget = {
  updateTimeline(_entries: { date: Date; props: TodayScheduleWidgetProps }[]) {},
  updateSnapshot(_props: TodayScheduleWidgetProps) {},
  reload() {},
};

export const TodayScheduleWidget =
  Platform.OS === 'ios'
    ? (() => {
        try {
          return createWidget<TodayScheduleWidgetProps>(
            'TodayScheduleWidget',
            TodayScheduleWidgetView
          );
        } catch {
          return unavailableWidget;
        }
      })()
    : unavailableWidget;
