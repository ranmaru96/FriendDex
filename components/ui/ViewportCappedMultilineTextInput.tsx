import { forwardRef, useCallback, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  Platform,
  TextInput,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputProps,
  type TextInputSelectionChangeEventData,
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
  /**
   * When true, grow with content and never cap / scroll internally.
   * Parent ScrollView should scroll long text. Other call sites keep viewport cap.
   */
  uncapped?: boolean;
};

/**
 * Multiline TextInput that grows with content until it would exceed the
 * visible viewport (below header, above keyboard), then scrolls internally
 * so later lines stay reachable without pushing the frame off-screen.
 *
 * Pass `uncapped` to disable the viewport max and grow freely (parent scroll).
 */
export const ViewportCappedMultilineTextInput = forwardRef<
  TextInput,
  ViewportCappedMultilineTextInputProps
>(function ViewportCappedMultilineTextInput(
  {
    minHeight = 72,
    topReserve = DEFAULT_TOP_RESERVE,
    bottomGap = DEFAULT_BOTTOM_GAP,
    uncapped = false,
    style,
    scrollEnabled,
    onContentSizeChange,
    onFocus,
    onSelectionChange,
    ...rest
  },
  ref
) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardBottomInset();
  const [grownHeight, setGrownHeight] = useState(minHeight);
  const inputRef = useRef<TextInput | null>(null);
  const lastSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const setInputRef = useCallback(
    (node: TextInput | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as MutableRefObject<TextInput | null>).current = node;
      }
    },
    [ref]
  );

  const maxHeight = useMemo(() => {
    const bottom = Math.max(keyboardInset, insets.bottom) + bottomGap;
    const available = windowHeight - insets.top - topReserve - bottom;
    return Math.max(minHeight, available);
  }, [windowHeight, insets.top, insets.bottom, keyboardInset, topReserve, bottomGap, minHeight]);

  const handleContentSizeChange = (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    if (uncapped) {
      const next = Math.max(minHeight, Math.ceil(event.nativeEvent.contentSize.height));
      setGrownHeight((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    }
    onContentSizeChange?.(event);
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>
  ) => {
    lastSelectionRef.current = event.nativeEvent.selection;
    onSelectionChange?.(event);
  };

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    onFocus?.(event);
    const selection = lastSelectionRef.current;
    if (!selection) return;

    const valueLength =
      typeof rest.value === 'string'
        ? rest.value.length
        : typeof rest.defaultValue === 'string'
          ? rest.defaultValue.length
          : selection.end;
    const restoredSelection = {
      start: Math.min(selection.start, valueLength),
      end: Math.min(selection.end, valueLength),
    };

    // Keep selection uncontrolled during typing so Japanese IME composition is
    // not disturbed. Restore only once when native focus returns after blur.
    inputRef.current?.setNativeProps({ selection: restoredSelection });
  };

  /**
   * Uncapped uses minHeight (not height) so the field can still grow from the
   * native intrinsic measurement. A fixed height makes some platforms report a
   * content size derived from that same frame, which freezes growth.
   */
  const uncappedStyle = { minHeight: Math.max(minHeight, grownHeight) };

  const effectiveScrollEnabled = uncapped ? false : (scrollEnabled ?? true);

  return (
    <TextInput
      {...rest}
      ref={setInputRef}
      multiline
      textAlignVertical={rest.textAlignVertical ?? 'top'}
      scrollEnabled={effectiveScrollEnabled}
      onContentSizeChange={handleContentSizeChange}
      onSelectionChange={handleSelectionChange}
      onFocus={handleFocus}
      // Android: allow dragging inside while parent KeyboardAwareScrollView is present
      {...(Platform.OS === 'android' && !uncapped ? { nestedScrollEnabled: true } : null)}
      style={[style, uncapped ? uncappedStyle : { minHeight, maxHeight }]}
    />
  );
});
