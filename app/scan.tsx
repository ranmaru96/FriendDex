import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';

const FRAME_SIZE = 250;

type ScannedProfile = {
  name?: string;
  nickname?: string;
  birthday?: string;
  height?: number | string;
  weight?: number | string;
  origin?: string;
  residence?: string;
  mbti?: string;
};

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScan = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (scanned) return;
      setScanned(true);

      let parsed: ScannedProfile;
      try {
        parsed = JSON.parse(data) as ScannedProfile;
      } catch {
        Alert.alert('エラー', 'QRコードを読み取れませんでした', [
          { text: 'OK', onPress: () => setScanned(false) },
        ]);
        return;
      }

      setScanComplete(true);

      if (navigateTimerRef.current) {
        clearTimeout(navigateTimerRef.current);
      }

      navigateTimerRef.current = setTimeout(() => {
        router.push({
          pathname: '/edit',
          params: {
            name: parsed.name ?? '',
            nickname: parsed.nickname ?? '',
            birthday: parsed.birthday ?? '',
            height: parsed.height?.toString() ?? '',
            weight: parsed.weight?.toString() ?? '',
            origin: parsed.origin ?? '',
            residence: parsed.residence ?? '',
            mbti: parsed.mbti ?? '',
            fromScan: 'true',
          },
        });
      }, 500);
    },
    [router, scanned]
  );

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ 戻る</Text>
        </Pressable>
        <View style={styles.permissionContent}>
          {permission.canAskAgain ? (
            <>
              <Text style={styles.permissionText}>カメラへのアクセスを許可してください</Text>
              <Pressable style={styles.permissionButton} onPress={requestPermission}>
                <Text style={styles.permissionButtonText}>許可する</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.permissionText}>設定アプリからカメラを許可してください</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ 戻る</Text>
        </Pressable>

        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.frame}>
            {scanComplete && <Text style={styles.frameSuccessText}>読み取りました</Text>}
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.hintText}>QRコードをかざしてください</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  permissionContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  permissionText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  frameSuccessText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    paddingTop: 24,
  },
  hintText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 8,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
});
