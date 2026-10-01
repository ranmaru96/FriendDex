import { Text, VStack } from '@expo/ui/swift-ui';
import { font, padding } from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { createWidget } from 'expo-widgets';

type MemoryWidgetProps = {
  label: string;
};

const MemoryWidgetView = (props: MemoryWidgetProps) => {
  'widget';
  const label = props.label || '思い出';
  return (
    <VStack alignment="leading" modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{label}</Text>
    </VStack>
  );
};

const unavailableWidget = {
  updateTimeline(_entries: { date: Date; props: MemoryWidgetProps }[]) {},
  updateSnapshot(_props: MemoryWidgetProps) {},
  reload() {},
};

export const MemoryWidget =
  Platform.OS === 'ios'
    ? (() => {
        try {
          return createWidget<MemoryWidgetProps>('MemoryWidget', MemoryWidgetView);
        } catch {
          return unavailableWidget;
        }
      })()
    : unavailableWidget;
