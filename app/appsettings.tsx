import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
import {
  getAllProfiles,
  getCompletedTaskRetention,
  getFriendById,
  getResolvedMyselfId,
  initializeDatabase,
  isMyselfLocked,
  confirmMyself,
  setCompletedTaskRetention,
} from '../db';
import { CompletedTaskRetention, Profile } from '../types';
import { COMPLETED_TASK_RETENTION_OPTIONS } from '@/utils/taskHelpers';
import { APP_THEME_OPTIONS, isMonochromeAppTheme } from '@/constants/appThemes';
import { DESIGN_PATTERN_OPTIONS, usesOffsetChrome } from '@/constants/designPatterns';
import {
  EPISODE_LIST_PHOTO_LAYOUT_OPTIONS,
  UI_PREVIEW_OPTIONS,
} from '@/constants/uiKit';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { useAppTheme } from '../contexts/AppThemeContext';
import { useUiKit, useUiPreview } from '../contexts/UiPreviewContext';
import {
  contentSelectedOptionStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { GoogleCalendarSettingsSection } from '@/components/google-calendar/GoogleCalendarSettingsSection';

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
  const content = useContentColors();
  const isMonochrome = isMonochromeAppTheme(variant);
  const monoSurface = isMonochrome ? content.contentCard : undefined;
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
                    option.value === value ? contentSelectedOptionStyle(content) : null,
                  ]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, contentTextStyle(content)]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.modalCloseButton, contentTagStyle(content)]}
              onPress={() => setVisible(false)}
            >
              <Text style={[styles.modalCloseButtonText, contentTextStyle(content)]}>
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
    return <OffsetCard style={{ marginHorizontal: 16 }}>{children}</OffsetCard>;
  }
  return <View style={[styles.group, themedGroup]}>{children}</View>;
}

export default function AppSettingsScreen() {
  const router = useRouter();
  const { variant: appThemeVariant, setVariant: setAppThemeVariant, colors: appThemeColors, patternId, setPatternId } =
    useAppTheme();
  const isMonochromeTheme = isMonochromeAppTheme(appThemeVariant);
  const {
    variant: uiPreviewVariant,
    setVariant: setUiPreviewVariant,
    setEpisodeListPhotoLayout,
  } = useUiPreview();
  const kit = useUiKit();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [myselfLocked, setMyselfLocked] = useState(false);
  const [myselfName, setMyselfName] = useState('');
  const [completedTaskRetention, setCompletedTaskRetentionState] =
    useState<CompletedTaskRetention>('1m');

  const themed = useMemo(
    () =>
      isMonochromeTheme
        ? {
            sectionHeader: { color: appThemeColors.onScreenText },
            hint: { color: appThemeColors.onScreenTextSecondary },
            emptyText: { color: appThemeColors.onScreenTextSecondary },
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
          }
        : {
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
    const myselfId = getResolvedMyselfId();
    setSelectedProfileId(resolveMyselfProfileId(loadedProfiles, myselfId));
    setMyselfLocked(isMyselfLocked());
    const myselfFriend = myselfId ? getFriendById(myselfId) : null;
    setMyselfName(myselfFriend?.name?.trim() || '');
    setCompletedTaskRetentionState(getCompletedTaskRetention());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyselfSettings();
    }, [loadMyselfSettings])
  );

  const handleCompletedTaskRetentionChange = (value: CompletedTaskRetention) => {
    initializeDatabase();
    setCompletedTaskRetention(value);
    setCompletedTaskRetentionState(value);
  };

  const handleMyselfProfileChange = (profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }
    initializeDatabase();
    const ok = confirmMyself(profile.friendId);
    if (!ok) {
      return;
    }
    setSelectedProfileId(profileId);
    setMyselfLocked(true);
    setMyselfName(profile.name.trim());
  };

  return (
    <SubToolScreenTemplate
      title="設定"
      onBack={() => router.back()}
      titleFramed={false}
      useScreenPadding={false}
      scrollContentStyle={styles.scrollContent}
    >
        <Text style={[styles.sectionHeader, themed.sectionHeader]}>本人設定</Text>
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
          {myselfLocked ? (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, themed.rowLabel]}>{myselfName || '本人'}</Text>
            </View>
          ) : profiles.length === 0 ? (
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
        </SettingsGroup>
        {myselfLocked ? (
          <Text style={[styles.hint, themed.hint]}>本人は確認済みのため変更できません。プロフィールの内容は「自分のプロフィール」から編集できます。</Text>
        ) : null}

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>アプリ全体テーマ</Text>
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
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
        </SettingsGroup>
        <Text style={[styles.hint, themed.hint]}>
          明るさを切り替えます。コーデックスはホワイト＝紙／ブラック＝HUD、静かな図鑑はホワイト＝紙／ブラック＝夜です。
        </Text>

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>デザインパターン</Text>
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
          {DESIGN_PATTERN_OPTIONS.map((option, index) => (
            <View key={option.id}>
              {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
              <Pressable style={styles.row} onPress={() => setPatternId(option.id)}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.rowLabel, themed.rowLabel]}>{option.label}</Text>
                  <Text style={[styles.patternSummary, themed.hint]}>{option.summary}</Text>
                </View>
                {patternId === option.id ? <Text style={styles.selectedMark}>✓</Text> : null}
              </Pressable>
            </View>
          ))}
        </SettingsGroup>
        <Text style={[styles.hint, themed.hint]}>
          色と形（ずらし影）を全画面に反映します。角ブラケットはコーデックスの主なカードのみです。
        </Text>

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>UI プレビュー</Text>
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
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
        </SettingsGroup>
        <Text style={[styles.hint, themed.hint]}>
          アプリ全体のレイアウト・枠・フォームの試作版を切り替えます。Detail
          の配色とは別の設定です。Home↔Detail のヘッダー枠共有は Stable /
          Preview とも有効です
        </Text>

        {uiPreviewVariant === 'preview' ? (
          <>
            <Text style={[styles.sectionHeader, themed.sectionHeader]}>エピソードカード写真（試作）</Text>
            <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
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
            </SettingsGroup>
            <Text style={[styles.hint, themed.hint]}>
              Preview モード時のみ。一覧カード右側の写真の高さ・枚数レイアウトを切り替えます
            </Text>
          </>
        ) : null}

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>タスク</Text>
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
          {COMPLETED_TASK_RETENTION_OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <View style={[styles.separator, themed.separator]} /> : null}
              <Pressable
                style={styles.row}
                onPress={() => handleCompletedTaskRetentionChange(option.value)}
              >
                <Text style={[styles.rowLabel, themed.rowLabel]}>
                  完了済み臨時の保持: {option.label}
                </Text>
                {completedTaskRetention === option.value ? (
                  <Text style={styles.selectedMark}>✓</Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </SettingsGroup>
        <Text style={[styles.hint, themed.hint]}>
          完了した臨時タスクを自動削除するまでの期間です（デフォルト1か月）
        </Text>

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>フォロー</Text>
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
          <Pressable style={styles.row} onPress={() => router.push('/follows')}>
            <Text style={[styles.rowLabel, themed.rowLabel]}>フォロー一覧</Text>
            <Text style={[styles.rowChevron, themed.hint]}>›</Text>
          </Pressable>
        </SettingsGroup>
        <Text style={[styles.hint, themed.hint]}>
          QRコードで追加した人など、フォロー関連の確認はここから開きます
        </Text>

        <GoogleCalendarSettingsSection themed={themed} />

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>バックアップ</Text>
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
          <Pressable style={styles.row} onPress={confirmAndExportBackup}>
            <Text style={[styles.rowLabel, themed.rowLabel]}>バックアップを書き出す</Text>
          </Pressable>
          <View style={[styles.separator, themed.separator]} />
          <Pressable style={styles.row} onPress={confirmAndImportBackup}>
            <Text style={[styles.rowLabel, themed.rowLabel]}>バックアップから復元する</Text>
          </Pressable>
        </SettingsGroup>
        <Text style={[styles.hint, themed.hint]}>自動バックアップは起動時に自動実行されます</Text>

        <Text style={[styles.sectionHeader, themed.sectionHeader]}>今後の構想</Text>
        <SettingsGroup themedGroup={themed.group} isCodex={usesOffsetChrome(patternId)}>
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>一覧FABのフォローアイコン</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・現状: 入り口は設定「フォロー一覧」のみ。Home FAB のフォローボタンは一旦削除。{'\n'}
              ・概念・画面（/follows）はそのまま。{'\n'}
              ・復活時: HomeScreen の fabRow に CircleIconButton
              （icon="people-circle-outline" → /follows、accessibilityLabel="フォロー一覧"）を戻す。
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>予定完了後のフォロー</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・参加者について知ったことがあれば追記するポップ（小さな人物カード）{'\n'}
              ・1人記載したら、残り参加者だけで再度表示
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>グループ名タグ（参加者）</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・現状: 予定・エピソード・精算・シャッフル等の参加者選択は個人 ID
              のみ（所属タブなし。絞り込みの所属は個人一覧用）。{'\n'}
              ・型は EpisodeParticipant.kind に group
              が残っており、EntrySelectorModal の enableGroupTab
              で所属タブを再度出せる（公開先選択では利用中）。{'\n'}
              ・再実装時: 表示用にグループ名タグを保存しつつ、実参加者は個人へ展開して同期。{'\n'}
              ・注意: グループメンバー変更後は「保存時スナップショット」か「都度再展開」かを決める。
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>相関図機能</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・ver001以降の構想。人物同士の関係を相関図として作成・表示する。
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>
              行ってみたい・食べてみたい場所
            </Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・ツールから利用可能。行きたい場所（名前・目的タグ）と食べたい店（場所フォルダ・料理の種類）を記録する。
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>あなたの～は？</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・ver001以降の構想。特定の質問に対する対象者の回答を記載する。
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>ウィジェット機能追加</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・ver001以降の構想。ホーム画面ウィジェット対応。
            </Text>
          </View>
          <View style={[styles.separator, themed.separator]} />
          <View style={styles.roadmapBlock}>
            <Text style={[styles.roadmapTitle, themed.rowLabel]}>サーバー化</Text>
            <Text style={[styles.roadmapBody, themed.hint]}>
              ・ver001以降の構想。{'\n'}
              ・エピソード公開{'\n'}
              ・共通の予定の共有{'\n'}
              ・人物カードの共有{'\n'}
              ・お金貸し借り管理の共有{'\n'}
              ・シャッフル結果共有
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
    </SubToolScreenTemplate>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
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
  patternSummary: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
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
  roadmapBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  modalOptionText: {
    fontSize: 15,
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalCloseButtonText: {
    fontWeight: '600',
  },
});
