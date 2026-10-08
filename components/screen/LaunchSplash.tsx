import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

/** 起動時の待ち画面。黒地の中央にアプリ名だけ */
export function LaunchSplash() {
  const hideNativeSplash = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.root} onLayout={hideNativeSplash}>
      <StatusBar style="light" />
      <Text style={styles.title}>Friend Dex</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '500',
  },
});
