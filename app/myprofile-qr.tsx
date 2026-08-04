import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-skia';
import Svg, { Circle, Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { Theme, Radius, Spacing, Typography } from '@/constants/theme';
import { useSubScreenHeaderStyles } from '@/components/screen/subScreenHeaderStyles';
import { useAppTheme } from '@/contexts/AppThemeContext';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTagTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { getAllProfiles, ensureProfileUserId, getMyself, initializeDatabase } from '../db';
import { Profile } from '../types';

const QR_SIZE = 280;
const ICON_SIZE = 56;
const QR_COLOR = '#000000';
const CARD_BG = '#ffffff';

const QR_KEYS = ['name', 'nickname', 'birthday', 'height', 'weight', 'origin', 'residence', 'mbti'] as const;

type QrKey = (typeof QR_KEYS)[number];

const FIELD_LABELS: Record<string, string> = {
  name: '名前',
  nickname: '通称・あだ名',
  birthday: '誕生日',
  height: '身長',
  weight: '体重',
  origin: '出身',
  residence: '居住地',
  mbti: 'MBTI',
};

type QrPayload = {
  userId: string;
  publicFields: string[];
} & Partial<Record<QrKey, string | number | null>>;

const resolveMyselfProfileId = (profiles: Profile[], myselfFriendId: string | null): string => {
  if (!myselfFriendId) {
    return '';
  }
  const defaultMatch = profiles.find((profile) => profile.friendId === myselfFriendId && profile.isDefault);
  if (defaultMatch) {
    return defaultMatch.id;
  }
  return profiles.find((profile) => profile.friendId === myselfFriendId)?.id ?? '';
};

const buildQrData = (profile: Profile): QrPayload => {
  const publicFields = profile.publicFields ?? [];
  const data: QrPayload = {
    userId: profile.userId ?? '',
    publicFields: [...publicFields],
  };

  publicFields.forEach((key) => {
    if ((QR_KEYS as readonly string[]).includes(key)) {
      data[key as QrKey] = profile[key as QrKey];
    }
  });

  return data;
};

type FriendDexIconProps = {
  size: number;
  color: string;
};

function FriendDexIcon({ size, color }: FriendDexIconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: CARD_BG,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Svg width={size * 0.92} height={size * 0.92} viewBox="0 0 100 80">
        <Circle cx="32" cy="22" r="7" fill={color} />
        <Path d="M23 50 L23 38 Q23 34 32 34 Q41 34 41 38 L41 50 Z" fill={color} />

        <Circle cx="68" cy="22" r="7" fill={color} />
        <Path d="M59 50 L59 38 Q59 34 68 34 Q77 34 77 38 L77 50 Z" fill={color} />

        <Circle cx="50" cy="30" r="10" fill={color} />
        <Path d="M36 62 L36 46 Q36 42 50 42 Q64 42 64 46 L64 62 Z" fill={color} />
      </Svg>
    </View>
  );
}

type ActionButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

function ActionButton({ icon, label, onPress }: ActionButtonProps) {
  const content = useContentColors();
  return (
    <Pressable style={styles.actionButton} onPress={onPress}>
      <View style={[styles.actionIconWrap, contentSurfaceStyle(content)]}>
        <Ionicons name={icon} size={24} color={content.contentText} />
      </View>
      <Text style={[styles.actionLabel, contentTextStyle(content)]}>{label}</Text>
    </Pressable>
  );
}

export default function MyProfileQrScreen() {
  const router = useRouter();
  const { colors: appTheme } = useAppTheme();
  const content = useContentColors();
  const headerStyles = useSubScreenHeaderStyles();
  const cardShotRef = useRef<ViewShot>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isReady, setIsReady] = useState(false);

  const loadProfile = useCallback(() => {
    initializeDatabase();
    const profiles = getAllProfiles();
    const resolvedId = resolveMyselfProfileId(profiles, getMyself());
    if (resolvedId) {
      ensureProfileUserId(resolvedId);
    }
    const refreshedProfiles = getAllProfiles();
    const myselfProfile = refreshedProfiles.find((item) => item.id === resolvedId) ?? null;
    setProfile(myselfProfile);
    setIsReady(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const publicFields = profile?.publicFields ?? [];
  const hasPublicFields = publicFields.length > 0;

  const qrData = useMemo(() => {
    if (!profile || !hasPublicFields) {
      return null;
    }
    return buildQrData(profile);
  }, [profile, hasPublicFields]);

  const qrValue = useMemo(() => (qrData ? JSON.stringify(qrData) : ''), [qrData]);

  const displayName = profile?.nickname?.trim() || profile?.name?.trim() || '';

  const captureCard = useCallback(async (): Promise<string | null> => {
    const uri = await cardShotRef.current?.capture?.();
    if (!uri) {
      Alert.alert('エラー', '画像の生成に失敗しました');
      return null;
    }
    return uri;
  }, []);

  const handleShare = useCallback(async () => {
    try {
      const uri = await captureCard();
      if (!uri) {
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('シェアできません', 'この端末ではシェア機能が使えません');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'QRコード名刺をシェア',
      });
    } catch {
      Alert.alert('エラー', 'シェアに失敗しました');
    }
  }, [captureCard]);

  const handleCopyLink = useCallback(async () => {
    if (!qrValue) {
      return;
    }
    await Clipboard.setStringAsync(qrValue);
    Alert.alert('コピーしました', 'QRコードの内容をクリップボードにコピーしました');
  }, [qrValue]);

  const handleDownload = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('権限が必要です', '画像を保存するには写真ライブラリへのアクセスが必要です');
        return;
      }

      const uri = await captureCard();
      if (!uri) {
        return;
      }

      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('保存しました', 'QRコード名刺をフォトライブラリに保存しました');
    } catch {
      Alert.alert('エラー', '保存に失敗しました');
    }
  }, [captureCard]);

  if (!isReady) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: appTheme.screenBackground }]}>
      <View style={headerStyles.bar}>
        <Pressable style={styles.headerIconButton} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={appTheme.topBarText} />
        </Pressable>
        <Text style={headerStyles.title}>QRコード</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerIconButton}
            onPress={() => router.push('/myprofile')}
            accessibilityLabel="公開項目の設定"
          >
            <Ionicons name="settings-outline" size={22} color={appTheme.topBarText} />
          </Pressable>
          <Pressable
            style={styles.headerIconButton}
            onPress={() => router.push('/scan')}
            accessibilityLabel="QRコードを読み取る"
          >
            <Ionicons name="scan-outline" size={24} color={appTheme.topBarText} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!profile ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyMessage, contentMutedTextStyle(content)]}>本人設定が完了していません</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/appsettings')}>
              <Text style={styles.primaryButtonText}>設定画面へ戻る</Text>
            </Pressable>
          </View>
        ) : !hasPublicFields ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyMessage, contentMutedTextStyle(content)]}>
              公開する項目がありません。{'\n'}マイプロフィール画面で設定してください。
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/myprofile')}>
              <Text style={styles.primaryButtonText}>マイプロフィールを編集</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ViewShot ref={cardShotRef} options={{ format: 'png', quality: 1 }}>
              <View style={styles.designCard} collapsable={false}>
                <QRCode
                  value={qrValue}
                  size={QR_SIZE}
                  color={QR_COLOR}
                  errorCorrectionLevel="H"
                  shapeOptions={{
                    shape: 'circle',
                    eyePatternShape: 'rounded',
                    gap: 0,
                    eyePatternGap: 0,
                  }}
                  logoAreaSize={ICON_SIZE + 12}
                  logo={<FriendDexIcon size={ICON_SIZE} color={QR_COLOR} />}
                />
                <Text style={styles.displayName}>{displayName}</Text>
              </View>
            </ViewShot>

            <View style={styles.actionRow}>
              <ActionButton icon="share-outline" label="QRをシェア" onPress={handleShare} />
              <ActionButton icon="link-outline" label="リンクをコピー" onPress={handleCopyLink} />
              <ActionButton icon="download-outline" label="ダウンロード" onPress={handleDownload} />
            </View>

            <View style={styles.chipSection}>
              <Text style={[styles.chipSectionTitle, contentMutedTextStyle(content)]}>公開中の項目</Text>
              <View style={styles.chipRow}>
                {publicFields.map((key) => (
                  <View key={key} style={[styles.chip, contentTagStyle(content)]}>
                    <Text style={[styles.chipText, contentTagTextStyle(content)]}>{FIELD_LABELS[key] ?? key}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Pressable
              style={styles.settingsButton}
              onPress={() => router.push('/myprofile')}
              accessibilityRole="button"
              accessibilityLabel="公開項目を設定"
            >
              <Ionicons name="settings-outline" size={18} color="#FFFFFF" />
              <Text style={styles.settingsButtonText}>公開項目を設定</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 32,
    alignItems: 'center',
  },
  designCard: {
    width: 320,
    borderRadius: 24,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: CARD_BG,
    marginBottom: Spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  displayName: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
    color: QR_COLOR,
    textTransform: 'none',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
    marginBottom: Spacing.lg,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
    lineHeight: 14,
  },
  chipSection: {
    marginBottom: Spacing.md,
    width: '100%',
    maxWidth: 320,
  },
  chipSectionTitle: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.full,
    backgroundColor: '#f8fafc',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  chipText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: '#64748b',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 320,
    borderRadius: Radius.md,
    backgroundColor: '#5EC8F0',
    borderWidth: 1,
    borderColor: '#4BB8E0',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: Radius.md,
    backgroundColor: Theme.btnPrimaryBg,
    borderWidth: 1,
    borderColor: Theme.btnPrimaryBg,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: Theme.btnPrimaryText,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
    alignItems: 'center',
    width: '100%',
  },
  emptyMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
  },
});
