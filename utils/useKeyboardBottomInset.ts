import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Bottom inset matching the on-screen keyboard height.
 * Use as paddingBottom / marginBottom on the form body so the visible
 * area (and multiline TextInput frames) stay above the keyboard.
 */
export function useKeyboardBottomInset(): number {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (event) => {
      setBottomInset(event.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setBottomInset(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return bottomInset;
}
