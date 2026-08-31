import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Radius, Typography } from '@/constants/theme';
import { getEventCalendarColor } from '@/utils/calendarEventColors';
import { useContentColors } from '@/utils/useContentColors';

type EpisodeTagChipProps = {
  label: string;
  /** 共通項目画面と同じ塗り・文字色。省略時はテーマから推定 */
  chipStyle?: {
    backgroundColor: string;
    color: string;
  };
  /** event=カレンダー色ドット / location=場所タグ（色なし） */
  variant?: 'event' | 'location';
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * 共通項目「予定タグ」と同じ見た目：登録色の枠＋色ドット＋ラベル。
 * 場所タグは色ドットなしの枠チップ。
 */
export function EpisodeTagChip({
  label,
  chipStyle,
  variant = 'event',
  numberOfLines = 1,
  style,
  textStyle,
}: EpisodeTagChipProps) {
  const content = useContentColors();
  const isLocation = variant === 'location';
  const tagColor = isLocation ? content.contentBorder : getEventCalendarColor(label);

  const resolved =
    chipStyle ?? {
      backgroundColor: 'transparent',
      color: content.contentTextSecondary,
    };

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: resolved.backgroundColor,
          borderColor: tagColor,
        },
        isLocation ? styles.locationChip : null,
        style,
      ]}
    >
      {isLocation ? null : <View style={[styles.colorDot, { backgroundColor: tagColor }]} />}
      <Text style={[styles.text, { color: resolved.color }, textStyle]} numberOfLines={numberOfLines}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
  locationChip: {
    borderWidth: 1.5,
  },
  colorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: Typography.sm,
    fontWeight: '500',
  },
});
