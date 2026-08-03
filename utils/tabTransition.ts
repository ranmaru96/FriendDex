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

/**
 * Resolve animation for a Stack route.
 * - index + one-shot override: Detail→Home の横スライドなど
 * - bottom tabs (incl. index): BottomNav の左右スライド
 * - detail / otherwise: slide_from_right
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
    return getNextTabAnimation();
  }
  return 'slide_from_right';
}
