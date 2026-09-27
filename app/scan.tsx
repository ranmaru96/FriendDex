import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BarcodeScanningResult,
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenShell } from '@/components/screen/ScreenShell';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';
import { parseQrScanPayload, qrPayloadToRouteParams } from '@/utils/qrScanHelpers';
import { Theme } from '@/constants/theme';
import { requireOnline } from '@/lib/networkReachability';

const FRAME_SIZE = 250;
const SCAN_FAILURE_COOLDOWN_MS = 3000;

type ScanRejectReason = 'invalid_format' | 'empty_user_id';

const getScanRejectReason = (data: string): ScanRejectReason | null => {
  const payload = parseQrScanPayload(data);
  if (!payload) {
    return 'invalid_format';
  }
  if (!payload.userId.trim()) {
    return 'empty_user_id';
  }
  return null;
};

const scanRejectMessage = (reason: ScanRejectReason): string => {
  if (reason === 'empty_user_id') {
    return 'QRコードのユーザーIDが未設定です。FriendDexで生成したQRの場合は、マイプロフィール画面で一度保存し直してからお試しください。';
  }
  return 'QRコードの形式が正しくありません。FriendDex用のQRコードか確認してください。';
};

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [isPickingFromLibrary, setIsPickingFromLibrary] = useState(false);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFailedDataRef = useRef<string | null>(null);
  const failureCooldownUntilRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      setScanned(false);
      setScanComplete(false);
    }, [])
  );

  const navigateToQrImport = useCallback(
    (data: string) => {
      const rejectReason = getScanRejectReason(data);
      if (rejectReason) {
        return { ok: false as const, reason: rejectReason };
      }

      const payload = parseQrScanPayload(data);
      if (!payload) {
        return { ok: false as const, reason: 'invalid_format' as const };
      }

      if (navigateTimerRef.current) {
        clearTimeout(navigateTimerRef.current);
      }

      navigateTimerRef.current = setTimeout(() => {
        router.push({
          pathname: '/qr-import',
          params: qrPayloadToRouteParams(payload),
        });
      }, 500);
      return { ok: true as const };
    },
    [router]
  );

  const showScanFailure = useCallback((data: string, reason: ScanRejectReason) => {
    const now = Date.now();
    if (lastFailedDataRef.current === data && now < failureCooldownUntilRef.current) {
      return;
    }
    lastFailedDataRef.current = data;
    failureCooldownUntilRef.current = now + SCAN_FAILURE_COOLDOWN_MS;
    Alert.alert('エラー', scanRejectMessage(reason), [{ text: 'OK' }]);
  }, []);

  const processScanData = useCallback(
    (data: string) => {
      if (scanned) return;
      if (!requireOnline()) {
        return;
      }

      const result = navigateToQrImport(data);
      if (!result.ok) {
        showScanFailure(data, result.reason);
        return;
      }

      lastFailedDataRef.current = null;
      setScanned(true);
      setScanComplete(true);
    },
    [navigateToQrImport, scanned, showScanFailure]
  );

  const handleScan = useCallback(
    ({ data }: BarcodeScanningResult) => {
      processScanData(data);
    },
    [processScanData]
  );

  const pickFromLibrary = useCallback(async () => {
    if (scanned || isPickingFromLibrary) return;

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (pickerResult.canceled || !pickerResult.assets[0]?.uri) {
      return;
    }

    setIsPickingFromLibrary(true);
    try {
      const barcodes = await scanFromURLAsync(pickerResult.assets[0].uri, ['qr']);
      if (!barcodes.length) {
        Alert.alert('エラー', '画像からQRコードを読み取れませんでした');
        return;
      }
      processScanData(barcodes[0].data);
    } catch {
      Alert.alert('エラー', '画像の読み取りに失敗しました');
    } finally {
      setIsPickingFromLibrary(false);
    }
  }, [isPickingFromLibrary, processScanData, scanned]);

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <ScreenShell>
        <ScreenTopBar onBack={() => router.back()} title="QRスキャン" />
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
          <Pressable
            style={[styles.libraryButtonLight, isPickingFromLibrary && styles.libraryButtonDisabled]}
            onPress={pickFromLibrary}
            disabled={isPickingFromLibrary}
          >
            <Text style={styles.libraryButtonTextLight}>
              {isPickingFromLibrary ? '読み取り中…' : 'ライブラリから選択'}
            </Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell backgroundColor="#000">
      <ScreenTopBar
        variant="plain"
        onBack={() => router.back()}
        title="QRスキャン"
        backTextStyle={styles.topBarLightText}
        titleStyle={styles.topBarLightText}
      />
      <View style={styles.cameraArea}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleScan}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />

        <View style={styles.overlay} pointerEvents="box-none">
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
            <Pressable
              style={[styles.libraryButton, (scanned || isPickingFromLibrary) && styles.libraryButtonDisabled]}
              onPress={pickFromLibrary}
              disabled={scanned || isPickingFromLibrary}
            >
              <Text style={styles.libraryButtonText}>
                {isPickingFromLibrary ? '読み取り中…' : 'ライブラリから選択'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  cameraArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  permissionText: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  libraryButton: {
    marginTop: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  libraryButtonDisabled: {
    opacity: 0.55,
  },
  libraryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  libraryButtonLight: {
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#94a3b8',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  libraryButtonTextLight: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topBarLightText: {
    color: '#ffffff',
  },
  overlayTop: {
    flex: 0.55,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    borderWidth: 2,
    borderColor: '#67e8f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameSuccessText: {
    color: '#fff',
    fontWeight: '700',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  overlayBottom: {
    flex: 1.45,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    paddingTop: 24,
    gap: 12,
  },
  hintText: {
    color: '#fff',
    fontSize: 15,
  },
});
