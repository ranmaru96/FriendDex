import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { confirmAndExportBackup, confirmAndImportBackup } from '../backup';
import { getAllProfiles, getMyself, initializeDatabase, setMyself } from '../db';
import { Profile } from '../types';
import { DETAIL_DESIGN_OPTIONS } from '@/constants/detailThemes';
import { APP_THEME_OPTIONS, isMonochromeAppTheme } from '@/constants/appThemes';
import {
  CALENDAR_EVENT_CARD_STYLE_OPTIONS,
  CALENDAR_EVENT_TIME_DISPLAY_OPTIONS,
  DETAIL_PROFILE_CARD_STYLE_OPTIONS,
  EPISODE_LIST_PHOTO_LAYOUT_OPTIONS,
  UI_PREVIEW_OPTIONS,
} from '@/constants/uiKit';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { useAppTheme } from '../contexts/AppThemeContext';
import { useDetailDesign } from '../contexts/DetailDesignContext';
import { useUiKit, useUiPreview } from '../contexts/UiPreviewContext';

type Option = { label: string; value: string };

function ProfileSelectField({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (value: string) => void;
}) {
  const { variant, colors } = useAppTheme();
  const isMonochrome = isMonochromeAppTheme(variant);
  const isBlack = variant === 'black';
  const monoSurface = isBlack ? '#1c1c1c' : undefined;
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((item) => item.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View>
      <Pressable
        style={[
          styles.selectButton,
          isMonochrome && {
            borderColor: colors.headerBorder,
            borderWidth: 1,
            ...(monoSurface ? { backgroundColor: monoSurface } : null),
          },
        ]}
        onPress={() => setVisible(true)}
      >
        <Text
          style={[
            value ? styles.selectValue : styles.selectPlaceholder,
            isMonochrome && { color: value ? colors.onScreenText : colors.onScreenTextSecondary },
          ]}
        >
          {displayLabel}
        </Text>
        <Text style={[styles.selectChevron, isMonochrome && { color: colors.onScreenTextSecondary }]}>
          ▼
        </Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              isMonochrome && {
                borderWidth: 1,
                borderColor: colors.headerBorder,
                ...(monoSurface ? { backgroundColor: monoSurface } : null),
              },
            ]}
          >
            <Text style={[styles.modalTitle, isMonochrome && { color: colors.onScreenText }]}>{label}</Text>
            <ScrollView style={styles.modalOptions}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.modalOption,
                    option.value === value && styles.modalOptionSelected,
                    isBlack && option.value === value && { backgroundColor: '#2a2a2a' },
                  ]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, isMonochrome && { color: colors.onScreenText }]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.modalCloseButton, isBlack && { backgroundColor: '#2a2a2a' }]}
              onPress={() => setVisible(false)}
            >
              <Text style={[styles.modalCloseButtonText, isMonochrome && { color: colors.onScreenText }]}>
                閉じる
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

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

export default function AppSettingsScreen() {
  const router = useRouter();
  const { variant: appThemeVariant, setVariant: setAppThemeVariant, colors: appThemeColors } =
    useAppTheme();
  const isMonochromeTheme = isMonochromeAppTheme(appThemeVariant);
  const { variant: detailDesignVariant, setVariant: setDetailDesignVariant } = useDetailDesign();
  const {
    variant: uiPreviewVariant,
    setVariant: setUiPreviewVariant,
    setCalendarEventCardStyle,
    setCalendarEventTimeDisplay,
    setEpisodeListPhotoLayout,
    setDetailProfileCardStyle,
  } = useUiPreview();
  const kit = useUiKit();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');

  const themed = useMemo(
    () =>
      isMonochromeTheme
        ? {
            backText: { color: appThemeColors.onScreenText },
            sectionHeader: { color: appThemeColors.onScreenText },
            hint: { color: appThemeColors.onScreenTextSecondary },
            emptyText: { color: appThemeColors.onScreenTextSecondary },
            rowLabel: { color: appThemeColors.onScreenText },
            group: {
              borderWidth: 1,
              borderColor: appThemeColors.headerBorder,
              backgroundColor:
                appThemeVariant === 'black' ? '#1c1c1c' : Theme.bgSurface,
            },
            separator: {
              height: 1,
              backgroundColor: appThemeColors.headerBorder,
            },
          }
        : {
            backText: { color: kit.topBarText },
            sectionHeader: null,
            hint: null,
            emptyText: null,
            rowLabel: null,
            group: null,
            separator: null,
          },
    [
      appThemeColors.headerBorder,
      appThemeColors.onScreenText,
      appThemeColors.onScreenTextSecondary,
      appThemeVariant,
      isMonochromeTheme,
      kit.topBarText,
    ]
  );

  const profileOptions = useMemo(
    (): Option[] => profiles.map((profile) => ({ label: profile.name, value: profile.id })),
    [profiles]
  );

  const loadMyselfSettings = useCallback(() => {
    initializeDatabase();
    const loadedProfiles = getAllProfiles();
    setProfiles(loadedProfiles);
    setSelectedProfileId(resolveMyselfProfileId(loadedProfiles, getMyself()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyselfSettings();
    }, [loadMyselfSettings])
  );

  const handleMyselfProfileChange = (profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }
    initializeDatabase();
    const ok = setMyself(profile.friendId);
    if (!ok) {
      return;
    }
    setSelectedProfileId(profileId);
  };

  return (
    <SubToolScreenTemplate useTopBar={false} useScreenPadding={false} scrollContentStyle={styles.scrollContent}>
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Text style={[styles.backText, themed.backText]}>‹ 戻る</Text>
        </Pressable>

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>本人設定</Text>
        <View style={[styles.group, themed.group]}>
          {profiles.length === 0 ? (
            <View style={styles.row}>
              <Text style={[styles.emptyText, themed.emptyText]}>プロフィールを登録してください</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <ProfileSelectField
                label="本人を選択"
                value={selectedProfileId}
                options={profileOptions}
                onValueChange={handleMyselfProfileChange}
              />
            </View>
          )}
        </View>

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>アプリ全体テーマ</Text>
        <View style={[styles.group, themed.group]}>
          {APP_THEME_OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
              <Pressable style={styles.row} onPress={() => setAppThemeVariant(option.value)}>
                <Text style={[styles.rowLabel, themed.rowLabel]}>{option.label}</Text>
                {appThemeVariant === option.value ? (
                  <Text style={styles.selectedMark}>✓</Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </View>
        <Text style={[styles.hint, themed.hint]}>
          全画面のベース背景・サブ画面トップバー色を切り替えます（デフォルト / ホワイト / ブラック）
        </Text>

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>Detail 画面デザイン</Text>
        <View style={[styles.group, themed.group]}>
          {DETAIL_DESIGN_OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
              <Pressable style={styles.row} onPress={() => setDetailDesignVariant(option.value)}>
                <Text style={[styles.rowLabel, themed.rowLabel]}>{option.label}</Text>
                {detailDesignVariant === option.value ? (
                  <Text style={styles.selectedMark}>✓</Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </View>
        <Text style={[styles.hint, themed.hint]}>Detail 画面の配色とタブ・タグのスタイルを切り替えます</Text>

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>UI プレビュー</Text>
        <View style={[styles.group, themed.group]}>
          {UI_PREVIEW_OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
              <Pressable style={styles.row} onPress={() => setUiPreviewVariant(option.value)}>
                <Text style={[styles.rowLabel, themed.rowLabel]}>{option.label}</Text>
                {uiPreviewVariant === option.value ? (
                  <Text style={styles.selectedMark}>✓</Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </View>
        <Text style={[styles.hint, themed.hint]}>
          アプリ全体のレイアウト・枠・フォームの試作版を切り替えます。Detail の配色とは別の設定です
        </Text>

        {uiPreviewVariant === 'preview' ? (
          <>
            <Text style={[styles.sectionHeader, themed.sectionHeader]}>カレンダー予定カード（試作）</Text>
            <View style={[styles.group, themed.group]}>
              {CALENDAR_EVENT_TIME_DISPLAY_OPTIONS.map((option, index) => (
                <View key={option.value}>
                  {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
                  <Pressable
                    style={styles.row}
                    onPress={() => setCalendarEventTimeDisplay(option.value)}
                  >
                    <Text style={[styles.rowLabel, themed.rowLabel]}>{option.label}</Text>
                    {kit.calendarEventTimeDisplay === option.value ? (
                      <Text style={styles.selectedMark}>✓</Text>
                    ) : null}
                  </Pressable>
                </View>
              ))}
            </View>
            <Text style={[styles.hint, themed.hint]}>
              Preview モード時のみ。予定カード左側の時刻表示スタイルを切り替えます
            </Text>

            <Text style={[styles.sectionHeader, themed.sectionHeader]}>予定カード形状（試作）</Text>
            <View style={[styles.group, themed.group]}>
              {CALENDAR_EVENT_CARD_STYLE_OPTIONS.map((option, index) => (
                <View key={option.value}>
                  {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
                  <Pressable
                    style={styles.row}
                    onPress={() => setCalendarEventCardStyle(option.value)}
                  >
                    <Text style={[styles.rowLabel, themed.rowLabel]}>{option.label}</Text>
                    {kit.calendarEventCardStyle === option.value ? (
                      <Text style={styles.selectedMark}>✓</Text>
                    ) : null}
                  </Pressable>
                </View>
              ))}
            </View>
            <Text style={[styles.hint, themed.hint]}>
              Preview モード時のみ。ホワイト版などの予定一覧で、各予定を独立した丸角カードにするかを切り替えます
            </Text>

            <Text style={[styles.sectionHeader, themed.sectionHeader]}>エピソードカード写真（試作）</Text>
            <View style={[styles.group, themed.group]}>
              {EPISODE_LIST_PHOTO_LAYOUT_OPTIONS.map((option, index) => (
                <View key={option.value}>
                  {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
                  <Pressable
                    style={styles.row}
                    onPress={() => setEpisodeListPhotoLayout(option.value)}
                  >
                    <Text style={[styles.rowLabel, themed.rowLabel]}>{option.label}</Text>
                    {kit.episodeListPhotoLayout === option.value ? (
                      <Text style={styles.selectedMark}>✓</Text>
                    ) : null}
                  </Pressable>
                </View>
              ))}
            </View>
            <Text style={[styles.hint, themed.hint]}>
              Preview モード時のみ。一覧カード右側の写真の高さ・枚数レイアウトを切り替えます
            </Text>

            <Text style={[styles.sectionHeader, themed.sectionHeader]}>Detail プロフィール枠（試作）</Text>
            <View style={[styles.group, themed.group]}>
              {DETAIL_PROFILE_CARD_STYLE_OPTIONS.map((option, index) => (
                <View key={option.value}>
                  {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
                  <Pressable
                    style={styles.row}
                    onPress={() => setDetailProfileCardStyle(option.value)}
                  >
                    <Text style={[styles.rowLabel, themed.rowLabel]}>{option.label}</Text>
                    {kit.detailProfileCardStyle === option.value ? (
                      <Text style={styles.selectedMark}>✓</Text>
                    ) : null}
                  </Pressable>
                </View>
              ))}
            </View>
            <Text style={[styles.hint, themed.hint]}>
              Preview モード時のみ。Detail の影・角丸・外枠の有無を切り替えます
            </Text>
          </>
        ) : null}

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>バックアップ</Text>
        <View style={[styles.group, themed.group]}>
          <Pressable style={styles.row} onPress={confirmAndExportBackup}>
            <Text style={[styles.rowLabel, themed.rowLabel]}>バックアップを書き出す</Text>
          </Pressable>
          <View style={[styles.separator, themed.separator]} />
          <Pressable style={styles.row} onPress={confirmAndImportBackup}>
            <Text style={[styles.rowLabel, themed.rowLabel]}>バックアップから復元する</Text>
          </Pressable>
        </View>
        <Text style={[styles.hint, themed.hint]}>自動バックアップは起動時に自動実行されます</Text>
    </SubToolScreenTemplate>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  backRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backText: {
    fontSize: 17,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: Typography.base,
    fontWeight: '600',
    color: Theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowLabel: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '500',
  },
  rowChevron: {
    fontSize: 22,
    color: '#94a3b8',
    fontWeight: '500',
  },
  selectedMark: {
    fontSize: 18,
    color: Theme.accent,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
    marginLeft: 16,
  },
  hint: {
    marginTop: 12,
    marginHorizontal: 16,
    fontSize: Typography.base,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.md,
    backgroundColor: Theme.inputBg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectValue: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '500',
  },
  selectPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: '#64748b',
  },
  selectChevron: {
    fontSize: 10,
    color: '#475569',
    marginLeft: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.md,
    padding: 14,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  modalOptions: {
    marginBottom: 10,
  },
  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  modalOptionSelected: {
    backgroundColor: '#e0f2fe',
  },
  modalOptionText: {
    fontSize: 15,
    color: '#1e293b',
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
  },
  modalCloseButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
});
