import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { EpisodeCardTitle } from '@/components/episode/EpisodeCardTitle';
import { EpisodeTagChip } from '@/components/episode/EpisodeTagChip';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { Radius, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentPersonTagStyle,
  contentTagStyle,
  contentTagTextStyle,
} from '@/utils/contentStyleHelpers';
import type { EpisodeVisibilityMode } from '@/types';
import {
  formatEpisodeDateForCard,
  getVisibilityModeIconColor,
  getVisibilityModeIconName,
  getVisibilityModeLabel,
  normalizeEpisodeTag,
  type ParticipantChipDisplay,
} from '@/utils/episodeHelpers';

const PHOTO_ASPECT = 4 / 3;
const PHOTO_DUAL_GAP = 3;
/** タイトル＋日付メタ行の固定高さ（エピソードタグあり基準） */
const TITLE_META_BLOCK_HEIGHT = 56;
/** コンパクト写真幅（高さ × 4/3） */
const PHOTO_WIDTH = Math.round(TITLE_META_BLOCK_HEIGHT * PHOTO_ASPECT);

function VisibilityModeIcon({ mode }: { mode: EpisodeVisibilityMode }) {
  return (
    <View
      style={styles.visibilityModeIconWrap}
      accessibilityRole="image"
      accessibilityLabel={getVisibilityModeLabel(mode)}
    >
      <Ionicons
        name={getVisibilityModeIconName(mode)}
        size={16}
        color={getVisibilityModeIconColor(mode)}
      />
    </View>
  );
}

export type EpisodeListCardProps = {
  title: string;
  date: string;
  episodeTag?: string | null;
  chips: ParticipantChipDisplay[];
  visibility?: string[];
  visibilityMode?: EpisodeVisibilityMode;
  /** 他人の投稿のとき表示する公開者名（visibilityMode 未指定時のみ有効） */
  posterName?: string | null;
  /** @deprecated photoUris を優先 */
  coverPhotoUri?: string | null;
  /** 一覧カード用写真（最大2枚想定） */
  photoUris?: string[];
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
  photoUris,
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
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const [tallPhotoLeftHeight, setTallPhotoLeftHeight] = useState(0);
  const usePhotoLayout = kit.episodeListCardLayout === 'photoRight';
  const photoFrameBorderColor = 'transparent';
  const episodeCardBackgroundColor =
    appTheme?.variant === 'black' ? '#252525' : content.contentCard;
  const normalizedEpisodeTag = normalizeEpisodeTag(episodeTag);
  const normalizedPosterName = posterName?.trim() ? posterName.trim() : null;
  const showPosterName = visibilityMode == null && normalizedPosterName != null;

  if (usePhotoLayout) {
    const resolvedPhotoUris = (photoUris?.length
      ? photoUris
      : coverPhotoUri?.trim()
        ? [coverPhotoUri.trim()]
        : []
    )
      .map((uri) => uri.trim())
      .filter(Boolean);
    const photoLayout = embedded ? 'compactOne' : kit.episodeListPhotoLayout;
    const displayPhotoUris =
      photoLayout === 'compactTwoSideBySide'
        ? resolvedPhotoUris.slice(0, 2)
        : resolvedPhotoUris.slice(0, 1);
    const hasPhoto = displayPhotoUris.length > 0;
    const hasParticipants = chips.length > 0;

    const cardRadius = embedded ? 0 : kit.episodeListCardBorderRadius;
    const useTallPhoto = hasPhoto && photoLayout === 'tallOne';
    const useDualCompact = hasPhoto && photoLayout === 'compactTwoSideBySide' && displayPhotoUris.length > 1;
    const tallPhotoHeight = tallPhotoLeftHeight > 0 ? tallPhotoLeftHeight : PHOTO_WIDTH / PHOTO_ASPECT;
    const tallPhotoWidth = tallPhotoHeight * PHOTO_ASPECT;

    const photoRightMetaRow = (
      <View style={styles.photoRightMetaRow}>
        <Text style={[styles.episodeCardDateText, { color: content.contentTextSecondary }]}>
          {formatEpisodeDateForCard(date)}
        </Text>
        {normalizedEpisodeTag ? <EpisodeTagChip label={normalizedEpisodeTag} /> : null}
        {visibilityMode != null ? (
          <VisibilityModeIcon mode={visibilityMode} />
        ) : showPosterName ? (
          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, contentPersonTagStyle(content)]}>
            <Text style={[styles.episodeParticipantTagName, contentTagTextStyle(content)]} numberOfLines={1}>
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
          styles.photoRightTopLeft,
          hasParticipants || useTallPhoto ? styles.photoRightTopLeftHug : null,
          titleMultiline ? styles.photoRightTopLeftMultiline : null,
          pressed && (onPress || onLongPress) ? styles.photoRightPressablePressed : null,
        ]}
      >
        <EpisodeCardTitle title={title} multiline={titleMultiline} fillRow={false} />
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
        {useTallPhoto ? (
          <View
            style={[
              styles.photoRightPhotoFrame,
              {
                width: tallPhotoWidth,
                height: tallPhotoHeight,
                borderColor: photoFrameBorderColor,
                backgroundColor: content.contentPhotoPlaceholder,
              },
            ]}
          >
            <Image
              source={{ uri: displayPhotoUris[0] }}
              style={styles.photoRightPhotoImage}
              resizeMode="cover"
            />
          </View>
        ) : useDualCompact ? (
          <View style={styles.photoRightDualRow}>
            {displayPhotoUris.map((uri, index) => (
              <View
                key={`episode-photo-${index}-${uri}`}
                style={[
                  styles.photoRightPhotoFrame,
                  styles.photoRightPhotoFrameCompact,
                  {
                    borderColor: photoFrameBorderColor,
                    backgroundColor: content.contentPhotoPlaceholder,
                  },
                ]}
              >
                <Image source={{ uri }} style={styles.photoRightPhotoImage} resizeMode="cover" />
              </View>
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.photoRightPhotoFrame,
              styles.photoRightPhotoFrameCompact,
              {
                borderColor: photoFrameBorderColor,
                backgroundColor: content.contentPhotoPlaceholder,
              },
            ]}
          >
            <Image
              source={{ uri: displayPhotoUris[0] }}
              style={styles.photoRightPhotoImage}
              resizeMode="cover"
            />
          </View>
        )}
      </Pressable>
    ) : null;

    const photoRightContent = (
      <View
        style={[
          styles.episodeCard,
          embedded && styles.episodeCardEmbedded,
          !embedded
            ? {
                borderRadius: cardRadius,
                backgroundColor: episodeCardBackgroundColor,
                borderColor: content.contentBorder,
              }
            : null,
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
        !embedded
          ? {
              borderRadius: kit.episodeListCardBorderRadius,
              backgroundColor: episodeCardBackgroundColor,
              borderColor: content.contentBorder,
            }
          : null,
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
        <Text style={[styles.episodeCardDateText, { color: content.contentTextSecondary }]}>
          {formatEpisodeDateForCard(date)}
        </Text>
        {visibilityMode != null ? (
          <VisibilityModeIcon mode={visibilityMode} />
        ) : showPosterName ? (
          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, contentPersonTagStyle(content)]}>
            <Text style={[styles.episodeParticipantTagName, contentTagTextStyle(content)]} numberOfLines={1}>
              {normalizedPosterName}
            </Text>
          </View>
        ) : null}
        {onEdit && onDelete ? (
          <View style={styles.episodeCardActions}>
            <Pressable style={[styles.episodeCardEditButton, contentTagStyle(content)]} onPress={onEdit} accessibilityLabel="編集">
              <Ionicons name="pencil-outline" size={18} color={content.contentText} />
            </Pressable>
            <Pressable style={[styles.episodeCardDeleteButton, contentTagStyle(content)]} onPress={onDelete} accessibilityLabel="削除">
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
            </Pressable>
          </View>
        ) : null}
      </Pressable>
      {showMetaRow2 ? (
        <View style={styles.episodeCardRow2}>
          {normalizedEpisodeTag ? <EpisodeTagChip label={normalizedEpisodeTag} /> : null}
          {visibilityMode == null && visibility.length > 0 ? (
            <View style={styles.visibilityCol}>
              <Text style={[styles.visibilityLabelFixed, contentMutedTextStyle(content)]}>公開先：</Text>
              <View style={styles.visibilityPills}>
                {visibility.map((label, vi) => (
                  <View key={`vis-${vi}-${label}`} style={[styles.episodeParticipantTag, contentPersonTagStyle(content)]}>
                    <Text style={[styles.episodeParticipantTagName, contentTagTextStyle(content)]}>{label}</Text>
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
    paddingVertical: 6,
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
    gap: 3,
  },
  photoRightLeftColumn: {
    flex: 1,
    minWidth: 0,
  },
  photoRightTopLeft: {
    flex: 1,
    minWidth: 0,
    height: TITLE_META_BLOCK_HEIGHT,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  /** 参加者行がある／縦長写真時は固定高を外し、メタ〜参加者の空きをなくす */
  photoRightTopLeftHug: {
    height: undefined,
    overflow: undefined,
  },
  photoRightTopLeftMultiline: {
    flex: undefined,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    height: undefined,
    overflow: undefined,
  },
  photoRightMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  photoRightParticipantRow: {
    marginTop: 2,
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
  photoRightDualRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: PHOTO_DUAL_GAP,
  },
  photoRightPhotoFrame: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Theme.homeCardPhotoPlaceholder,
    borderWidth: 0.5,
    borderColor: Theme.inputBorder,
  },
  photoRightPhotoFrameCompact: {
    width: PHOTO_WIDTH,
    height: TITLE_META_BLOCK_HEIGHT,
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
  visibilityModeIconWrap: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 2,
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
