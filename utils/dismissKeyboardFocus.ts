import { Keyboard, TextInput } from 'react-native';

/**
 * Blur the focused TextInput and close the keyboard.
 * Form scrolls use keyboardShouldPersistTaps="handled", so a tap that opens a
 * picker keeps the previous field focused unless it blurs explicitly.
 * Call this before opening a date picker / option modal.
 */
export function dismissKeyboardFocus(): void {
  const focused = TextInput.State.currentlyFocusedInput?.();
  if (focused) {
    TextInput.State.blurTextInput(focused);
  }
  Keyboard.dismiss();
}
