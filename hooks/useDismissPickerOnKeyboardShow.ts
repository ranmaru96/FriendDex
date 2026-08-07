import { useEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * While an inline date/time (or roll) picker is open waiting for 「完了」,
 * closing it when a TextInput takes focus — detected via keyboard show.
 * Matches 「完了」: selected value is already applied on each spin change.
 */
export function useDismissPickerOnKeyboardShow(
  pickerOpen: boolean,
  dismiss: () => void
): void {
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!pickerOpen) return;
    const eventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(eventName, () => {
      dismissRef.current();
    });
    return () => sub.remove();
  }, [pickerOpen]);
}
