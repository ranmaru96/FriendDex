import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import { contentMutedTextStyle, contentSurfaceStyle } from '@/utils/contentStyleHelpers';

/**
 * 未清算リストと清算済みリストの境目。
 * 見出しではなく「ここから下が完了分」のしきい線として見せる。
 */
export function SettlementSettledDivider() {
  const content = useContentColors();

  return (
    <View style={styles.root} accessibilityRole="header" accessibilityLabel="ここから下は清算済み">
      <View style={[styles.rule, { backgroundColor: content.contentDivider }]} />
      <View style={[styles.badge, contentSurfaceStyle(content)]}>
        <Ionicons name="checkmark-circle" size={14} color={content.contentTextSecondary} />
        <Text style={[styles.label, contentMutedTextStyle(content)]}>清算済み</Text>
      </View>
      <View style={[styles.rule, { backgroundColor: content.contentDivider }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: Typography.sm,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
