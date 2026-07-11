import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Theme, Spacing } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';

type ToolEntry = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
};

const TOOL_ENTRIES: ToolEntry[] = [
  {
    id: 'money-loan',
    title: 'お金貸し借り管理',
    description: 'タイトルごとに貸し借りを登録し、貸・借タブで未返済を一覧できます。',
    icon: 'cash-outline',
    route: '/money-loan',
  },
  {
    id: 'shuffle',
    title: '人物カードシャッフル',
    description:
      '人物の集団を保存して、ランダム選択・役割分担・チーム分けに使います。',
    icon: 'shuffle-outline',
    route: '/shuffle',
  },
];

export default function ToolsScreen() {
  const router = useRouter();
  const kit = useUiKit();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: kit.listScreenPaddingHorizontal },
        ]}
      >
        <Text style={styles.screenTitle}>ツール</Text>
        {kit.toolScreenShowSubtitle ? (
          <Text style={styles.screenSubtitle}>便利ツールをここにまとめます</Text>
        ) : null}

        {TOOL_ENTRIES.map((entry) => (
          <Pressable
            key={entry.id}
            style={[styles.toolCard, { borderRadius: kit.toolScreenCardBorderRadius }]}
            disabled={!entry.route}
            onPress={() => {
              if (entry.route) {
                router.push(entry.route);
              }
            }}
          >
            <View style={[styles.toolIconWrap, { borderRadius: kit.toolScreenIconBorderRadius }]}>
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
    padding: Spacing.md,
  },
  toolIconWrap: {
    width: 40,
    height: 40,
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
