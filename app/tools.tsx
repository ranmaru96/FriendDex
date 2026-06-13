import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, Radius, ScreenHorizontalInset, Spacing } from '@/constants/theme';

type ToolEntry = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TOOL_ENTRIES: ToolEntry[] = [
  {
    id: 'shuffle',
    title: '人物カードシャッフル',
    description:
      '登録した人物からランダムに選びます。運転手決め・チーム分け・役割分担などに使えます。（準備中）',
    icon: 'shuffle-outline',
  },
];

export default function ToolsScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.screenTitle}>その他</Text>
        <Text style={styles.screenSubtitle}>便利ツールをここにまとめます</Text>

        {TOOL_ENTRIES.map((entry) => (
          <Pressable key={entry.id} style={styles.toolCard} disabled>
            <View style={styles.toolIconWrap}>
              <Ionicons name={entry.icon} size={22} color="#334155" />
            </View>
            <View style={styles.toolTextWrap}>
              <Text style={styles.toolTitle}>{entry.title}</Text>
              <Text style={styles.toolDescription}>{entry.description}</Text>
            </View>
          </Pressable>
        ))}
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
  toolCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Theme.bgSurface,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    opacity: 0.92,
  },
  toolIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  toolTextWrap: {
    flex: 1,
    gap: 4,
  },
  toolTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  toolDescription: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
});
