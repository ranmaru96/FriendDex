import { useCallback, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Theme, Radius, Spacing, Typography } from '@/constants/theme';
import { getAllProfiles, getMyself, initializeDatabase } from '../db';
import { Profile } from '../types';

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

export default function MyProfileQrScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isReady, setIsReady] = useState(false);

  const loadProfile = useCallback(() => {
    initializeDatabase();
    const profiles = getAllProfiles();
    const resolvedId = resolveMyselfProfileId(profiles, getMyself());
    const myselfProfile = profiles.find((item) => item.id === resolvedId) ?? null;
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

  const qrValue = qrData ? JSON.stringify(qrData) : '';

  if (!isReady) {
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ 戻る</Text>
        </Pressable>
        <Text style={styles.headerTitle}>QRコード名刺</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!profile ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyMessage}>本人設定が完了していません</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.replace('/appsettings')}>
              <Text style={styles.primaryButtonText}>設定画面へ戻る</Text>
            </Pressable>
          </View>
        ) : !hasPublicFields ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyMessage}>
              公開する項目がありません。{'\n'}マイプロフィール画面で設定してください。
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/myprofile')}>
              <Text style={styles.primaryButtonText}>マイプロフィールを編集</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.qrCard}>
              <View style={styles.qrCodeWrap}>
                <QRCode value={qrValue} size={220} backgroundColor="white" color="black" />
              </View>
              <Text style={styles.qrHint}>スキャンして読み取ってもらおう</Text>
            </View>

            <View style={styles.chipSection}>
              <Text style={styles.chipSectionTitle}>公開中の項目</Text>
              <View style={styles.chipRow}>
                {publicFields.map((key) => (
                  <View key={key} style={styles.chip}>
                    <Text style={styles.chipText}>{FIELD_LABELS[key] ?? key}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Pressable style={styles.primaryButton} onPress={() => router.push('/myprofile')}>
              <Text style={styles.primaryButtonText}>マイプロフィールを編集</Text>
            </Pressable>

            <Pressable style={[styles.primaryButton, styles.scanButton]} onPress={() => router.push('/scan')}>
              <Text style={styles.primaryButtonText}>QRをスキャンして友達を登録</Text>
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
    backgroundColor: '#f2f5f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backButton: {
    minWidth: 72,
  },
  backText: {
    fontSize: 17,
    color: '#2563eb',
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSide: {
    minWidth: 72,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 32,
  },
  qrCard: {
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  qrCodeWrap: {
    padding: Spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
  },
  qrHint: {
    fontSize: Typography.base,
    color: '#64748b',
    textAlign: 'center',
  },
  chipSection: {
    marginBottom: Spacing.lg,
  },
  chipSectionTitle: {
    fontSize: Typography.base,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: Spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Radius.full,
    backgroundColor: Theme.bgSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  chipText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: '#0f172a',
  },
  primaryButton: {
    borderRadius: Radius.md,
    backgroundColor: Theme.btnPrimaryBg,
    borderWidth: 1,
    borderColor: Theme.btnPrimaryBg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scanButton: {
    marginTop: Spacing.md,
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
  },
  emptyMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
  },
});
