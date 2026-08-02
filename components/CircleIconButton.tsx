import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useContentColors } from '@/utils/useContentColors';

const BUTTON_SIZE = 36;

type CircleIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

export function CircleIconButton({
  icon,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
}: CircleIconButtonProps) {
  const appTheme = useAppThemeOptional();
  const content = useContentColors();
  const isBlack = appTheme?.variant === 'black';
  const fill = isBlack ? content.contentCard : '#FFFFFF';
  const ink = isBlack ? content.contentText : '#565656';
  const border = isBlack ? content.contentText : '#2f2f2f';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: fill, borderColor: border },
        style,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color={ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.88,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
});
