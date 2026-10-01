import { Text, VStack } from '@expo/ui/swift-ui';
import { font, padding } from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { createWidget } from 'expo-widgets';

type UpcomingPeopleWidgetProps = {
  label: string;
};

const UpcomingPeopleWidgetView = (props: UpcomingPeopleWidgetProps) => {
  'widget';
  const label = props.label || '近々会う人';
  return (
    <VStack alignment="leading" modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{label}</Text>
    </VStack>
  );
};

const unavailableWidget = {
  updateTimeline(_entries: { date: Date; props: UpcomingPeopleWidgetProps }[]) {},
  updateSnapshot(_props: UpcomingPeopleWidgetProps) {},
  reload() {},
};

export const UpcomingPeopleWidget =
  Platform.OS === 'ios'
    ? (() => {
        try {
          return createWidget<UpcomingPeopleWidgetProps>(
            'UpcomingPeopleWidget',
            UpcomingPeopleWidgetView
          );
        } catch {
          return unavailableWidget;
        }
      })()
    : unavailableWidget;
