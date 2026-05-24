import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { confirmAndExportBackup, confirmAndImportBackup } from '../backup';
import { getAllProfiles, getMyself, initializeDatabase, setMyself } from '../db';
import { Profile } from '../types';

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
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f2f5f8',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  backRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backText: {
    fontSize: 17,
    color: '#2563eb',
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  group: {
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowLabel: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '500',
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
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
    backgroundColor: '#fff',
    borderRadius: 12,
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
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  modalCloseButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
});
