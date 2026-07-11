import { FRIEND_HOME_CARD_GAP } from '@/components/friend/FriendHomeCard';
import { Radius, ScreenHorizontalInset } from '@/constants/theme';

/** FriendHomeCard の photoInnerFrame と同じ角丸（Radius.md - 2） */
export const HOME_CARD_PHOTO_CORNER_RADIUS = Radius.md - 2;

export function getFriendHomeCardWidth(screenWidth: number): number {
  const rowInnerWidth = screenWidth - ScreenHorizontalInset * 2;
  return (rowInnerWidth - FRIEND_HOME_CARD_GAP * 2) / 3;
}

/** 人物カード写真と同じ角丸/一辺の比率を、任意サイズの正方形に適用 */
export function getScaledHomeCardPhotoCornerRadius(
  photoSideLength: number,
  screenWidth: number,
  minRadius = 1
): number {
  const referenceSide = getFriendHomeCardWidth(screenWidth);
  if (referenceSide <= 0 || photoSideLength <= 0) {
    return Math.max(minRadius, Math.round(photoSideLength * 0.09));
  }
  const radius = photoSideLength * (HOME_CARD_PHOTO_CORNER_RADIUS / referenceSide);
  return Math.max(minRadius, Math.round(radius));
}
