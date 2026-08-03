import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useContentColors } from '@/utils/useContentColors';

const DEFAULT_SIZE = 36;

type AddCircleButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** 直径。省略時 36 */
  size?: number;
};

export function AddCircleButton({
  onPress,
  disabled = false,
  accessibilityLabel = '追加',
  style,
  size = DEFAULT_SIZE,
}: AddCircleButtonProps) {
  const appTheme = useAppThemeOptional();
  const content = useContentColors();
  const isBlack = appTheme?.variant === 'black';
  const fill = isBlack ? content.contentCard : '#FFFFFF';
  const ink = isBlack ? content.contentText : '#565656';
  const border = isBlack ? content.contentText : '#2f2f2f';
  const glyphSize = Math.round(size * (22 / 36));
  const borderWidth = size < 32 ? 1.5 : 2;

  return (
    <Pressable
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: size < 32 ? 1 : 2 },
          shadowOpacity: size < 32 ? 0.18 : 0.28,
          shadowRadius: size < 32 ? 2 : 4,
          elevation: size < 32 ? 3 : 5,
          backgroundColor: fill,
          borderColor: border,
        },
        style,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={size < 32 ? 6 : 0}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text
          style={[
            styles.glyphText,
            { color: ink, fontSize: glyphSize },
          ]}
        >
          ＋
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  glyphText: {
    fontWeight: '900',
    includeFontPadding: false,
  },
});
