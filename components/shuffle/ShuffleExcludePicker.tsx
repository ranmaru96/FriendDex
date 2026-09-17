import { StyleSheet, Text, View } from 'react-native';
import { useContentColors } from '@/utils/useContentColors';
import { contentMutedTextStyle, contentSwitchProps } from '@/utils/contentStyleHelpers';
import { ShuffleSwitch } from './ShuffleSwitch';

type ShuffleExcludeToggleProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ShuffleExcludeToggle({ open, onOpenChange }: ShuffleExcludeToggleProps) {
  const content = useContentColors();
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, contentMutedTextStyle(content)]}>対象外を選ぶ</Text>
      <ShuffleSwitch
        value={open}
        onValueChange={onOpenChange}
        {...contentSwitchProps(content, open)}
        accessibilityLabel="対象外を選ぶ"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
