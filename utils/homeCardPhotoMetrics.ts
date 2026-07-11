import { FRIEND_HOME_CARD_GAP } from '@/components/friend/FriendHomeCard';
import { Radius, ScreenHorizontalInset } from '@/constants/theme';

/** FriendHomeCard の photoInnerFrame と同じ角丸（Radius.md - 2） */
export const HOME_CARD_PHOTO_CORNER_RADIUS = Radius.md - 2;

export function getFriendHomeCardWidth(
  screenWidth: number,
  horizontalInset = ScreenHorizontalInset,
  gap = FRIEND_HOME_CARD_GAP
): number {
  const rowInnerWidth = screenWidth - horizontalInset * 2;
  return (rowInnerWidth - gap * 2) / 3;
}

/** 人物カード写真と同じ角丸/一辺の比率を、任意サイズの正方形に適用 */
export function getScaledHomeCardPhotoCornerRadius(
  photoSideLength: number,
  screenWidth: number,
  minRadius = 1,
  horizontalInset = ScreenHorizontalInset
): number {
  const referenceSide = getFriendHomeCardWidth(screenWidth, horizontalInset);
  if (referenceSide <= 0 || photoSideLength <= 0) {
    return Math.max(minRadius, Math.round(photoSideLength * 0.09));
  }
  const radius = photoSideLength * (HOME_CARD_PHOTO_CORNER_RADIUS / referenceSide);
  return Math.max(minRadius, Math.round(radius));
}
