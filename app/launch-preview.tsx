import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LaunchSplash } from '@/components/screen/LaunchSplash';

export default function LaunchPreviewScreen() {
  const router = useRouter();
  return (
    <Pressable style={styles.fill} onPress={() => router.back()}>
      <LaunchSplash />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
