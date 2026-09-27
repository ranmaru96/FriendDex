import type { ViewStyle } from 'react-native';
import type { AppThemeVariant } from '@/constants/appThemes/types';

/** ブラックの一覧カード面。画面色（#111111）に揃える。 */
export const LIST_CARD_BLACK_FILL = '#111111';

/** ブラックの一覧カードを画面から浮かせる白い影。 */
export const listCardBlackLift: ViewStyle = {
  shadowColor: '#FFFFFF',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.28,
  shadowRadius: 4,
  elevation: 6,
};

/** エピソードカードと同じ塗り。ブラックだけ画面色、それ以外は contentCard。 */
export function listCardBackgroundColor(
  variant: AppThemeVariant | null | undefined,
  contentCard: string,
): string {
  return variant === 'black' ? LIST_CARD_BLACK_FILL : contentCard;
}

/** エピソードカードと同じ影。ブラックだけ白い浮き影。 */
export function listCardShadowStyle(
  variant: AppThemeVariant | null | undefined,
): ViewStyle | null {
  return variant === 'black' ? listCardBlackLift : null;
}
