import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
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
  /** 遷移開始が重いとき、カード上にローディングを出す */
  showOpenLoading?: boolean;
};

const TOOL_ENTRIES: ToolEntry[] = [
  {
    id: 'settlement',
    title: 'お金貸し借り管理',
    description:
      'グループ精算と、グループ不要の個別貸し借り登録。清算タブで会ごと・人ごとの精算を確認できます。',
    icon: 'cash-outline',
    route: '/settlement',
    showOpenLoading: true,
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
    description: '近日公開したい',
    icon: 'location-outline',
  },
  {
    id: 'your-answer',
    title: 'あなたの～は？',
    description: '近日公開したい',
    icon: 'chatbubble-ellipses-outline',
  },
];

export default function ToolsScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const content = useContentColors();
  const [openingId, setOpeningId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setOpeningId(null);
    }, [])
  );

  const openTool = (entry: ToolEntry) => {
    if (!entry.route || openingId) return;
    if (entry.showOpenLoading) {
      setOpeningId(entry.id);
      // くるくるを先に描画してから push（遷移開始の遅延でも「押した」が分かる）
      requestAnimationFrame(() => {
        router.push(entry.route!);
      });
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
        <Text style={[styles.screenTitle, contentTextStyle(content)]}>ツール</Text>
        {kit.toolScreenShowSubtitle ? (
          <Text style={[styles.screenSubtitle, contentMutedTextStyle(content)]}>
            便利ツールをここにまとめます
          </Text>
        ) : null}

        {TOOL_ENTRIES.map((entry) => {
          const isOpening = openingId === entry.id;
          return (
            <Pressable
              key={entry.id}
              style={[
                styles.toolCard,
                contentSurfaceStyle(content),
                { borderRadius: kit.toolScreenCardBorderRadius },
                isOpening && styles.toolCardOpening,
              ]}
              disabled={!entry.route || openingId != null}
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
              {isOpening ? (
                <View style={styles.openingOverlay} pointerEvents="none">
                  <View
                    style={[styles.openingOverlayDim, { backgroundColor: kit.screenBackground }]}
                  />
                  <ActivityIndicator color={content.contentTextSecondary} />
                </View>
              ) : null}
            </Pressable>
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
    overflow: 'hidden',
  },
  toolCardOpening: {
    opacity: 0.92,
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
  openingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openingOverlayDim: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
});
