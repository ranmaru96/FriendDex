import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useContentColors } from '@/utils/useContentColors';
import { nextShuffleResultColumns } from '@/utils/shuffleSession';

type ShuffleColumnsCycleButtonProps = {
  value: number;
  onChange: (next: number) => void;
};

export function ShuffleColumnsCycleButton({
  value,
  onChange,
}: ShuffleColumnsCycleButtonProps) {
  const content = useContentColors();
  const next = nextShuffleResultColumns(value);

  return (
    <Pressable
      style={styles.button}
      onPress={() => onChange(next)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`列数 ${value}。タップで${next}列`}
    >
      <Ionicons name="grid-outline" size={20} color={content.contentTextSecondary} />
      <View style={styles.badge} pointerEvents="none">
        <Text style={[styles.badgeText, { color: content.contentTextSecondary }]}>{value}</Text>
      </View>
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
  badge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    minWidth: 12,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
