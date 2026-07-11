import { StyleSheet, Text, View } from 'react-native';

type EpisodeCardTitleProps = {
  title: string;
  /** 詳細画面など：折り返して全文表示 */
  multiline?: boolean;
};

export function EpisodeCardTitle({ title, multiline = false }: EpisodeCardTitleProps) {
  const displayTitle = title.trim() || '-';

  return (
    <View
      style={[styles.episodeCardTitleWrap, multiline ? styles.episodeCardTitleWrapMultiline : null]}
    >
      <View style={styles.episodeCardTitleUnderline}>
        <Text style={styles.episodeCardTitle} numberOfLines={multiline ? undefined : 1}>
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
    borderBottomColor: '#cbd5e1',
  },
  episodeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
});
