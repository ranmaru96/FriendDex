import { Text, VStack } from '@expo/ui/swift-ui';
import { font, padding } from '@expo/ui/swift-ui/modifiers';
import { Platform } from 'react-native';
import { createWidget } from 'expo-widgets';

type RecordWidgetProps = {
  label: string;
};

const RecordWidgetView = (props: RecordWidgetProps) => {
  'widget';
  const label = props.label || '記録';
  return (
    <VStack alignment="leading" modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{label}</Text>
    </VStack>
  );
};

const unavailableWidget = {
  updateTimeline(_entries: { date: Date; props: RecordWidgetProps }[]) {},
  updateSnapshot(_props: RecordWidgetProps) {},
  reload() {},
};

export const RecordWidget =
  Platform.OS === 'ios'
    ? (() => {
        try {
          return createWidget<RecordWidgetProps>('RecordWidget', RecordWidgetView);
        } catch {
          return unavailableWidget;
        }
      })()
    : unavailableWidget;
