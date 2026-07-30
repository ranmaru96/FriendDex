import { StyleSheet, Text, View } from 'react-native';
import { useContentColors } from '@/utils/useContentColors';

type EpisodeCardTitleProps = {
  title: string;
  /** 詳細画面など：折り返して全文表示 */
  multiline?: boolean;
  /**
   * 横並び行で残り幅を埋める（一覧クラシック行用）。
   * 写真右レイアウトの縦積みでは false にして、固定高さ時にタイトル〜日付の隙間が開かないようにする。
   */
  fillRow?: boolean;
};

export function EpisodeCardTitle({
  title,
  multiline = false,
  fillRow = true,
}: EpisodeCardTitleProps) {
  const content = useContentColors();
  const displayTitle = title.trim() || '-';

  return (
    <View
      style={[
        fillRow ? styles.episodeCardTitleWrap : styles.episodeCardTitleWrapStacked,
        multiline ? styles.episodeCardTitleWrapMultiline : null,
      ]}
    >
      <View style={[styles.episodeCardTitleUnderline, { borderBottomColor: content.contentBorder }]}>
        <Text
          style={[styles.episodeCardTitle, { color: content.contentText }]}
          numberOfLines={multiline ? undefined : 1}
        >
          {displayTitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  episodeCardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  episodeCardTitleWrapStacked: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  episodeCardTitleWrapMultiline: {
    flex: undefined,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  episodeCardTitleUnderline: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  episodeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
});
