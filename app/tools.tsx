import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

type ToolEntry = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
};

const TOOL_ENTRIES: ToolEntry[] = [
  {
    id: 'settlement',
    title: '清算（新・試作）',
    description:
      'グループ精算の UI 試作版。全員を計算に含め、片方向は相手台帳への反映のみ招待。旧機能は「従来」タブから。',
    icon: 'calculator-outline',
    route: '/settlement',
  },
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
  const content = useContentColors();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: kit.listScreenPaddingHorizontal },
        ]}
      >
        <Text style={[styles.screenTitle, { color: kit.topBarText }]}>ツール</Text>
        {kit.toolScreenShowSubtitle ? (
          <Text style={[styles.screenSubtitle, { color: kit.topBarText, opacity: 0.7 }]}>
            便利ツールをここにまとめます
          </Text>
        ) : null}

        {TOOL_ENTRIES.map((entry) => (
          <Pressable
            key={entry.id}
            style={[
              styles.toolCard,
              contentSurfaceStyle(content),
              { borderRadius: kit.toolScreenCardBorderRadius },
            ]}
            disabled={!entry.route}
            onPress={() => {
              if (entry.route) {
                router.push(entry.route);
              }
            }}
          >
            <View
              style={[
                styles.toolIconWrap,
                contentTagStyle(content),
                { borderRadius: kit.toolScreenIconBorderRadius },
              ]}
            >
              <Ionicons name={entry.icon} size={22} color={content.contentTextSecondary} />
            </View>
            <View style={styles.toolTextWrap}>
              <Text style={[styles.toolTitle, contentTextStyle(content)]}>{entry.title}</Text>
              <Text style={[styles.toolDescription, contentMutedTextStyle(content)]}>
                {entry.description}
              </Text>
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
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    paddingBottom: 100,
    gap: Spacing.md,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  screenSubtitle: {
    fontSize: 13,
    marginBottom: Spacing.xs,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  toolIconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  toolTextWrap: {
    flex: 1,
    gap: 4,
  },
  toolTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  toolDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});
