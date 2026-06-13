import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Theme, Radius, Spacing, Typography } from '@/constants/theme';
import { getAllProfiles, getMyself, initializeDatabase, updateProfile } from '../db';
import { MBTIType, Profile } from '../types';

type PublicFieldKey =
  | 'name'
  | 'nickname'
  | 'birthday'
  | 'height'
  | 'weight'
  | 'origin'
  | 'residence'
  | 'mbti';

type FieldConfig = {
  key: PublicFieldKey;
  label: string;
  keyboardType?: 'default' | 'numeric';
};

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'name', label: '名前' },
  { key: 'nickname', label: '通称・あだ名' },
  { key: 'birthday', label: '誕生日' },
  { key: 'height', label: '身長', keyboardType: 'numeric' },
  { key: 'weight', label: '体重', keyboardType: 'numeric' },
  { key: 'origin', label: '出身' },
  { key: 'residence', label: '居住地' },
  { key: 'mbti', label: 'MBTI' },
];

type MyProfileForm = Record<PublicFieldKey, string>;

const emptyForm = (): MyProfileForm => ({
  name: '',
  nickname: '',
  birthday: '',
  height: '',
  weight: '',
  origin: '',
  residence: '',
  mbti: '',
});

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

const profileToForm = (profile: Profile): MyProfileForm => ({
  name: profile.name,
  nickname: profile.nickname,
  birthday: profile.birthday,
  height: profile.height != null ? String(profile.height) : '',
  weight: profile.weight != null ? String(profile.weight) : '',
  origin: profile.origin,
  residence: profile.residence,
  mbti: profile.mbti,
});

const parseOptionalNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function MyProfileScreen() {
  const router = useRouter();
  const [profileId, setProfileId] = useState('');
  const [form, setForm] = useState<MyProfileForm>(emptyForm);
  const [publicFields, setPublicFields] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  const loadMyProfile = useCallback(() => {
    initializeDatabase();
    const profiles = getAllProfiles();
    const myselfFriendId = getMyself();
    const resolvedId = resolveMyselfProfileId(profiles, myselfFriendId);
    const profile = profiles.find((item) => item.id === resolvedId) ?? null;

    if (!profile) {
      setProfileId('');
      setForm(emptyForm());
      setPublicFields([]);
      setHasProfile(false);
      setIsReady(true);
      return;
    }

    setProfileId(profile.id);
    setForm(profileToForm(profile));
    setPublicFields(profile.publicFields ?? []);
    setHasProfile(true);
    setIsReady(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyProfile();
    }, [loadMyProfile])
  );

  const publicFieldSet = useMemo(() => new Set(publicFields), [publicFields]);

  const updateField = (key: PublicFieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const togglePublicField = (key: PublicFieldKey, enabled: boolean) => {
    setPublicFields((prev) => {
      if (enabled) {
        return prev.includes(key) ? prev : [...prev, key];
      }
      return prev.filter((item) => item !== key);
    });
  };

  const handleSave = () => {
    if (!profileId) {
      return;
    }
    if (!form.name.trim()) {
      Alert.alert('入力エラー', '名前を入力してください。');
      return;
    }

    initializeDatabase();
    const ok = updateProfile(profileId, {
      name: form.name.trim(),
      nickname: form.nickname.trim(),
      birthday: form.birthday.trim(),
      height: parseOptionalNumber(form.height),
      weight: parseOptionalNumber(form.weight),
      origin: form.origin.trim(),
      residence: form.residence.trim(),
      mbti: form.mbti.trim() as MBTIType,
      publicFields,
    });

    if (!ok) {
      Alert.alert('エラー', '保存に失敗しました。');
      return;
    }

    Alert.alert('保存しました', 'プロフィールを更新しました。');
    loadMyProfile();
  };

  const handleShowQr = () => {
    router.push('/myprofile-qr');
  };

  if (!isReady) {
    return null;
  }

  if (!hasProfile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>‹ 戻る</Text>
          </Pressable>
          <Text style={styles.headerTitle}>自分のプロフィール</Text>
          <View style={styles.headerSide} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyMessage}>本人設定が完了していません</Text>
          <Pressable style={styles.settingsButton} onPress={() => router.replace('/appsettings')}>
            <Text style={styles.settingsButtonText}>設定画面へ戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹ 戻る</Text>
        </Pressable>
        <Text style={styles.headerTitle}>自分のプロフィール</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHint}>各項目の右側スイッチで公開する項目を選べます</Text>

        <View style={styles.formGroup}>
          {FIELD_CONFIGS.map((field, index) => (
            <View key={field.key}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <TextInput
                  value={form[field.key]}
                  onChangeText={(text) => updateField(field.key, text)}
                  style={styles.fieldInput}
                  keyboardType={field.keyboardType ?? 'default'}
                  placeholderTextColor={Theme.textSecondary}
                  autoCapitalize="none"
                />
                <Switch
                  value={publicFieldSet.has(field.key)}
                  onValueChange={(enabled) => togglePublicField(field.key, enabled)}
                  trackColor={{ false: Theme.border, true: Theme.accentLight }}
                  thumbColor={publicFieldSet.has(field.key) ? Theme.accent : Theme.bgSurface}
                />
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>保存する</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={handleShowQr}>
          <Text style={styles.secondaryButtonText}>QRコードを表示</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.screenBase,
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
  sectionHint: {
    fontSize: Typography.base,
    color: '#64748b',
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  formGroup: {
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  fieldLabel: {
    width: 88,
    fontSize: Typography.base,
    fontWeight: '600',
    color: '#0f172a',
  },
  fieldInput: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.sm,
    backgroundColor: Theme.inputBg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    fontSize: Typography.base,
    color: Theme.textPrimary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.border,
    marginLeft: Spacing.md,
  },
  primaryButton: {
    borderRadius: Radius.md,
    backgroundColor: Theme.btnPrimaryBg,
    borderWidth: 1,
    borderColor: Theme.btnPrimaryBg,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  primaryButtonText: {
    color: Theme.btnPrimaryText,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  emptyMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  settingsButton: {
    borderRadius: Radius.md,
    backgroundColor: Theme.btnPrimaryBg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  settingsButtonText: {
    color: Theme.btnPrimaryText,
    fontSize: 15,
    fontWeight: '700',
  },
});
