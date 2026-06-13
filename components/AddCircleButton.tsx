import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const BUTTON_SIZE = 36;
const GLYPH_SIZE = 22;

type AddCircleButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AddCircleButton({
  onPress,
  disabled = false,
  accessibilityLabel = '追加',
  style,
}: AddCircleButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        style,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <View style={styles.glyph}>
        <Text style={styles.glyphText}>＋</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: '#565656',
    backgroundColor: '#B3B3B3',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.42,
    shadowRadius: 7,
    elevation: 9,
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
  glyph: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: {
    fontSize: GLYPH_SIZE,
    fontWeight: '900',
    color: '#565656',
    includeFontPadding: false,
  },
});
