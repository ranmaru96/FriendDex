export type TabTransitionAnimation = 'slide_from_right' | 'slide_from_left';

export type StackTransitionAnimation = TabTransitionAnimation | 'none' | 'fade';

let nextTabAnimation: TabTransitionAnimation = 'slide_from_right';

/** One-shot override for the next index (Home) transition — e.g. Detail → Home. */
let nextStackAnimationOverride: StackTransitionAnimation | null = null;

/** BottomNav が次の Stack 遷移アニメを指定する */
export function setNextTabAnimation(animation: TabTransitionAnimation): void {
  nextStackAnimationOverride = null;
  nextTabAnimation = animation;
}

/** 次の1回だけ Stack 遷移アニメを上書き（index 向け。消費後クリア） */
export function setNextStackAnimation(animation: StackTransitionAnimation): void {
  nextStackAnimationOverride = animation;
}

/** Stack screenOptions が遷移直前に読む */
export function getNextTabAnimation(): TabTransitionAnimation {
  return nextTabAnimation;
}

/** 起動時の一覧→カレンダーだけ、横スライドを出さない。 */
let suppressNextTabSlide = false;

export function suppressNextTabSlideOnce(): void {
  suppressNextTabSlide = true;
}

let nextReplaceAsPop = false;

/** タブ内の階層を1つ戻す replace は pop 方向にする */
export function setNextReplaceAsPop(): void {
  nextReplaceAsPop = true;
}

export function peekNextReplaceAsPop(): boolean {
  return nextReplaceAsPop;
}

export function clearNextReplaceAsPop(): void {
  nextReplaceAsPop = false;
}

/**
 * Resolve animation for a Stack route.
 * - index + one-shot override: Detail→Home の横スライドなど
 * - bottom tabs (incl. index): BottomNav の左右スライド
 * - detail / otherwise: slide_from_right
 * - mypage: slide_from_left
 */
export function resolveStackAnimation(
  routeName: string,
  bottomTabRouteNames: ReadonlySet<string>
): StackTransitionAnimation {
  if (nextStackAnimationOverride != null && routeName === 'index') {
    const override = nextStackAnimationOverride;
    nextStackAnimationOverride = null;
    return override;
  }
  if (bottomTabRouteNames.has(routeName)) {
    if (suppressNextTabSlide && routeName === 'calendar') {
      suppressNextTabSlide = false;
      return 'none';
    }
    return getNextTabAnimation();
  }
  if (routeName === 'mypage') {
    return 'slide_from_left';
  }
  return 'slide_from_right';
}
