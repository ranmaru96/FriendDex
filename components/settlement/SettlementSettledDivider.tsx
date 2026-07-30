import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing, Theme, Typography } from '@/constants/theme';

/**
 * 未清算リストと清算済みリストの境目。
 * 見出しではなく「ここから下が完了分」のしきい線として見せる。
 */
export function SettlementSettledDivider() {
  return (
    <View style={styles.root} accessibilityRole="header" accessibilityLabel="ここから下は清算済み">
      <View style={styles.rule} />
      <View style={styles.badge}>
        <Ionicons name="checkmark-circle" size={14} color={Theme.textSecondary} />
        <Text style={styles.label}>清算済み</Text>
      </View>
      <View style={styles.rule} />
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
    backgroundColor: Theme.border,
    borderRadius: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Theme.borderSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  label: {
    fontSize: Typography.sm,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Theme.textSecondary,
  },
});
