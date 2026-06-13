import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, Radius, ScreenHorizontalInset, Spacing } from '@/constants/theme';

export default function CalendarScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.screenTitle}>カレンダー</Text>
        <Text style={styles.screenSubtitle}>予定やエピソードを日付で確認できます（準備中）</Text>

        <View style={styles.placeholderCard}>
          <Ionicons name="calendar-outline" size={28} color="#64748b" />
          <Text style={styles.placeholderText}>カレンダー機能は準備中です</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.screenBase,
  },
  scrollContent: {
    paddingHorizontal: ScreenHorizontalInset,
    paddingTop: Spacing.sm,
    paddingBottom: 100,
    gap: Spacing.md,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#cbd5e1',
    marginBottom: Spacing.xs,
  },
  placeholderCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Theme.bgSurface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    minHeight: 160,
  },
  placeholderText: {
    fontSize: 14,
    color: Theme.textSecondary,
  },
});
