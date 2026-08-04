import { useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

/**
 * 横スクロール可能なチップ行向け: 短いタップは onTap、横ドラッグはスクロールを優先。
 */
export function useTapUnlessHorizontalScroll(onTap?: () => void) {
  const dragActiveRef = useRef(false);
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDragResetTimer = useCallback(() => {
    if (dragResetTimerRef.current != null) {
      clearTimeout(dragResetTimerRef.current);
      dragResetTimerRef.current = null;
    }
  }, []);

  const onScrollBeginDrag = useCallback<ScrollHandler>(() => {
    clearDragResetTimer();
    dragActiveRef.current = true;
  }, [clearDragResetTimer]);

  const onScrollEndDrag = useCallback<ScrollHandler>(() => {
    clearDragResetTimer();
    // Pressable の onPress がドラッグ後に発火しても開かないよう少し遅らせる
    dragResetTimerRef.current = setTimeout(() => {
      dragActiveRef.current = false;
      dragResetTimerRef.current = null;
    }, 80);
  }, [clearDragResetTimer]);

  const onMomentumScrollEnd = useCallback<ScrollHandler>(() => {
    clearDragResetTimer();
    dragResetTimerRef.current = setTimeout(() => {
      dragActiveRef.current = false;
      dragResetTimerRef.current = null;
    }, 80);
  }, [clearDragResetTimer]);

  const onPress = useCallback(() => {
    if (dragActiveRef.current) {
      return;
    }
    onTap?.();
  }, [onTap]);

  useEffect(() => () => clearDragResetTimer(), [clearDragResetTimer]);

  return {
    onPress,
    onChipPress: onPress,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollEnd,
  };
}
