import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

type PickerDoneOverlayProps = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

/** Date/time spinner 枠の右下に重ねる完了。親の高さには含めない。 */
export function PickerDoneOverlay({
  onPress,
  style,
  textStyle,
  accessibilityLabel = '完了',
}: PickerDoneOverlayProps) {
  return (
    <Pressable
      style={[styles.button, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.text, textStyle]}>完了</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    zIndex: 2,
    elevation: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  text: {
    fontWeight: '600',
    fontSize: 13,
  },
});
