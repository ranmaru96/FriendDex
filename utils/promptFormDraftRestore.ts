import { Alert } from 'react-native';

export function promptFormDraftRestore(options: {
  onRestore: () => void;
  onDecline: () => void;
  onDismiss?: () => void;
}): void {
  Alert.alert(
    '前回の下書きを復元しますか？',
    undefined,
    [
      { text: '復元しない', style: 'cancel', onPress: options.onDecline },
      { text: '復元する', onPress: options.onRestore },
    ],
    { cancelable: true, onDismiss: options.onDismiss }
  );
}
