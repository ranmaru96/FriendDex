import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { usesOffsetChrome } from '@/constants/designPatterns';
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
  /** 中央の記号。省略時 ＋ */
  glyph?: string;
};

export function AddCircleButton({
  onPress,
  disabled = false,
  accessibilityLabel = '追加',
  style,
  size = DEFAULT_SIZE,
  glyph = '＋',
}: AddCircleButtonProps) {
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const offsetChrome = usesOffsetChrome(appTheme?.patternId);
  const fill = content.contentCard;
  const ink = content.contentText;
  const glyphSize = Math.round(size * (22 / 36));

  if (offsetChrome && appTheme) {
    const { shape, patternColors } = appTheme;
    const offset = shape.offsetDistance;
    const radius = shape.innerRadius;
    const borderWidth = shape.cardBorderWidth;
    return (
      <View
        style={[
          styles.offsetWrap,
          offset > 0 ? { width: size + offset, height: size + offset } : { width: size, height: size },
          style,
        ]}
      >
        <View style={{ width: size, height: size }}>
          {offset > 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.offsetFill,
                {
                  top: offset,
                  left: offset,
                  width: size,
                  height: size,
                  borderRadius: radius,
                  backgroundColor: patternColors.offset,
                },
              ]}
            />
          ) : null}
          <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            hitSlop={size < 32 ? 6 : 0}
            style={({ pressed }) => [
              {
                width: size,
                height: size,
                borderRadius: radius,
                borderWidth,
                borderColor: ink,
                backgroundColor: fill,
                alignItems: 'center',
                justifyContent: 'center',
              },
              disabled && styles.buttonDisabled,
              pressed && !disabled && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.glyphText, { color: ink, fontSize: glyphSize }]}>{glyph}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
          borderColor: ink,
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
        <Text style={[styles.glyphText, { color: ink, fontSize: glyphSize }]}>{glyph}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  offsetWrap: {
    overflow: 'visible',
  },
  offsetFill: {
    position: 'absolute',
  },
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
