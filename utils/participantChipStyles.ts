import { StyleSheet } from 'react-native';
import { Radius, Theme } from '@/constants/theme';

export const PARTICIPANT_CHIP_FITTED_PHOTO_SIZE = 22;
export const PARTICIPANT_CHIP_FITTED_BORDER_RADIUS = 6;

/** 写真ありタグと同じ高さ（avatar + border） */
export const PARTICIPANT_CHIP_HEIGHT = 34;
export const PARTICIPANT_CHIP_COMPACT_HEIGHT = 30;
export const PARTICIPANT_CHIP_FITTED_HEIGHT = 28;

/** チップ表示用の名前最大文字数（コードポイント）。表示のみ。 */
export const PARTICIPANT_CHIP_LABEL_MAX_CHARS = 8;

/** 先頭 N 文字 + 省略記号。データは変更しない。 */
export function truncateParticipantChipLabel(
  label: string,
  maxChars: number = PARTICIPANT_CHIP_LABEL_MAX_CHARS
): string {
  const chars = Array.from(label);
  if (chars.length <= maxChars) return label;
  return `${chars.slice(0, maxChars).join('')}…`;
}

export const participantChipStyles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  wrapWithTrailing: {
    width: '100%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    height: PARTICIPANT_CHIP_HEIGHT,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 999,
    backgroundColor: 'transparent',
    paddingLeft: 4,
    paddingRight: 4,
  },
  chipCompact: {
    height: PARTICIPANT_CHIP_COMPACT_HEIGHT,
  },
  /** カレンダー予定カード用：写真左・コンパクト */
  chipFitted: {
    height: PARTICIPANT_CHIP_FITTED_HEIGHT,
    paddingLeft: 2,
    paddingRight: 4,
  },
  chipBodyFitted: {
    gap: 3,
    paddingVertical: 0,
    paddingLeft: 2,
    paddingRight: 2,
    alignSelf: 'stretch',
  },
  avatarFittedOuter: {
    width: PARTICIPANT_CHIP_FITTED_PHOTO_SIZE,
    height: PARTICIPANT_CHIP_FITTED_PHOTO_SIZE,
    overflow: 'hidden',
    backgroundColor: Theme.homeCardPhotoPlaceholder,
  },
  avatarFittedImage: {
    width: '100%',
    height: '100%',
  },
  avatarFittedPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Theme.homeCardPhotoPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 写真なし個人・グループ（アイコン＋名前） */
  chipTextOnly: {
    paddingLeft: 8,
    paddingRight: 8,
  },
  /** グループ：枠線を個人の倍に */
  chipGroupBorder: {
    borderWidth: 2,
  },
  chipBody: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 6,
    paddingVertical: 0,
    paddingLeft: 4,
    paddingRight: 2,
  },
  chipBodyTextOnly: {
    paddingLeft: 0,
    paddingRight: 0,
    gap: 4,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: Theme.homeCardPhotoPlaceholder,
  },
  avatarCompact: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: Theme.homeCardPhotoPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.homeCardPhotoPlaceholderText,
  },
  avatarInitialCompact: {
    fontSize: 10,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textPrimary,
    flexShrink: 1,
  },
  nameCompact: {
    fontSize: 11,
  },
  removeButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  removeButtonText: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
});
