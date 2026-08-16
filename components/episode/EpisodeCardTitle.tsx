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
  /** 自動生成後に未記載のとき、タイトル横へ（未記入）を付ける */
  unfilled?: boolean;
};

export function EpisodeCardTitle({
  title,
  multiline = false,
  fillRow = true,
  unfilled = false,
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
      <View
        style={[
          styles.episodeCardTitleUnderline,
          { borderBottomColor: content.contentBorder },
          unfilled ? styles.episodeCardTitleUnderlineFill : null,
        ]}
      >
        <View style={styles.episodeCardTitleRow}>
          <Text
            style={[
              styles.episodeCardTitle,
              { color: content.contentText },
              multiline ? null : styles.episodeCardTitleSingleLine,
              styles.episodeCardTitleText,
            ]}
            numberOfLines={multiline ? undefined : 1}
          >
            {displayTitle}
          </Text>
          {unfilled ? (
            <Text
              style={[
                styles.episodeCardUnfilled,
                { color: content.contentTextSecondary },
                multiline ? null : styles.episodeCardTitleSingleLine,
              ]}
              numberOfLines={1}
            >
              （未記入）
            </Text>
          ) : null}
        </View>
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
  episodeCardTitleUnderlineFill: {
    alignSelf: 'stretch',
  },
  episodeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  episodeCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    maxWidth: '100%',
  },
  episodeCardTitleText: {
    flexShrink: 1,
    minWidth: 0,
  },
  episodeCardUnfilled: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  /** 一覧カード: TITLE_ROW_HEIGHT(23) = line 18 + underline pad 4 + border 1 */
  episodeCardTitleSingleLine: {
    lineHeight: 18,
  },
});
