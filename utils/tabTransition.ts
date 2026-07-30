export type TabTransitionAnimation = 'slide_from_right' | 'slide_from_left';

let nextTabAnimation: TabTransitionAnimation = 'slide_from_right';

/** BottomNav が次の Stack 遷移アニメを指定する */
export function setNextTabAnimation(animation: TabTransitionAnimation): void {
  nextTabAnimation = animation;
}

/** Stack screenOptions が遷移直前に読む */
export function getNextTabAnimation(): TabTransitionAnimation {
  return nextTabAnimation;
}
