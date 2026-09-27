import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Radius, Typography } from '@/constants/theme';
import { contentInputStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

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
};

export function SlidingSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: SlidingSegmentedControlProps<T>) {
  const content = useContentColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const segmentWidth = options.length > 0 && trackWidth > 0 ? trackWidth / options.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withTiming(selectedIndex * segmentWidth, { duration: 180 });
  }, [offset, segmentWidth, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View
      style={[styles.track, compact ? styles.trackCompact : null, contentInputStyle(content), { borderColor: content.contentBorder }]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { width: segmentWidth, backgroundColor: content.contentText },
            indicatorStyle,
          ]}
        />
      ) : null}
      {options.slice(1).map((option, index) => (
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
              style={[styles.segment, compact ? styles.segmentCompact : null]}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.label,
                  contentTextStyle(content),
                  selected ? { color: content.contentCard } : null,
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
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
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
  label: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
});
