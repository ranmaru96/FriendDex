import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { EpisodeCardTitle } from '@/components/episode/EpisodeCardTitle';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { Radius, Theme } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';
import type { EpisodeVisibilityMode } from '@/types';
import {
  formatEpisodeDateForCard,
  getVisibilityModeLabel,
  normalizeEpisodeTag,
  type ParticipantChipDisplay,
} from '@/utils/episodeHelpers';

const PHOTO_WIDTH = 88;
const PHOTO_ASPECT = 4 / 3;

const EPISODE_VISIBILITY_MODE_TAG_STYLES: Record<
  EpisodeVisibilityMode,
  { tag: object; text: object }
> = {
  private: {
    tag: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#aaaaaa' },
    text: { color: '#666666' },
  },
  public: {
    tag: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#2a9d5a' },
    text: { color: '#1a6b38' },
  },
  limited: {
    tag: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#7c5cbf' },
    text: { color: '#5c3a9f' },
  },
};

export type EpisodeListCardProps = {
  title: string;
  date: string;
  episodeTag?: string | null;
  chips: ParticipantChipDisplay[];
  visibility?: string[];
  visibilityMode?: EpisodeVisibilityMode;
  /** 他人の投稿のとき表示する公開者名（visibilityMode 未指定時のみ有効） */
  posterName?: string | null;
  coverPhotoUri?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  /** 詳細画面など親パネル内に埋め込むとき（外枠・角丸なし） */
  embedded?: boolean;
  /** タイトルを折り返して全文表示（エピソード詳細ページ用） */
  titleMultiline?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function EpisodeListCard({
  title,
  date,
  episodeTag,
  chips,
  visibility = [],
  visibilityMode,
  posterName,
  coverPhotoUri,
  onPress,
  onLongPress,
  delayLongPress = 300,
  onEdit,
  onDelete,
  embedded = false,
  titleMultiline = false,
  style,
}: EpisodeListCardProps) {
  const kit = useUiKit();
  const [tallPhotoLeftHeight, setTallPhotoLeftHeight] = useState(0);
  const usePhotoLayout = kit.episodeListCardLayout === 'photoRight';
  const modeStyles = visibilityMode ? EPISODE_VISIBILITY_MODE_TAG_STYLES[visibilityMode] : null;
  const normalizedEpisodeTag = normalizeEpisodeTag(episodeTag);
  const normalizedPosterName = posterName?.trim() ? posterName.trim() : null;
  const showPosterName = visibilityMode == null && normalizedPosterName != null;

  if (usePhotoLayout) {
    const hasPhoto = Boolean(coverPhotoUri?.trim());
    const hasParticipants = chips.length > 0;

    const cardRadius = embedded ? 0 : kit.episodeListCardBorderRadius;
    const photoSpanRows = embedded ? 2 : kit.episodeListPhotoSpanRows;
    const useTallPhoto = hasPhoto && photoSpanRows >= 3;
    const tallPhotoHeight = tallPhotoLeftHeight > 0 ? tallPhotoLeftHeight : PHOTO_WIDTH / PHOTO_ASPECT;
    const tallPhotoWidth = tallPhotoHeight * PHOTO_ASPECT;

    const photoRightMetaRow = (
      <View style={styles.photoRightMetaRow}>
        <Text style={styles.episodeCardDateText}>{formatEpisodeDateForCard(date)}</Text>
        {normalizedEpisodeTag ? (
          <View style={styles.episodeCategoryTag}>
            <Text style={styles.episodeCategoryTagText} numberOfLines={1}>
              {normalizedEpisodeTag}
            </Text>
          </View>
        ) : null}
        {visibilityMode != null && modeStyles ? (
          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, modeStyles.tag]}>
            <Text style={[styles.episodeParticipantTagName, modeStyles.text]}>
              {getVisibilityModeLabel(visibilityMode)}
            </Text>
          </View>
        ) : showPosterName ? (
          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag]}>
            <Text style={styles.episodeParticipantTagName} numberOfLines={1}>
              {normalizedPosterName}
            </Text>
          </View>
        ) : null}
      </View>
    );

    const titleMetaBlock = (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        disabled={!onPress && !onLongPress}
        style={({ pressed }) => [
          useTallPhoto ? null : styles.photoRightTopLeft,
          titleMultiline ? styles.photoRightTopLeftMultiline : null,
          pressed && (onPress || onLongPress) ? styles.photoRightPressablePressed : null,
        ]}
      >
        <EpisodeCardTitle title={title} multiline={titleMultiline} />
        {photoRightMetaRow}
      </Pressable>
    );

    const participantBlock = hasParticipants ? (
      <View
        style={[
          styles.photoRightParticipantRow,
          useTallPhoto ? styles.photoRightParticipantRowInColumn : null,
        ]}
      >
        <ParticipantChipList chips={chips} layout="scroll" compact />
      </View>
    ) : null;

    const photoBlock = hasPhoto ? (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        disabled={!onPress && !onLongPress}
        style={({ pressed }) => [
          useTallPhoto ? styles.photoRightPhotoPressableTall : styles.photoRightPhotoPressable,
          pressed && (onPress || onLongPress) ? styles.photoRightPressablePressed : null,
        ]}
      >
        <View
          style={[
            styles.photoRightPhotoFrame,
            useTallPhoto
              ? { width: tallPhotoWidth, height: tallPhotoHeight }
              : styles.photoRightPhotoFrameCompact,
          ]}
        >
          <Image
            source={{ uri: coverPhotoUri! }}
            style={styles.photoRightPhotoImage}
            resizeMode="cover"
          />
        </View>
      </Pressable>
    ) : null;

    const photoRightContent = (
      <View
        style={[
          styles.episodeCard,
          embedded && styles.episodeCardEmbedded,
          !embedded ? { borderRadius: cardRadius } : null,
          style,
        ]}
      >
        {useTallPhoto ? (
          <View style={styles.photoRightBodyRow}>
            <View
              style={styles.photoRightLeftColumn}
              onLayout={(event) => {
                const nextHeight = Math.round(event.nativeEvent.layout.height);
                setTallPhotoLeftHeight((prev) => (prev === nextHeight ? prev : nextHeight));
              }}
            >
              {titleMetaBlock}
              {participantBlock}
            </View>
            {photoBlock}
          </View>
        ) : (
          <>
            <View style={styles.photoRightTopRow}>
              {titleMetaBlock}
              {photoBlock}
            </View>
            {participantBlock}
          </>
        )}
      </View>
    );

    return photoRightContent;
  }

  const showMetaRow2 = visibility.length > 0 || normalizedEpisodeTag != null;

  const cardContent = (
    <View
      style={[
        styles.episodeCard,
        embedded && styles.episodeCardEmbedded,
        !embedded ? { borderRadius: kit.episodeListCardBorderRadius } : null,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        disabled={!onPress && !onLongPress}
        style={({ pressed }) => [
          titleMultiline ? styles.episodeCardRow1Multiline : styles.episodeCardRow1,
          pressed && (onPress || onLongPress) ? styles.photoRightPressablePressed : null,
        ]}
      >
        <EpisodeCardTitle title={title} multiline={titleMultiline} />
        <Text style={styles.episodeCardDateText}>{formatEpisodeDateForCard(date)}</Text>
        {visibilityMode != null && modeStyles ? (
          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, modeStyles.tag]}>
            <Text style={[styles.episodeParticipantTagName, modeStyles.text]}>
              {getVisibilityModeLabel(visibilityMode)}
            </Text>
          </View>
        ) : showPosterName ? (
          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag]}>
            <Text style={styles.episodeParticipantTagName} numberOfLines={1}>
              {normalizedPosterName}
            </Text>
          </View>
        ) : null}
        {onEdit && onDelete ? (
          <View style={styles.episodeCardActions}>
            <Pressable style={styles.episodeCardEditButton} onPress={onEdit} accessibilityLabel="編集">
              <Ionicons name="pencil-outline" size={18} color="#0f172a" />
            </Pressable>
            <Pressable style={styles.episodeCardDeleteButton} onPress={onDelete} accessibilityLabel="削除">
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
            </Pressable>
          </View>
        ) : null}
      </Pressable>
      {showMetaRow2 ? (
        <View style={styles.episodeCardRow2}>
          {normalizedEpisodeTag ? (
            <View style={styles.episodeCategoryTag}>
              <Text style={styles.episodeCategoryTagText}>{normalizedEpisodeTag}</Text>
            </View>
          ) : null}
          {visibilityMode == null && visibility.length > 0 ? (
            <View style={styles.visibilityCol}>
              <Text style={styles.visibilityLabelFixed}>公開先：</Text>
              <View style={styles.visibilityPills}>
                {visibility.map((label, vi) => (
                  <View key={`vis-${vi}-${label}`} style={styles.episodeParticipantTag}>
                    <Text style={styles.episodeParticipantTagName}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {chips.length > 0 ? (
        <View style={styles.episodeParticipantChipList}>
          <ParticipantChipList chips={chips} layout="scroll" compact />
        </View>
      ) : null}
    </View>
  );

  return cardContent;
}

const styles = StyleSheet.create({
  episodeCard: {
    backgroundColor: Theme.bgSurface,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
  },
  episodeCardEmbedded: {
    borderWidth: 0,
    borderRadius: 0,
    marginBottom: 0,
    backgroundColor: 'transparent',
  },
  photoRightTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  photoRightBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  photoRightLeftColumn: {
    flex: 1,
    minWidth: 0,
  },
  photoRightTopLeft: {
    flex: 1,
    minWidth: 0,
  },
  photoRightTopLeftMultiline: {
    flex: undefined,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  photoRightMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  photoRightParticipantRow: {
    marginTop: 6,
    alignSelf: 'stretch',
    minHeight: 28,
  },
  photoRightParticipantRowInColumn: {
    width: '100%',
  },
  photoRightPhotoPressable: {
    flexShrink: 0,
  },
  photoRightPhotoPressableTall: {
    flexShrink: 0,
  },
  photoRightPhotoFrame: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Theme.homeCardPhotoPlaceholder,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
  },
  photoRightPhotoFrameCompact: {
    width: PHOTO_WIDTH,
    aspectRatio: PHOTO_ASPECT,
  },
  photoRightPhotoImage: {
    width: '100%',
    height: '100%',
  },
  photoRightPressablePressed: {
    opacity: 0.75,
  },
  episodeCardRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  episodeCardRow1Multiline: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    marginBottom: 4,
  },
  episodeCardRow2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  episodeCategoryTag: {
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: Theme.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeCategoryTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  episodeCardDateText: {
    fontSize: 12,
    color: '#64748b',
    flexShrink: 0,
  },
  episodeCardActions: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
  },
  episodeParticipantChipList: {
    flex: 1,
    minWidth: 0,
  },
  episodeParticipantTag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#aaaaaa',
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeParticipantTagName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555555',
  },
  visibilityCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    maxWidth: '48%',
    flexShrink: 0,
  },
  visibilityLabelFixed: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  visibilityPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  visibilityModeTag: {
    flexShrink: 0,
  },
  episodeCardEditButton: {
    width: 32,
    height: 32,
    backgroundColor: '#ffffff',
    borderColor: Theme.border,
    borderWidth: 2,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeCardDeleteButton: {
    width: 32,
    height: 32,
    backgroundColor: '#ffffff',
    borderColor: Theme.border,
    borderWidth: 2,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** エピソード詳細トップバー用（screenBase 上の編集・削除ボタン） */
export const episodeDetailTopBarButtonStyles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  button: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Theme.topBarBorder,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDanger: {
    borderColor: 'rgba(252, 165, 165, 0.55)',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
});
