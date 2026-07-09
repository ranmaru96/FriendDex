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
import { UI_PREVIEW_OPTIONS } from '@/constants/uiKit';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { useDetailDesign } from '../contexts/DetailDesignContext';
import { useUiPreview } from '../contexts/UiPreviewContext';

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
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((item) => item.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View>
      <Pressable style={styles.selectButton} onPress={() => setVisible(true)}>
        <Text style={value ? styles.selectValue : styles.selectPlaceholder}>{displayLabel}</Text>
        <Text style={styles.selectChevron}>▼</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={styles.modalOptions}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.modalOption, option.value === value && styles.modalOptionSelected]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setVisible(false)}>
              <Text style={styles.modalCloseButtonText}>閉じる</Text>
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
  const { variant: detailDesignVariant, setVariant: setDetailDesignVariant } = useDetailDesign();
  const { variant: uiPreviewVariant, setVariant: setUiPreviewVariant } = useUiPreview();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');

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
        <Text style={styles.backText}>‹ 戻る</Text>
      </Pressable>

        <Text style={styles.sectionHeader}>本人設定</Text>
        <View style={styles.group}>
          {profiles.length === 0 ? (
            <View style={styles.row}>
              <Text style={styles.emptyText}>プロフィールを登録してください</Text>
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

        <Text style={styles.sectionHeader}>Detail 画面デザイン</Text>
        <View style={styles.group}>
          {DETAIL_DESIGN_OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable style={styles.row} onPress={() => setDetailDesignVariant(option.value)}>
                <Text style={styles.rowLabel}>{option.label}</Text>
                {detailDesignVariant === option.value ? (
                  <Text style={styles.selectedMark}>✓</Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </View>
        <Text style={styles.hint}>Detail 画面の配色とタブ・タグのスタイルを切り替えます</Text>

        <Text style={styles.sectionHeader}>UI プレビュー</Text>
        <View style={styles.group}>
          {UI_PREVIEW_OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable style={styles.row} onPress={() => setUiPreviewVariant(option.value)}>
                <Text style={styles.rowLabel}>{option.label}</Text>
                {uiPreviewVariant === option.value ? (
                  <Text style={styles.selectedMark}>✓</Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </View>
        <Text style={styles.hint}>
          アプリ全体のレイアウト・枠・フォームの試作版を切り替えます。Detail の配色とは別の設定です
        </Text>

        <Text style={styles.sectionHeader}>バックアップ</Text>
        <View style={styles.group}>
          <Pressable style={styles.row} onPress={confirmAndExportBackup}>
            <Text style={styles.rowLabel}>バックアップを書き出す</Text>
          </Pressable>
          <View style={styles.separator} />
          <Pressable style={styles.row} onPress={confirmAndImportBackup}>
            <Text style={styles.rowLabel}>バックアップから復元する</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>自動バックアップは起動時に自動実行されます</Text>
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
    color: Theme.topBarText,
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
