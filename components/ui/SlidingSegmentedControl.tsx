import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Radius, Typography } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { contentInputStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const RAISED_PAD = 3;

type SlidingSegment<T extends string> = {
  value: T;
  label: string;
};

type SlidingSegmentedControlProps<T extends string> = {
  options: SlidingSegment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 縦幅を約8割にする */
  compact?: boolean;
  /** エピソード画面右上の切り替えと同じ、浮いたつまみ */
  raised?: boolean;
};

export function SlidingSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  raised = false,
}: SlidingSegmentedControlProps<T>) {
  const content = useContentColors();
  const { variant } = useAppTheme();
  const knobIsBlack = variant === 'black';
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const innerWidth = raised ? Math.max(0, trackWidth - RAISED_PAD * 2) : trackWidth;
  const segmentWidth = options.length > 0 && innerWidth > 0 ? innerWidth / options.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withTiming(selectedIndex * segmentWidth, { duration: 180 });
  }, [offset, segmentWidth, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View
      style={[
        styles.track,
        compact ? styles.trackCompact : null,
        raised ? styles.trackRaised : null,
        raised
          ? { backgroundColor: content.contentSwitchTrackOff }
          : contentInputStyle(content),
        raised ? null : { borderColor: content.contentBorder },
      ]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            raised ? styles.raisedKnob : styles.indicator,
            { width: segmentWidth },
            raised
              ? {
                  backgroundColor: knobIsBlack ? '#111111' : content.contentSwitchThumbOff,
                  borderColor: content.contentBorder,
                  ...(knobIsBlack
                    ? {
                        shadowColor: '#FFFFFF',
                        shadowOpacity: 0.35,
                      }
                    : null),
                }
              : { backgroundColor: content.contentText },
            indicatorStyle,
          ]}
        />
      ) : null}
      {raised
        ? null
        : options.slice(1).map((option, index) => (
        <View
          key={`divider-${option.value}`}
          pointerEvents="none"
            style={[
            styles.divider,
            compact ? styles.dividerCompact : null,
            {
              left: segmentWidth * (index + 1),
              backgroundColor: content.contentBorder,
            },
          ]}
        />
      ))}
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={[styles.segment, compact ? styles.segmentCompact : null, raised ? styles.segmentRaised : null]}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.label,
                  contentTextStyle(content),
                  raised
                    ? { color: selected ? (knobIsBlack ? '#FFFFFF' : '#111111') : content.contentText }
                    : selected
                      ? { color: content.contentCard }
                      : null,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    minHeight: 40,
    justifyContent: 'center',
  },
  trackCompact: {
    minHeight: 32,
  },
  trackRaised: {
    borderWidth: 0,
    borderRadius: 16,
    minHeight: 32,
    padding: RAISED_PAD,
    overflow: 'visible',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  raisedKnob: {
    position: 'absolute',
    top: RAISED_PAD,
    bottom: RAISED_PAD,
    left: RAISED_PAD,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 2,
    elevation: 2,
  },
  divider: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    width: StyleSheet.hairlineWidth,
  },
  dividerCompact: {
    top: 6,
    bottom: 6,
  },
  row: {
    flexDirection: 'row',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  segmentCompact: {
    paddingVertical: 6,
  },
  segmentRaised: {
    paddingVertical: 4,
  },
  label: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
});
