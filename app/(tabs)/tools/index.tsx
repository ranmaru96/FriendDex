import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
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
    title: 'お金貸し借り管理',
    description:
      'グループ精算と、グループ不要の個別貸し借り登録。清算タブで会ごと・人ごとの精算を確認できます。',
    icon: 'cash-outline',
    route: '/settlement',
  },
  {
    id: 'shuffle',
    title: '人物カードシャッフル',
    description:
      '人物の集団を保存して、ランダム選択・役割分担・チーム分けに使います。',
    icon: 'shuffle-outline',
    route: '/shuffle',
  },
  {
    id: 'relationship-map',
    title: '相関図作成',
    description: '人物をグリッド上に配置して、関係を整理する相関図を作成します。',
    icon: 'git-network-outline',
    route: '/relationship-map',
  },
  {
    id: 'want-to-visit',
    title: '行ってみたい・食べてみたい場所',
    description: '行きたい場所と食べたい店を記録して、あとから見返せます。',
    icon: 'location-outline',
    route: '/wishlist',
  },
  {
    id: 'your-answer',
    title: 'あなたの～は？',
    description: '質問ごとに、人物の回答を記録します。',
    icon: 'chatbubble-ellipses-outline',
    route: '/your-answer',
  },
];

export default function ToolsScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const content = useContentColors();
  const isCodex = usesOffsetChrome(useAppThemeOptional()?.patternId);

  const openTool = (entry: ToolEntry) => {
    if (!entry.route) {
      return;
    }
    router.push(entry.route);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: kit.listScreenPaddingHorizontal },
        ]}
      >
        {kit.toolScreenShowSubtitle ? (
          <Text style={[styles.screenSubtitle, contentMutedTextStyle(content)]}>
            便利ツールをここにまとめます
          </Text>
        ) : null}

        {TOOL_ENTRIES.map((entry) => {
          const card = (
              <Pressable
                style={[
                  styles.toolCard,
                  isCodex
                    ? null
                    : [
                        contentSurfaceStyle(content),
                        { borderRadius: kit.toolScreenCardBorderRadius, borderWidth: 1 },
                      ],
                ]}
                disabled={!entry.route}
                onPress={() => openTool(entry)}
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
          );
          return isCodex ? (
            <OffsetCard key={entry.id} brackets>
              {card}
            </OffsetCard>
          ) : (
            <View key={entry.id}>{card}</View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Spacing.lg,
    paddingBottom: 100,
    gap: Spacing.md,
  },
  screenSubtitle: {
    fontSize: 13,
    marginBottom: Spacing.xs,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
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
