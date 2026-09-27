import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthGateView } from '@/components/auth/AuthGateView';

export default function AuthPreviewScreen() {
  const router = useRouter();
  return (
    <AuthGateView
      preview
      onClose={() => router.back()}
      onEmailSubmit={() => {
        Alert.alert('プレビュー', '見た目確認用です。送信・復元はしません。');
      }}
      onSocialSubmit={() => {
        Alert.alert('プレビュー', '見た目確認用です。送信・復元はしません。');
      }}
    />
  );
}
