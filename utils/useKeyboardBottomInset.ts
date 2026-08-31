import { useCallback, useEffect, useState } from 'react';
import { Keyboard, Platform, type View } from 'react-native';

export type KeyboardFrame = {
  /** Keyboard height from the screen bottom. 0 when closed. */
  height: number;
  /** Screen Y of the keyboard top. 0 when closed. */
  screenY: number;
};

const HIDDEN_FRAME: KeyboardFrame = { height: 0, screenY: 0 };

/**
 * Keyboard frame from native show/hide events.
 * `height` is for overlays pinned to the screen bottom.
 * `screenY` is for measuring how much a specific view actually overlaps the keyboard.
 */
export function useKeyboardFrame(): KeyboardFrame {
  const [frame, setFrame] = useState<KeyboardFrame>(HIDDEN_FRAME);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (event) => {
      setFrame({
        height: event.endCoordinates.height,
        screenY: event.endCoordinates.screenY,
      });
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setFrame(HIDDEN_FRAME);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return frame;
}

/**
 * Bottom inset matching the on-screen keyboard height.
 * Use as paddingBottom / marginBottom on the form body so the visible
 * area (and multiline TextInput frames) stay above the keyboard.
 */
export function useKeyboardBottomInset(): number {
  return useKeyboardFrame().height;
}

/**
 * How far `viewRef` actually overlaps the keyboard.
 * Ignores space already below the view (bottom nav, home indicator, window resize).
 */
export function measureKeyboardOverlap(
  viewRef: { current: View | null },
  keyboardScreenY: number,
  keyboardHeight: number,
  onOverlap: (next: number) => void
): void {
  if (keyboardHeight <= 0 || keyboardScreenY <= 0) {
    onOverlap(0);
    return;
  }
  viewRef.current?.measureInWindow((_x, y, _w, h) => {
    if (h <= 0) {
      return;
    }
    onOverlap(Math.max(0, Math.round(y + h - keyboardScreenY)));
  });
}

export function useSyncKeyboardOverlap(
  viewRef: { current: View | null },
  keyboardScreenY: number,
  keyboardHeight: number
): { overlap: number; syncOverlap: () => void } {
  const [overlap, setOverlap] = useState(0);

  const syncOverlap = useCallback(() => {
    measureKeyboardOverlap(viewRef, keyboardScreenY, keyboardHeight, (next) => {
      setOverlap((current) => (current === next ? current : next));
    });
  }, [viewRef, keyboardScreenY, keyboardHeight]);

  useEffect(() => {
    syncOverlap();
  }, [syncOverlap]);

  return { overlap, syncOverlap };
}
