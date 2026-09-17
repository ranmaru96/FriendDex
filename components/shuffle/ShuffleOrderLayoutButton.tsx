import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useContentColors } from '@/utils/useContentColors';
import type { ShuffleOrderLayout } from '@/utils/shuffleSession';

type ShuffleOrderLayoutButtonProps = {
  layout: ShuffleOrderLayout;
  onChange: (next: ShuffleOrderLayout) => void;
};

export function ShuffleOrderLayoutButton({
  layout,
  onChange,
}: ShuffleOrderLayoutButtonProps) {
  const content = useContentColors();
  const isSplit = layout === 'split';
  const next: ShuffleOrderLayout = isSplit ? 'wrap' : 'split';

  return (
    <Pressable
      style={styles.button}
      onPress={() => onChange(next)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        isSplit
          ? '左右半分表示。タップで折り返し表示'
          : '折り返し表示。タップで左右半分表示'
      }
    >
      <Ionicons
        name={isSplit ? 'pause-outline' : 'apps-outline'}
        size={20}
        color={content.contentTextSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
