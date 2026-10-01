import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { EpisodeCardTitle, EPISODE_DETAIL_SIDE_INSET } from '@/components/episode/EpisodeCardTitle';
import { EpisodeTagChip } from '@/components/episode/EpisodeTagChip';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { listCardBackgroundColor, listCardShadowStyle } from '@/utils/listCardSurface';
import { Radius, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useTapUnlessHorizontalScroll } from '@/hooks/useTapUnlessHorizontalScroll';
import { useContentColors } from '@/utils/useContentColors';
import { getEventCalendarColor } from '@/utils/calendarEventColors';
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

/**
 * 写真右レイアウトの行高・間隔（直近の height:56 固定前＝タグあり自然高に合わせる）
 * タイトル: font 15 / line 18 + underline pad 4 + border 1 → 23
 * メタ: EpisodeTagChip（pad 4*2 + border 2*2 + text line 14）→ 26
 */
const TITLE_ROW_HEIGHT = 23;
const TITLE_META_GAP = 4;
const META_ROW_HEIGHT = 26;
const META_PARTICIPANT_GAP = 2;
/** fitted チップ(約28) + ScrollView paddingVertical 2*2 */
const PARTICIPANT_ROW_HEIGHT = 32;
/** タイトル＋メタ塊（コンパクト写真の高さ基準） */
const TITLE_META_BLOCK_HEIGHT = TITLE_ROW_HEIGHT + TITLE_META_GAP + META_ROW_HEIGHT;
/** 縦長1枚: タイトル＋メタ＋参加者の3行分（情報量によらず固定） */
const TALL_PHOTO_HEIGHT =
  TITLE_META_BLOCK_HEIGHT + META_PARTICIPANT_GAP + PARTICIPANT_ROW_HEIGHT;
const TALL_PHOTO_WIDTH = TALL_PHOTO_HEIGHT * PHOTO_ASPECT;
/** コンパクト写真幅（高さ × 4/3） */
const PHOTO_WIDTH = Math.round(TITLE_META_BLOCK_HEIGHT * PHOTO_ASPECT);
const LIMITED_AUDIENCE_CHARS_PER_LINE = 10;
const LIMITED_AUDIENCE_CHAR_PX = 15;
const LIMITED_AUDIENCE_POP_PADDING_X = 12;
const LIMITED_AUDIENCE_POP_WIDTH =
  LIMITED_AUDIENCE_CHARS_PER_LINE * LIMITED_AUDIENCE_CHAR_PX + LIMITED_AUDIENCE_POP_PADDING_X * 2;

function VisibilityModeIcon({
  mode,
  onPressIn,
  onPressOut,
  accessibilityLabel,
  popover,
}: {
  mode: EpisodeVisibilityMode;
  onPressIn?: () => void;
  onPressOut?: () => void;
  accessibilityLabel?: string;
  popover?: ReactNode;
}) {
  const label = accessibilityLabel ?? getVisibilityModeLabel(mode);
  const icon = (
    <View style={styles.visibilityModeIconWrap}>
      <Ionicons
        name={getVisibilityModeIconName(mode)}
        size={16}
        color={getVisibilityModeIconColor(mode)}
      />
    </View>
  );
  if (!onPressIn) {
    return (
      <View accessibilityRole="image" accessibilityLabel={label}>
        {icon}
      </View>
    );
  }
  return (
    <View style={styles.visibilityModeIconAnchor}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {icon}
      </Pressable>
      {popover}
    </View>
  );
}

export type EpisodeListCardProps = {
  title: string;
  date: string;
  /** 詳細画面など日付表示を差し替えるとき（一覧カードは未指定のまま） */
  dateLabel?: string;
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
  /** 紐づく予定タイトル（日付・予定タグ行の右端タグ） */
  eventTitle?: string | null;
  /** 予定のカレンダー色用タグ（省略時は未設定色） */
  eventEpisodeTag?: string | null;
  onEventPress?: () => void;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  /** 詳細画面など親パネル内に埋め込むとき（外枠・角丸なし） */
  embedded?: boolean;
  /** タイトルを折り返して全文表示（エピソード詳細ページ用） */
  titleMultiline?: boolean;
  /** 詳細画面だけ、左右に共通の余白を空ける */
  titleInset?: boolean;
  /** 自動生成後に未記載のとき、タイトル横へ（未記入）を付ける */
  unfilled?: boolean;
  /** 詳細画面のタイトル横。一覧ではカードの外に出す */
  byline?: ReactNode;
  /** 詳細の自分の限定公開。アイコンを押しているあいだ公開対象を出す */
  revealLimitedAudience?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function EpisodeListCard({
  title,
  date,
  dateLabel,
  episodeTag,
  chips,
  visibility = [],
  visibilityMode,
  posterName,
  coverPhotoUri,
  photoUris,
  eventTitle,
  eventEpisodeTag,
  onEventPress,
  onPress,
  onLongPress,
  delayLongPress = 300,
  onEdit,
  onDelete,
  embedded = false,
  titleMultiline = false,
  titleInset = false,
  unfilled = false,
  byline,
  revealLimitedAudience = false,
  style,
}: EpisodeListCardProps) {
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const isOffsetPattern = usesOffsetChrome(appTheme?.patternId);
  const hasBrackets = appTheme?.shape.cornerBrackets === true;
  const participantTap = useTapUnlessHorizontalScroll(onPress);
  const usePhotoLayout = kit.episodeListCardLayout === 'photoRight';
  const photoFrameRadius = isOffsetPattern ? (appTheme?.shape.innerRadius ?? Radius.sm) : Radius.sm;
  const photoFrameChrome = {
    backgroundColor: content.contentPhotoPlaceholder,
    borderRadius: photoFrameRadius,
    borderWidth: 0.5,
    borderColor: Theme.inputBorder,
  };
  const episodeCardBackgroundColor = listCardBackgroundColor(
    appTheme?.variant,
    content.contentCard,
  );
  const blackEpisodeCardLift = listCardShadowStyle(appTheme?.variant);
  const normalizedEpisodeTag = normalizeEpisodeTag(episodeTag);
  const normalizedPosterName = posterName?.trim() ? posterName.trim() : null;
  const showPosterName = visibilityMode == null && normalizedPosterName != null;
  const normalizedEventTitle = eventTitle?.trim() ? eventTitle.trim() : null;
  const eventChipColor = getEventCalendarColor(eventEpisodeTag);
  const resolvedDateLabel = dateLabel?.trim() || formatEpisodeDateForCard(date);
  const [limitedAudienceOpen, setLimitedAudienceOpen] = useState(false);
  const canRevealLimitedAudience =
    revealLimitedAudience && visibilityMode === 'limited' && visibility.length > 0;
  const limitedAudienceNames = visibility
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
  const limitedAudiencePopColor = appTheme?.variant === 'black' ? '#2c2c2c' : content.contentCard;

  if (usePhotoLayout) {
    const resolvedPhotoUris = (photoUris?.length
      ? photoUris
      : coverPhotoUri?.trim()
        ? [coverPhotoUri.trim()]
        : []
    )
      .map((uri) => uri.trim())
      .filter(Boolean);
    // 埋め込み詳細はタイトル+日付行のコンパクト写真。一覧は kit のレイアウトに従う
    const photoLayout = embedded ? 'compactTwoSideBySide' : kit.episodeListPhotoLayout;
    const displayPhotoUris =
      !embedded && photoLayout === 'compactTwoSideBySide'
        ? resolvedPhotoUris.slice(0, 2)
        : resolvedPhotoUris.slice(0, 1);
    const hasPhoto = displayPhotoUris.length > 0;
    const hasParticipants = chips.length > 0;

    const useTallPhoto = hasPhoto && !embedded && kit.episodeListPhotoLayout === 'tallOne';
    const useDualCompact =
      hasPhoto && !embedded && kit.episodeListPhotoLayout === 'compactTwoSideBySide' && displayPhotoUris.length > 1;

    const photoRightMetaRow = (
      <View
        style={[
          styles.photoRightMetaRow,
          titleMultiline ? styles.photoRightMetaRowExpanded : null,
          titleInset ? styles.detailLineInset : null,
          canRevealLimitedAudience ? styles.photoRightMetaRowPopover : null,
        ]}
      >
        <Text
          style={[
            styles.episodeCardDateText,
            styles.photoRightMetaDateText,
            titleMultiline ? styles.episodeCardDateTextDetail : null,
            { color: content.contentTextSecondary },
          ]}
          numberOfLines={1}
        >
          {resolvedDateLabel}
        </Text>
        {normalizedEpisodeTag ? (
          <EpisodeTagChip
            label={normalizedEpisodeTag}
            style={styles.photoRightMetaTagChip}
            textStyle={styles.photoRightMetaTagText}
          />
        ) : null}
        {visibilityMode != null ? (
          <VisibilityModeIcon
            mode={visibilityMode}
            onPressIn={
              canRevealLimitedAudience ? () => setLimitedAudienceOpen(true) : undefined
            }
            onPressOut={
              canRevealLimitedAudience ? () => setLimitedAudienceOpen(false) : undefined
            }
            accessibilityLabel={canRevealLimitedAudience ? '公開対象' : undefined}
            popover={
              canRevealLimitedAudience && limitedAudienceOpen ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.limitedAudiencePop,
                    {
                      width: LIMITED_AUDIENCE_POP_WIDTH,
                      backgroundColor: limitedAudiencePopColor,
                      borderColor: content.contentBorder,
                    },
                    appTheme?.variant === 'black'
                      ? styles.limitedAudiencePopShadowDark
                      : styles.limitedAudiencePopShadowLight,
                  ]}
                >
                  <View style={styles.limitedAudienceTags}>
                    {limitedAudienceNames.map((name, index) => (
                      <View
                        key={`${index}-${name}`}
                        style={[styles.limitedAudienceTag, contentPersonTagStyle(content)]}
                      >
                        <Text
                          style={[styles.limitedAudienceTagText, contentTagTextStyle(content)]}
                        >
                          {name}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View
                    style={[
                      styles.limitedAudienceCaret,
                      {
                        backgroundColor: limitedAudiencePopColor,
                        borderColor: content.contentBorder,
                      },
                    ]}
                  />
                </View>
              ) : null
            }
          />
        ) : showPosterName ? (
          <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, contentPersonTagStyle(content)]}>
            <Text style={[styles.episodeParticipantTagName, contentTagTextStyle(content)]} numberOfLines={1}>
              {normalizedPosterName}
            </Text>
          </View>
        ) : null}
        {normalizedEventTitle != null ? (
          <Pressable
            onPress={onEventPress}
            disabled={!onEventPress}
            style={[
              styles.photoRightMetaEventPressable,
              titleMultiline ? styles.photoRightMetaEventPressableExpanded : null,
            ]}
            accessibilityRole={onEventPress ? 'button' : undefined}
            accessibilityLabel={onEventPress ? '所属する予定を開く' : undefined}
          >
            <View
              style={[
                styles.photoRightMetaEventTag,
                titleMultiline ? styles.photoRightMetaEventTagExpanded : null,
                { backgroundColor: eventChipColor },
              ]}
            >
              <Text
                style={styles.photoRightMetaEventTagText}
                numberOfLines={titleMultiline ? undefined : 1}
              >
                {normalizedEventTitle}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    );

    const titleMetaStyle = [
      styles.photoRightTopLeft,
      titleMultiline ? styles.photoRightTopLeftMultiline : null,
    ];
    const titleMetaInner = (
      <>
        <View style={byline ? styles.titleWithByline : titleMultiline ? undefined : styles.photoRightTitleRow}>
          <View style={byline ? styles.titleWithBylineTitle : undefined}>
            <EpisodeCardTitle
              title={title}
              multiline={titleMultiline}
              inset={titleInset}
              fillRow={false}
              unfilled={unfilled}
            />
          </View>
          {byline ? <View style={styles.titleBylineAlign}>{byline}</View> : null}
        </View>
        {photoRightMetaRow}
      </>
    );
    const titleMetaBlock =
      onPress || onLongPress ? (
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={delayLongPress}
          style={({ pressed }) => [
            titleMetaStyle,
            pressed ? styles.photoRightPressablePressed : null,
          ]}
        >
          {titleMetaInner}
        </Pressable>
      ) : (
        <View style={titleMetaStyle}>{titleMetaInner}</View>
      );

    const participantBlock =
      useTallPhoto || hasParticipants ? (
        <Pressable
          onPress={participantTap.onPress}
          onLongPress={onLongPress}
          delayLongPress={delayLongPress}
          disabled={!onPress && !onLongPress}
          style={({ pressed }) => [
            styles.photoRightParticipantRow,
            useTallPhoto ? styles.photoRightParticipantRowInColumn : null,
            titleInset ? styles.detailLineInset : null,
            pressed && (onPress || onLongPress) ? styles.photoRightPressablePressed : null,
          ]}
        >
          {hasParticipants ? (
            <ParticipantChipList
              chips={chips}
              layout="scroll"
              compact
              onChipPress={participantTap.onChipPress}
              onScrollBeginDrag={participantTap.onScrollBeginDrag}
              onScrollEndDrag={participantTap.onScrollEndDrag}
              onMomentumScrollEnd={participantTap.onMomentumScrollEnd}
            />
          ) : null}
        </Pressable>
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
                width: TALL_PHOTO_WIDTH,
                height: TALL_PHOTO_HEIGHT,
                ...photoFrameChrome,
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
                  photoFrameChrome,
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
              photoFrameChrome,
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

    const photoRightBody = (
      <>
        {useTallPhoto ? (
          <View style={[styles.photoRightBodyRow, isOffsetPattern ? styles.photoRightGapCodex : null]}>
            <View
              style={styles.photoRightLeftColumn}
            >
              {titleMetaBlock}
              {participantBlock}
            </View>
            {photoBlock}
          </View>
        ) : (
          <>
            <View style={[styles.photoRightTopRow, isOffsetPattern ? styles.photoRightGapCodex : null]}>
              {titleMetaBlock}
              {photoBlock}
            </View>
            {participantBlock}
          </>
        )}
      </>
    );

    if (embedded) {
      return (
        <View style={[styles.episodeCard, styles.episodeCardEmbedded, style]}>
          {photoRightBody}
        </View>
      );
    }

    if (isOffsetPattern) {
      return (
        <OffsetCard
          brackets
          style={style}
          contentStyle={[
            styles.episodeCard,
            hasBrackets ? styles.episodeCardCodex : null,
            { backgroundColor: episodeCardBackgroundColor },
          ]}
        >
          {photoRightBody}
        </OffsetCard>
      );
    }

    return (
      <View
        style={[
          styles.episodeCard,
          {
            borderRadius: kit.episodeListCardBorderRadius,
            backgroundColor: episodeCardBackgroundColor,
            borderColor: content.contentBorder,
            borderWidth: 1,
          },
          blackEpisodeCardLift,
          style,
        ]}
      >
        {photoRightBody}
      </View>
    );
  }

  const showMetaRow2 = visibility.length > 0 || normalizedEpisodeTag != null;

  const cardBody = (
    <>
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
        <EpisodeCardTitle
          title={title}
          multiline={titleMultiline}
          inset={titleInset}
          unfilled={unfilled}
        />
        {byline}
        <Text
          style={[
            styles.episodeCardDateText,
            titleMultiline ? styles.episodeCardDateTextDetail : null,
            { color: content.contentTextSecondary },
          ]}
        >
          {resolvedDateLabel}
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
        {normalizedEventTitle != null ? (
          <Pressable
            onPress={onEventPress}
            disabled={!onEventPress}
            style={styles.classicMetaEventPressable}
            accessibilityRole={onEventPress ? 'button' : undefined}
            accessibilityLabel={onEventPress ? '所属する予定を開く' : undefined}
          >
            <View
              style={[
                styles.photoRightMetaEventTag,
                { backgroundColor: eventChipColor },
              ]}
            >
              <Text style={styles.photoRightMetaEventTagText} numberOfLines={1}>
                {normalizedEventTitle}
              </Text>
            </View>
          </Pressable>
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
        <Pressable
          onPress={participantTap.onPress}
          onLongPress={onLongPress}
          delayLongPress={delayLongPress}
          disabled={!onPress && !onLongPress}
          style={({ pressed }) => [
            styles.episodeParticipantChipList,
            pressed && (onPress || onLongPress) ? styles.photoRightPressablePressed : null,
          ]}
        >
          <ParticipantChipList
            chips={chips}
            layout="scroll"
            compact
            onChipPress={participantTap.onChipPress}
            onScrollBeginDrag={participantTap.onScrollBeginDrag}
            onScrollEndDrag={participantTap.onScrollEndDrag}
            onMomentumScrollEnd={participantTap.onMomentumScrollEnd}
          />
        </Pressable>
      ) : null}
    </>
  );

  if (embedded) {
    return <View style={[styles.episodeCard, styles.episodeCardEmbedded, style]}>{cardBody}</View>;
  }

  if (isOffsetPattern) {
    return (
      <OffsetCard
        brackets
        style={style}
        contentStyle={[
          styles.episodeCard,
          hasBrackets ? styles.episodeCardCodex : null,
          { backgroundColor: episodeCardBackgroundColor },
        ]}
      >
        {cardBody}
      </OffsetCard>
    );
  }

  return (
    <View
      style={[
        styles.episodeCard,
        {
          borderRadius: kit.episodeListCardBorderRadius,
          backgroundColor: episodeCardBackgroundColor,
          borderColor: content.contentBorder,
          borderWidth: 1,
        },
        blackEpisodeCardLift,
        style,
      ]}
    >
      {cardBody}
    </View>
  );
}

const styles = StyleSheet.create({
  titleWithByline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  titleWithBylineTitle: {
    flexShrink: 1,
    minWidth: 0,
  },
  /** タグ（高さ28）の中央を、タイトル文字（約20）の中央に合わせる */
  titleBylineAlign: {
    marginTop: -4,
  },
  episodeCard: {
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  episodeCardCodex: {
    paddingRight: 8,
    paddingVertical: 10,
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
  photoRightGapCodex: {
    gap: 8,
  },
  photoRightLeftColumn: {
    flex: 1,
    minWidth: 0,
  },
  photoRightTopLeft: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  photoRightTopLeftMultiline: {
    flex: undefined,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  photoRightTitleRow: {
    height: TITLE_ROW_HEIGHT,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  photoRightMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    marginTop: TITLE_META_GAP,
    height: META_ROW_HEIGHT,
    overflow: 'hidden',
  },
  /** 詳細など：メタ行内で予定タイトルを折り返して全文表示 */
  photoRightMetaRowExpanded: {
    height: undefined,
    minHeight: META_ROW_HEIGHT,
    flexWrap: 'wrap',
    alignItems: 'center',
    overflow: 'visible',
  },
  photoRightMetaRowPopover: {
    overflow: 'visible',
    zIndex: 4,
  },
  photoRightMetaDateText: {
    lineHeight: 14,
  },
  photoRightMetaTagChip: {
    height: META_ROW_HEIGHT,
    paddingVertical: 0,
    justifyContent: 'center',
    flexShrink: 1,
    maxWidth: 110,
  },
  photoRightMetaTagText: {
    lineHeight: 14,
    fontSize: 11,
  },
  photoRightMetaEventPressable: {
    flexShrink: 1,
    maxWidth: '42%',
    marginLeft: 'auto',
  },
  photoRightMetaEventPressableExpanded: {
    maxWidth: '100%',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  classicMetaEventPressable: {
    flexShrink: 1,
    maxWidth: 120,
    marginLeft: 'auto',
  },
  photoRightMetaEventTag: {
    height: META_ROW_HEIGHT,
    paddingHorizontal: 6,
    paddingVertical: 0,
    borderRadius: 2,
    justifyContent: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  photoRightMetaEventTagExpanded: {
    height: undefined,
    minHeight: META_ROW_HEIGHT,
    paddingVertical: 2,
    overflow: 'visible',
  },
  photoRightMetaEventTagText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    color: '#ffffff',
  },
  detailLineInset: {
    marginHorizontal: EPISODE_DETAIL_SIDE_INSET,
  },
  photoRightParticipantRow: {
    marginTop: META_PARTICIPANT_GAP,
    alignSelf: 'stretch',
    height: PARTICIPANT_ROW_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
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
  /** 詳細のメタ行（高さ26）に対して、日付だけ一段大きくする */
  episodeCardDateTextDetail: {
    fontSize: 14,
    lineHeight: 20,
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
  visibilityModeIconAnchor: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 4,
    overflow: 'visible',
  },
  limitedAudiencePop: {
    position: 'absolute',
    left: '100%',
    top: '50%',
    marginLeft: 10,
    transform: [{ translateY: '-50%' }],
    paddingHorizontal: LIMITED_AUDIENCE_POP_PADDING_X,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  limitedAudiencePopShadowLight: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  limitedAudiencePopShadowDark: {
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 6,
  },
  limitedAudienceTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  limitedAudienceTag: {
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  limitedAudienceTagText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  limitedAudienceCaret: {
    position: 'absolute',
    left: -5,
    top: '50%',
    marginTop: -4,
    width: 8,
    height: 8,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    transform: [{ rotate: '45deg' }],
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
