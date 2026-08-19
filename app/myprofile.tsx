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
import { OffsetCard } from '@/components/ui/OffsetCard';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { Theme, Radius, Spacing, Typography } from '@/constants/theme';
import { useSubScreenHeaderStyles } from '@/components/screen/subScreenHeaderStyles';
import { useAppTheme } from '@/contexts/AppThemeContext';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentSwitchColors,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { getAllProfiles, getMyself, initializeDatabase, updateProfile } from '../db';
import { MBTIType, Profile } from '../types';
import { isPersonNameValid, resolvePersonNameParts } from '@/utils/personName';

type PublicFieldKey =
  | 'name'
  | 'nickname'
  | 'birthday'
  | 'height'
  | 'weight'
  | 'origin'
  | 'residence'
  | 'mbti';

type FormFieldKey = Exclude<PublicFieldKey, 'name'>;

type FieldConfig = {
  key: FormFieldKey;
  label: string;
  keyboardType?: 'default' | 'numeric';
};

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'nickname', label: '通称・あだ名' },
  { key: 'birthday', label: '誕生日' },
  { key: 'height', label: '身長', keyboardType: 'numeric' },
  { key: 'weight', label: '体重', keyboardType: 'numeric' },
  { key: 'origin', label: '出身' },
  { key: 'residence', label: '居住地' },
  { key: 'mbti', label: 'MBTI' },
];

type MyProfileForm = Record<FormFieldKey, string> & {
  familyName: string;
  givenName: string;
};

const emptyForm = (): MyProfileForm => ({
  familyName: '',
  givenName: '',
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
  familyName: profile.familyName,
  givenName: profile.givenName,
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
  const { colors: appTheme, patternId } = useAppTheme();
  const content = useContentColors();
  const switchColors = contentSwitchColors(content);
  const headerStyles = useSubScreenHeaderStyles();
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

  const updateField = (key: keyof MyProfileForm, value: string) => {
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
    if (!isPersonNameValid(form.familyName, form.givenName)) {
      Alert.alert('入力エラー', '苗字か名前のどちらかを入力してください。');
      return;
    }

    const nameParts = resolvePersonNameParts(form);
    initializeDatabase();
    const ok = updateProfile(profileId, {
      name: nameParts.name,
      familyName: nameParts.familyName,
      givenName: nameParts.givenName,
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
      <SafeAreaView style={[styles.safe, { backgroundColor: appTheme.screenBackground }]}>
        <View style={headerStyles.bar}>
          <Pressable style={headerStyles.sideBack} onPress={() => router.back()}>
            <Text style={headerStyles.backText}>‹ 戻る</Text>
          </Pressable>
          <Text style={headerStyles.title}>自分のプロフィール</Text>
          <View style={headerStyles.side} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyMessage, contentMutedTextStyle(content)]}>本人設定が完了していません</Text>
          <Pressable
            style={[styles.settingsButton, contentFilledButtonStyle(content)]}
            onPress={() => router.replace('/appsettings')}
          >
            <Text style={[styles.settingsButtonText, contentFilledButtonTextStyle(content)]}>
              設定画面へ戻る
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: appTheme.screenBackground }]}>
      <View style={headerStyles.bar}>
        <Pressable style={headerStyles.sideBack} onPress={() => router.back()}>
          <Text style={headerStyles.backText}>‹ 戻る</Text>
        </Pressable>
        <Text style={headerStyles.title}>自分のプロフィール</Text>
        <View style={headerStyles.side} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionHint, contentMutedTextStyle(content)]}>各項目の右側スイッチで公開する項目を選べます</Text>

        {usesOffsetChrome(patternId) ? (
        <OffsetCard style={{ marginBottom: Spacing.lg }} contentStyle={{ overflow: 'hidden' }}>
        <View style={[styles.formGroup, { borderWidth: 0, borderRadius: 0, marginBottom: 0 }]}>
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, contentTextStyle(content)]}>名前を公開</Text>
            <View style={styles.fieldInputSpacer} />
            <Switch
              value={publicFieldSet.has('name')}
              onValueChange={(enabled) => togglePublicField('name', enabled)}
              trackColor={switchColors.trackColor}
              thumbColor={publicFieldSet.has('name') ? switchColors.thumbColorOn : switchColors.thumbColorOff}
              accessibilityLabel="名前を公開"
            />
          </View>
          <View style={[styles.separator, { backgroundColor: content.contentDivider }]} />
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, contentTextStyle(content)]}>苗字</Text>
            <TextInput
              value={form.familyName}
              onChangeText={(text) => updateField('familyName', text)}
              style={[styles.fieldInput, contentInputStyle(content)]}
              placeholder="苗字"
              placeholderTextColor={content.contentTextSecondary}
              autoCapitalize="none"
            />
          </View>
          <View style={[styles.separator, { backgroundColor: content.contentDivider }]} />
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, contentTextStyle(content)]}>名前</Text>
            <TextInput
              value={form.givenName}
              onChangeText={(text) => updateField('givenName', text)}
              style={[styles.fieldInput, contentInputStyle(content)]}
              placeholder="名前"
              placeholderTextColor={content.contentTextSecondary}
              autoCapitalize="none"
            />
          </View>
          {FIELD_CONFIGS.map((field) => (
            <View key={field.key}>
              <View style={[styles.separator, { backgroundColor: content.contentDivider }]} />
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, contentTextStyle(content)]}>{field.label}</Text>
                <TextInput
                  value={form[field.key]}
                  onChangeText={(text) => updateField(field.key, text)}
                  style={[styles.fieldInput, contentInputStyle(content)]}
                  keyboardType={field.keyboardType ?? 'default'}
                  placeholderTextColor={content.contentTextSecondary}
                  autoCapitalize="none"
                />
                <Switch
                  value={publicFieldSet.has(field.key)}
                  onValueChange={(enabled) => togglePublicField(field.key, enabled)}
                  trackColor={switchColors.trackColor}
                  thumbColor={
                    publicFieldSet.has(field.key) ? switchColors.thumbColorOn : switchColors.thumbColorOff
                  }
                />
              </View>
            </View>
          ))}
        </View>
        </OffsetCard>
        ) : (
        <View style={[styles.formGroup, contentSurfaceStyle(content)]}>
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, contentTextStyle(content)]}>名前を公開</Text>
            <View style={styles.fieldInputSpacer} />
            <Switch
              value={publicFieldSet.has('name')}
              onValueChange={(enabled) => togglePublicField('name', enabled)}
              trackColor={switchColors.trackColor}
              thumbColor={publicFieldSet.has('name') ? switchColors.thumbColorOn : switchColors.thumbColorOff}
              accessibilityLabel="名前を公開"
            />
          </View>
          <View style={[styles.separator, { backgroundColor: content.contentDivider }]} />
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, contentTextStyle(content)]}>苗字</Text>
            <TextInput
              value={form.familyName}
              onChangeText={(text) => updateField('familyName', text)}
              style={[styles.fieldInput, contentInputStyle(content)]}
              placeholder="苗字"
              placeholderTextColor={content.contentTextSecondary}
              autoCapitalize="none"
            />
          </View>
          <View style={[styles.separator, { backgroundColor: content.contentDivider }]} />
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, contentTextStyle(content)]}>名前</Text>
            <TextInput
              value={form.givenName}
              onChangeText={(text) => updateField('givenName', text)}
              style={[styles.fieldInput, contentInputStyle(content)]}
              placeholder="名前"
              placeholderTextColor={content.contentTextSecondary}
              autoCapitalize="none"
            />
          </View>
          {FIELD_CONFIGS.map((field) => (
            <View key={field.key}>
              <View style={[styles.separator, { backgroundColor: content.contentDivider }]} />
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, contentTextStyle(content)]}>{field.label}</Text>
                <TextInput
                  value={form[field.key]}
                  onChangeText={(text) => updateField(field.key, text)}
                  style={[styles.fieldInput, contentInputStyle(content)]}
                  keyboardType={field.keyboardType ?? 'default'}
                  placeholderTextColor={content.contentTextSecondary}
                  autoCapitalize="none"
                />
                <Switch
                  value={publicFieldSet.has(field.key)}
                  onValueChange={(enabled) => togglePublicField(field.key, enabled)}
                  trackColor={switchColors.trackColor}
                  thumbColor={
                    publicFieldSet.has(field.key) ? switchColors.thumbColorOn : switchColors.thumbColorOff
                  }
                />
              </View>
            </View>
          ))}
        </View>
        )}

        <Pressable
          style={[styles.primaryButton, contentFilledButtonStyle(content)]}
          onPress={handleSave}
        >
          <Text style={[styles.primaryButtonText, contentFilledButtonTextStyle(content)]}>保存する</Text>
        </Pressable>

        <Pressable style={[styles.secondaryButton, contentSurfaceStyle(content)]} onPress={handleShowQr}>
          <Text style={[styles.secondaryButtonText, contentTextStyle(content)]}>QRコードを表示</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
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
  fieldInputSpacer: {
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.border,
    marginLeft: Spacing.md,
  },
  primaryButton: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  primaryButtonText: {
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  settingsButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
