import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundStyle,
  layoutPriority,
  lineLimit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type TodayScheduleWidgetProps = {
  dateLabel: string;
  openUrl: string;
  eventCount: number;
  taskCount: number;
  eventTime0: string;
  eventTitle0: string;
  eventTime1: string;
  eventTitle1: string;
  eventTime2: string;
  eventTitle2: string;
  taskKind0: string;
  taskTitle0: string;
  taskKind1: string;
  taskTitle1: string;
  taskKind2: string;
  taskTitle2: string;
};

type TodayScheduleWidgetConfiguration = {
  content: 'schedule' | 'tasks' | 'both' | 'reserve';
};

const TodayScheduleWidgetView = (
  props: TodayScheduleWidgetProps,
  environment: WidgetEnvironment<TodayScheduleWidgetConfiguration>
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
  const content = environment.configuration?.content ?? 'schedule';
  const showEvents = content === 'schedule' || content === 'both';
  const showTasks = content !== 'reserve';
  const events = showEvents
    ? [
        { time: props.eventTime0, title: props.eventTitle0 },
        { time: props.eventTime1, title: props.eventTitle1 },
        { time: props.eventTime2, title: props.eventTitle2 },
      ].filter((event) => event.title.length > 0)
    : [];
  const tasks = showTasks
    ? [
        { kind: props.taskKind0, title: props.taskTitle0 },
        { kind: props.taskKind1, title: props.taskTitle1 },
        { kind: props.taskKind2, title: props.taskTitle2 },
      ].filter((task) => task.title.length > 0)
    : [];

  if (content === 'reserve') {
    return (
      <VStack alignment="leading" modifiers={[padding({ all: 12 }), widgetURL(props.openUrl)]}>
        <Text modifiers={[font({ size: 15 }), ...textModifiers]}>予備</Text>
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 12 }), widgetURL(props.openUrl)]}>
      <HStack alignment="center" spacing={4}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), ...textModifiers]}>
          {props.dateLabel}
        </Text>
        {showEvents ? (
          <Image
            systemName="calendar"
            size={14}
            color={useCustomColor ? scheduleColor : undefined}
          />
        ) : null}
        {showEvents ? (
          <Text modifiers={[font({ size: 14, weight: 'semibold' }), ...textModifiers]}>
            {String(props.eventCount)}
          </Text>
        ) : null}
        {showTasks ? (
          <Image
            systemName="checkmark.square"
            size={14}
            color={useCustomColor ? taskColor : undefined}
            modifiers={[padding({ leading: showEvents ? 8 : 0 })]}
          />
        ) : null}
        {showTasks ? (
          <Text modifiers={[font({ size: 14, weight: 'semibold' }), ...textModifiers]}>
            {String(props.taskCount)}
          </Text>
        ) : null}
      </HStack>
      {events.map((event) => (
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
                systemName={task.kind === 'temporary' ? 'checkmark.square' : 'repeat'}
                size={12}
                color={useCustomColor ? taskColor : undefined}
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
          return createWidget<TodayScheduleWidgetProps, TodayScheduleWidgetConfiguration>(
            'TodayScheduleWidget',
            TodayScheduleWidgetView
          );
        } catch {
          return unavailableWidget;
        }
      })()
    : unavailableWidget;
