import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import { contentFilledButtonStyle } from '@/utils/contentStyleHelpers';

type ShuffleRunButtonProps = {
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
};

export function ShuffleRunButton({
  onPress,
  accessibilityLabel = 'シャッフル',
  disabled = false,
}: ShuffleRunButtonProps) {
  const content = useContentColors();

  return (
    <Pressable
      style={[
        styles.button,
        contentFilledButtonStyle(content),
        disabled ? styles.buttonDisabled : null,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={4}
    >
      <Ionicons name="shuffle-outline" size={20} color={content.contentCard} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
