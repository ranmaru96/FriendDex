import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Radius, Typography } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { getEventCalendarColor } from '@/utils/calendarEventColors';

/** 共通項目ブラック時のエピソードタグ塗り（bridgeDetailForAppTheme と揃える） */
const BLACK_EPISODE_TAG_CHIP = {
  backgroundColor: 'transparent',
  color: '#F2F2F2',
} as const;

type EpisodeTagChipProps = {
  label: string;
  /** 共通項目画面と同じ塗り・文字色。省略時はテーマから推定 */
  chipStyle?: {
    backgroundColor: string;
    color: string;
  };
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * 共通項目「エピソードタグ」と同じ見た目：登録色の枠＋色ドット＋ラベル。
 */
export function EpisodeTagChip({
  label,
  chipStyle,
  numberOfLines = 1,
  style,
  textStyle,
}: EpisodeTagChipProps) {
  const appTheme = useAppThemeOptional();
  const tagColor = getEventCalendarColor(label);

  const resolved =
    chipStyle ??
    (appTheme?.variant === 'black'
      ? BLACK_EPISODE_TAG_CHIP
      : { backgroundColor: 'transparent', color: '#888888' });

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: resolved.backgroundColor,
          borderColor: tagColor,
        },
        style,
      ]}
    >
      <View style={[styles.colorDot, { backgroundColor: tagColor }]} />
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
