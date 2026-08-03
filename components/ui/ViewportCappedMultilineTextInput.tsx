import { forwardRef, useMemo } from 'react';
import {
  Platform,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardBottomInset } from '@/utils/useKeyboardBottomInset';

/** Approximate ScreenTopBar + form padding above the field when scrolled to top */
const DEFAULT_TOP_RESERVE = 64;
const DEFAULT_BOTTOM_GAP = 16;

export type ViewportCappedMultilineTextInputProps = TextInputProps & {
  minHeight?: number;
  /** Extra space reserved above the usable viewport (header / chrome). */
  topReserve?: number;
  /** Extra gap above keyboard / home indicator. */
  bottomGap?: number;
};

/**
 * Multiline TextInput that grows with content until it would exceed the
 * visible viewport (below header, above keyboard), then scrolls internally
 * so later lines stay reachable without pushing the frame off-screen.
 */
export const ViewportCappedMultilineTextInput = forwardRef<
  TextInput,
  ViewportCappedMultilineTextInputProps
>(function ViewportCappedMultilineTextInput(
  {
    minHeight = 72,
    topReserve = DEFAULT_TOP_RESERVE,
    bottomGap = DEFAULT_BOTTOM_GAP,
    style,
    scrollEnabled = true,
    ...rest
  },
  ref
) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardBottomInset();

  const maxHeight = useMemo(() => {
    const bottom = Math.max(keyboardInset, insets.bottom) + bottomGap;
    const available = windowHeight - insets.top - topReserve - bottom;
    return Math.max(minHeight, available);
  }, [windowHeight, insets.top, insets.bottom, keyboardInset, topReserve, bottomGap, minHeight]);

  return (
    <TextInput
      {...rest}
      ref={ref}
      multiline
      textAlignVertical={rest.textAlignVertical ?? 'top'}
      scrollEnabled={scrollEnabled}
      // Android: allow dragging inside while parent KeyboardAwareScrollView is present
      {...(Platform.OS === 'android' ? { nestedScrollEnabled: true } : null)}
      style={[style, { minHeight, maxHeight }]}
    />
  );
});
