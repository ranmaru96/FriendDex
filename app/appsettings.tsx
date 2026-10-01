import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { confirmAndExportBackup, confirmAndImportBackup } from '../backup';
import {
  getCompletedTaskRetention,
  initializeDatabase,
  setCompletedTaskRetention,
} from '../db';
import { CompletedTaskRetention } from '../types';
import { COMPLETED_TASK_RETENTION_OPTIONS } from '@/utils/taskHelpers';
import { APP_THEME_OPTIONS } from '@/constants/appThemes';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { EPISODE_LIST_PHOTO_LAYOUT_OPTIONS } from '@/constants/uiKit';
import { Theme, Radius, Typography } from '@/constants/theme';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { SettingsSectionLabel, SETTINGS_CONTENT_LEFT } from '@/components/screen/SettingsSectionLabel';
import { contentFilledButtonStyle, contentFilledButtonTextStyle } from '@/utils/contentStyleHelpers';
import { useAppTheme } from '../contexts/AppThemeContext';
import { useUiKit, useUiPreview } from '../contexts/UiPreviewContext';
import { GoogleCalendarSettingsSection } from '@/components/google-calendar/GoogleCalendarSettingsSection';
import { AccountSettingsSection } from '@/components/auth/AccountSettingsSection';

function SettingsGroup({
  children,
  themedGroup,
  isCodex,
}: {
  children: ReactNode;
  themedGroup: object | null;
  isCodex: boolean;
}) {
  if (isCodex) {
    return <OffsetCard style={styles.contentInset}>{children}</OffsetCard>;
  }
  return <View style={[styles.group, themedGroup]}>{children}</View>;
}

export default function AppSettingsScreen() {
  const router = useRouter();
  const { variant: appThemeVariant, setVariant: setAppThemeVariant, colors: appThemeColors, patternId } =
    useAppTheme();
  const { setEpisodeListPhotoLayout } = useUiPreview();
  const kit = useUiKit();
  const [completedTaskRetention, setCompletedTaskRetentionState] =
    useState<CompletedTaskRetention>('1m');
  const [retentionPickerVisible, setRetentionPickerVisible] = useState(false);
  const retentionLabel =
    COMPLETED_TASK_RETENTION_OPTIONS.find((option) => option.value === completedTaskRetention)
      ?.label ?? '1か月';

  const themed = useMemo(
    () => ({
      sectionHeader: { color: appThemeColors.onScreenText },
      hint: { color: appThemeColors.onScreenTextSecondary },
      rowLabel: { color: appThemeColors.onScreenText },
      group: {
        borderWidth: 1,
        borderColor: appThemeColors.headerBorder,
        backgroundColor: appThemeColors.contentCard,
      },
      separator: {
        height: 1,
        backgroundColor: appThemeColors.headerBorder,
      },
    }),
    [
      appThemeColors.contentCard,
      appThemeColors.headerBorder,
      appThemeColors.onScreenText,
      appThemeColors.onScreenTextSecondary,
    ]
  );

  const loadSettings = useCallback(() => {
    initializeDatabase();
    setCompletedTaskRetentionState(getCompletedTaskRetention());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const handleCompletedTaskRetentionChange = (value: CompletedTaskRetention) => {
    initializeDatabase();
    setCompletedTaskRetention(value);
    setCompletedTaskRetentionState(value);
  };

  return (
    <SubToolScreenTemplate
      title="設定"
      onBack={() => router.back()}
      titleFramed={false}
      useScreenPadding={false}
      scrollContentStyle={styles.scrollContent}
    >
        <SettingsSectionLabel
          icon="contrast-outline"
          label="アプリ全体テーマ"
          color={appThemeColors.onScreenText}
        />
        <View style={styles.segmentWrap}>
          <SlidingSegmentedControl
            options={APP_THEME_OPTIONS}
            value={appThemeVariant === 'black' ? 'black' : 'white'}
            onChange={setAppThemeVariant}
            raised
          />
        </View>

        <SettingsSectionLabel
          icon="images-outline"
          label="エピソードカード写真の大きさと枚数"
          color={appThemeColors.onScreenText}
        />
        <View style={styles.segmentWrap}>
          <SlidingSegmentedControl
            options={EPISODE_LIST_PHOTO_LAYOUT_OPTIONS}
            value={kit.episodeListPhotoLayout}
            onChange={setEpisodeListPhotoLayout}
            raised
          />
        </View>

        <SettingsSectionLabel icon="checkbox-outline" label="タスク" color={appThemeColors.onScreenText} />
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
          <Pressable style={styles.retentionRow} onPress={() => setRetentionPickerVisible(true)}>
            <Text style={[styles.rowLabel, styles.rowLabelFlex, themed.rowLabel]}>
              完了済みの臨時タスクの保持期間
            </Text>
            <View
              style={[
                styles.retentionField,
                {
                  backgroundColor: appThemeColors.contentInputBg,
                  borderColor: appThemeColors.contentSearchFieldBorder,
                },
              ]}
            >
              <Text style={[styles.retentionValue, { color: appThemeColors.contentText }]}>
                {retentionLabel}
              </Text>
              <Ionicons name="chevron-down" size={16} color={appThemeColors.contentTextSecondary} />
            </View>
          </Pressable>
        </SettingsGroup>
        <Text style={[styles.hint, themed.hint]}>
          完了した臨時タスクを自動削除するまでの期間
        </Text>

        <GoogleCalendarSettingsSection themed={themed} />

        <SettingsSectionLabel
          icon="archive-outline"
          label="バックアップ"
          color={appThemeColors.onScreenText}
        />
        <View style={styles.buttonStack}>
          <Pressable
            style={[styles.actionButton, contentFilledButtonStyle(appThemeColors)]}
            onPress={confirmAndExportBackup}
          >
            <Text style={[styles.actionButtonText, contentFilledButtonTextStyle(appThemeColors)]}>
              バックアップを書き出す
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.actionButton,
              styles.actionButtonOutline,
              {
                borderColor: appThemeColors.contentBorder,
                backgroundColor: appThemeColors.contentCard,
              },
            ]}
            onPress={confirmAndImportBackup}
          >
            <Text style={[styles.actionButtonText, { color: appThemeColors.contentText }]}>
              バックアップから復元する
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.hint, themed.hint]}>自動バックアップは起動時に自動実行されます</Text>

        <SettingsSectionLabel
          icon="bulb-outline"
          label="今後の構想"
          color={appThemeColors.onScreenText}
        />
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>予定完了後のフォロー</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・参加者について知ったことがあれば追記するポップ（小さな人物カード）{'\n'}
              ・1人記載したら、残り参加者だけで再度表示
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>ウィジェット機能追加</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・ver001以降の構想。ホーム画面に今日の予定とタスクを出す。{'\n'}
              ・サーバー化のあと、予定・タスクの形が落ち着いてから着手する。{'\n'}
              ・最初は iOS の Medium 1種。表示とタップでアプリを開くまで。Android と見た目磨きは後追い。{'\n'}
              ・中身は「今日の予定」＋「今日のタスク／期限切れ」。誕生日・祝日は初期は出さない。{'\n'}
              ・SDK 54のまま。本体のSQLiteはウィジェットから直接開かず、アプリが書いたJSONを読む。{'\n'}
              ・更新は保存時・アプリ復帰時・日付変更。タップは通知と同じくカレンダー（日付）とタスク一覧。{'\n'}
              ・Googleカレンダーは同期済みのローカル予定だけ。ウィジェットからAPIは呼ばない。{'\n'}
              ・3つのアプリID（本番／Dev／Preview）それぞれにウィジェットが付く。EASのdevelopmentビルドが必要。
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>音声入力</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・ver001以降の構想。エピソード・メモ等への音声入力対応。
            </Text>
          </View>
        </SettingsGroup>
        <Text style={[styles.hint, themed.hint]}>
          実装優先度や仕様が固まり次第、ここから着手予定のメモです
        </Text>
        <AccountSettingsSection themed={themed} />
        <OptionPickerModal
          visible={retentionPickerVisible}
          label="保持期間"
          value={completedTaskRetention}
          options={COMPLETED_TASK_RETENTION_OPTIONS}
          clearLabel={null}
          onValueChange={(value) => {
            if (
              value === '1w' ||
              value === '1m' ||
              value === '3m' ||
              value === '1y' ||
              value === 'forever'
            ) {
              handleCompletedTaskRetentionChange(value);
            }
          }}
          onClose={() => setRetentionPickerVisible(false)}
        />
    </SubToolScreenTemplate>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
  },
  segmentWrap: {
    marginLeft: SETTINGS_CONTENT_LEFT,
    marginRight: 16,
  },
  contentInset: {
    marginLeft: SETTINGS_CONTENT_LEFT,
    marginRight: 16,
  },
  group: {
    marginLeft: SETTINGS_CONTENT_LEFT,
    marginRight: 16,
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
    overflow: 'hidden',
  },
  retentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  retentionField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
  },
  retentionValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonStack: {
    marginLeft: SETTINGS_CONTENT_LEFT,
    marginRight: 16,
    gap: 8,
  },
  actionButton: {
    minHeight: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionButtonOutline: {
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowLabel: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '500',
  },
  rowLabelFlex: {
    flex: 1,
    marginRight: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
    marginLeft: 16,
  },
  hint: {
    marginTop: 12,
    marginLeft: SETTINGS_CONTENT_LEFT,
    marginRight: 16,
    fontSize: Typography.base,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  roadmapBlock: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  roadmapTitle: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
    marginBottom: 6,
  },
  roadmapBody: {
    fontSize: Typography.sm,
    color: Theme.textSecondary,
    lineHeight: 20,
  },
});
