import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** 設定見出しのアイコン幅。ラベル以外の中身はこの分だけ右へずらす。 */
export const SETTINGS_ICON_SIZE = 20;
export const SETTINGS_CONTENT_LEFT = 16 + SETTINGS_ICON_SIZE;

export function SettingsSectionLabel({
  icon,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={SETTINGS_ICON_SIZE} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  label: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
  },
});
