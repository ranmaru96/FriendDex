import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type SwitchProps,
} from 'react-native';

const TRACK_WIDTH = 41;
const TRACK_HEIGHT = 25;
const TRACK_PAD = 2;
const THUMB_SIZE = TRACK_HEIGHT - TRACK_PAD * 2;
const THUMB_TRAVEL = TRACK_WIDTH - TRACK_PAD * 2 - THUMB_SIZE;
const TOGGLE_DURATION_MS = 120;

export function ShuffleSwitch({
  value = false,
  onValueChange,
  disabled = false,
  trackColor,
  thumbColor,
  accessibilityLabel,
}: SwitchProps) {
  const offset = useRef(new Animated.Value(value ? THUMB_TRAVEL : 0)).current;

  useEffect(() => {
    Animated.timing(offset, {
      toValue: value ? THUMB_TRAVEL : 0,
      duration: TOGGLE_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [offset, value]);

  const trackBg = value
    ? trackColor?.true ?? '#111111'
    : trackColor?.false ?? '#A8A8A8';
  const knobColor = typeof thumbColor === 'string' && thumbColor.length > 0 ? thumbColor : '#FFFFFF';

  return (
    <Pressable
      onPress={() => {
        if (!disabled) {
          onValueChange?.(!value);
        }
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { backgroundColor: trackBg },
        disabled ? styles.disabled : null,
      ]}
    >
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: knobColor,
            transform: [{ translateX: offset }],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: TRACK_PAD,
    justifyContent: 'center',
    flexShrink: 0,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
  disabled: {
    opacity: 0.4,
  },
});
