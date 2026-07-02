import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAllFriends, getQrScannedFriends, initializeDatabase } from '../db';
import { Friend } from '../types';
import { formatScannedAtLabel } from '@/utils/qrScanHelpers';
import { Theme, ScreenHorizontalInset } from '@/constants/theme';

/** 将来復活予定の友達一覧・Profile共有UI */
const SHOW_LEGACY_FRIENDS_UI = false;

type Option = { label: string; value: string };

type FriendRow = {
  id: string;
  name: string;
  status: string;
  affiliations: string[];
};

type ShareProfile = {
  id: string;
  name: string;
  nickname: string;
  photoUri: string | null;
  affiliations: string[];
  experiences: string[];
};

const incomingProfiles = [
  { accountName: 'tanaka_kk', profileCount: 2 },
  { accountName: 'mika_room', profileCount: 1 },
];

const dummyFriends: FriendRow[] = [
  { id: 'f1', name: '田中 健太', status: '今何してる。 勉強中', affiliations: ['Aチーム', 'テニス部'] },
  { id: 'f2', name: '佐藤 美咲', status: '今何してる。 カフェ', affiliations: ['デザイン室'] },
  { id: 'f3', name: '鈴木 大地', status: '今何してる。 移動中', affiliations: ['Aチーム', '営業部'] },
];

const affiliationOptions: Option[] = [
  { label: 'Aチーム', value: 'Aチーム' },
  { label: '営業部', value: '営業部' },
  { label: 'テニス部', value: 'テニス部' },
  { label: 'デザイン室', value: 'デザイン室' },
];

const experienceOptions: Option[] = [
  { label: '社会人', value: '社会人' },
  { label: '学生', value: '学生' },
  { label: '留学経験', value: '留学経験' },
];

function SelectField({
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
    <View style={styles.fieldContainer}>
      <Pressable style={styles.selectButton} onPress={() => setVisible(true)}>
        <Text style={value ? styles.selectValue : styles.selectPlaceholder}>{displayLabel}</Text>
        <Text style={styles.selectChevron}>▼</Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={styles.modalOptions}>
              <Pressable
                style={[styles.modalOption, !value && styles.modalOptionSelected]}
                onPress={() => {
                  onValueChange('');
                  setVisible(false);
                }}
              >
                <Text style={styles.modalOptionText}>指定なし</Text>
              </Pressable>
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

export default function FriendsScreen() {
  const router = useRouter();
  const [qrFriends, setQrFriends] = useState<Friend[]>([]);
  const [name, setName] = useState('');
  const [affiliation1, setAffiliation1] = useState('');
  const [affiliation2, setAffiliation2] = useState('');
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [shareTargetFriend, setShareTargetFriend] = useState<FriendRow | null>(null);

  const [profileNameFilter, setProfileNameFilter] = useState('');
  const [profileAffiliationFilter, setProfileAffiliationFilter] = useState('');
  const [profileExperienceFilter, setProfileExperienceFilter] = useState('');
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [shareProfiles, setShareProfiles] = useState<ShareProfile[]>([]);

  const loadQrFriends = useCallback(() => {
    initializeDatabase();
    setQrFriends(getQrScannedFriends());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadQrFriends();
    }, [loadQrFriends])
  );

  const filteredFriends = useMemo(() => {
    return dummyFriends.filter((friend) => {
      if (name.trim() && !friend.name.toLowerCase().includes(name.trim().toLowerCase())) {
        return false;
      }
      if (affiliation1 && !friend.affiliations.includes(affiliation1)) {
        return false;
      }
      if (affiliation2 && !friend.affiliations.includes(affiliation2)) {
        return false;
      }
      return true;
    });
  }, [name, affiliation1, affiliation2]);

  const filteredShareProfiles = useMemo(() => {
    return shareProfiles.filter((profile) => {
      if (profileNameFilter.trim() && !profile.name.toLowerCase().includes(profileNameFilter.trim().toLowerCase())) {
        return false;
      }
      if (profileAffiliationFilter && !profile.affiliations.includes(profileAffiliationFilter)) {
        return false;
      }
      if (profileExperienceFilter && !profile.experiences.includes(profileExperienceFilter)) {
        return false;
      }
      return true;
    });
  }, [shareProfiles, profileNameFilter, profileAffiliationFilter, profileExperienceFilter]);

  const selectedProfiles = useMemo(() => {
    const selectedSet = new Set(selectedProfileIds);
    return shareProfiles.filter((profile) => selectedSet.has(profile.id));
  }, [selectedProfileIds, shareProfiles]);

  const openShareModal = (friend: FriendRow) => {
    initializeDatabase();
    const loadedFriends = getAllFriends();
    setShareProfiles(
      loadedFriends.map((item: Friend) => ({
        id: item.id,
        name: item.name,
        nickname: item.nickname || '-',
        photoUri: item.photoUri ?? null,
        affiliations: item.affiliations ?? [],
        experiences: item.experiences ?? [],
      }))
    );
    setProfileNameFilter('');
    setProfileAffiliationFilter('');
    setProfileExperienceFilter('');
    setShareTargetFriend(friend);
    setShareModalVisible(true);
  };

  const toggleProfileSelection = (profileId: string) => {
    setSelectedProfileIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId]
    );
  };

  const handleConfirmShare = () => {
    if (!shareTargetFriend || selectedProfiles.length === 0) return;
    Alert.alert('共有完了（ダミー）', `${selectedProfiles.length}件のProfileを${shareTargetFriend.name}に共有しました。`);
    setConfirmModalVisible(false);
    setShareModalVisible(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.toolbarRow}>
          <View style={styles.toolbarSpacer} />
          <Pressable
            style={styles.toolbarIconButton}
            onPress={() => router.push('/myprofile')}
            accessibilityLabel="QR公開項目の設定"
          >
            <Ionicons name="person-circle-outline" size={24} color="#334155" />
          </Pressable>
          <Pressable
            style={styles.toolbarIconButton}
            onPress={() => router.push('/myprofile-qr')}
            accessibilityLabel="QRコードを表示"
          >
            <Ionicons name="qr-code-outline" size={24} color="#334155" />
          </Pressable>
          <Pressable
            style={styles.toolbarIconButton}
            onPress={() => router.push('/scan')}
            accessibilityLabel="QRコードを読み取る"
          >
            <Ionicons name="scan-outline" size={24} color="#334155" />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 80 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>QRで追加した人</Text>
            {qrFriends.length === 0 ? (
              <Text style={styles.emptyQrText}>QRコードを読み取って追加した人がここに表示されます。</Text>
            ) : (
              qrFriends.map((friend) => (
                <Pressable
                  key={friend.id}
                  style={styles.qrFriendRow}
                  onPress={() => router.push({ pathname: '/detail', params: { id: friend.id } })}
                >
                  <View style={styles.qrFriendMain}>
                    <Text style={styles.qrFriendName}>{friend.name || '-'}</Text>
                    {friend.nickname.trim() ? (
                      <Text style={styles.qrFriendNickname}>{friend.nickname}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.qrFriendDate}>{formatScannedAtLabel(friend.scannedAt)}</Text>
                </Pressable>
              ))
            )}
          </View>

          {SHOW_LEGACY_FRIENDS_UI ? (
            <>
              <View style={styles.actionRow}>
                <Pressable
                  style={styles.primaryActionButton}
                  onPress={() => Alert.alert('案内', '「あなたは今」は後で実装します')}
                >
                  <Text style={styles.primaryActionButtonText}>あなたは今</Text>
                </Pressable>
                <Pressable
                  style={styles.primaryActionButton}
                  onPress={() => Alert.alert('案内', '「友達追加」は後で実装します')}
                >
                  <Text style={styles.primaryActionButtonText}>友達追加</Text>
                </Pressable>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Profileが届いた</Text>
                {incomingProfiles.map((item) => (
                  <View key={item.accountName} style={styles.incomingCard}>
                    <Text style={styles.incomingText}>
                      「{item.accountName}」から{item.profileCount}個のProfileが届いています
                    </Text>
                    <Pressable
                      style={styles.checkProfileButton}
                      onPress={() => Alert.alert('案内', '「Profile確認」は後で実装します')}
                    >
                      <Text style={styles.checkProfileButtonText}>Profile確認</Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>友達一覧</Text>
                <View style={styles.searchArea}>
                  <View style={styles.row}>
                    <View style={styles.fieldContainer}>
                      <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="名前"
                        style={styles.textInput}
                        autoCapitalize="none"
                      />
                    </View>
                    <SelectField
                      label="所属1"
                      value={affiliation1}
                      options={affiliationOptions}
                      onValueChange={setAffiliation1}
                    />
                    <SelectField
                      label="所属2"
                      value={affiliation2}
                      options={affiliationOptions}
                      onValueChange={setAffiliation2}
                    />
                  </View>
                </View>

                {filteredFriends.map((friend) => (
                  <View key={friend.id} style={styles.friendRow}>
                    <Text style={styles.friendName}>{friend.name}</Text>
                    <Text style={styles.friendStatus} numberOfLines={1}>
                      {friend.status}
                    </Text>
                    <Pressable style={styles.shareButton} onPress={() => openShareModal(friend)}>
                      <Text style={styles.shareButtonText}>Profile共有</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>

        {SHOW_LEGACY_FRIENDS_UI ? (
        <Modal
          visible={shareModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => {
            setConfirmModalVisible(false);
            setShareModalVisible(false);
          }}
        >
          <View style={styles.shareModalOverlay}>
            <View style={styles.shareModalCard}>
              <View style={styles.shareActionRow}>
                <Pressable
                  style={styles.shareTopButton}
                  onPress={() => {
                    setConfirmModalVisible(false);
                    setShareModalVisible(false);
                  }}
                >
                  <Text style={styles.shareTopButtonText}>閉じる</Text>
                </Pressable>
                <View style={styles.shareTargetTag}>
                  <Text style={styles.shareTargetTagText}>共有先：「{shareTargetFriend?.name ?? '-'}」</Text>
                </View>
                <Pressable
                  style={[styles.shareTopButton, selectedProfileIds.length === 0 && styles.shareTopButtonDisabled]}
                  disabled={selectedProfileIds.length === 0}
                  onPress={() => setConfirmModalVisible(true)}
                >
                  <Text style={styles.shareTopButtonText}>選択完了</Text>
                </Pressable>
              </View>

              <View style={styles.shareFilterArea}>
                <View style={styles.row}>
                  <View style={styles.fieldContainer}>
                    <TextInput
                      value={profileNameFilter}
                      onChangeText={setProfileNameFilter}
                      placeholder="名前"
                      placeholderTextColor="#6b7280"
                      style={styles.textInput}
                      autoCapitalize="none"
                    />
                  </View>
                  <SelectField
                    label="所属"
                    value={profileAffiliationFilter}
                    options={affiliationOptions}
                    onValueChange={setProfileAffiliationFilter}
                  />
                  <SelectField
                    label="経験"
                    value={profileExperienceFilter}
                    options={experienceOptions}
                    onValueChange={setProfileExperienceFilter}
                  />
                </View>
              </View>

              <ScrollView contentContainerStyle={styles.profileGridContainer}>
                <View style={styles.profileGrid}>
                  {filteredShareProfiles.map((profile) => {
                    const selected = selectedProfileIds.includes(profile.id);
                    return (
                      <Pressable
                        key={profile.id}
                        style={[styles.profileCard, selected && styles.profileCardSelected]}
                        onPress={() => toggleProfileSelection(profile.id)}
                      >
                        <View style={styles.profileCheckboxWrap}>
                          <View style={[styles.profileCheckbox, selected && styles.profileCheckboxChecked]}>
                            {selected ? <Text style={styles.profileCheckboxMark}>✓</Text> : null}
                          </View>
                        </View>
                        <View style={styles.profilePhotoWrapper}>
                          {profile.photoUri ? (
                            <Image source={{ uri: profile.photoUri }} style={styles.profileImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
                              <Text style={styles.profileImagePlaceholderText}>No Image</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.profileCardName}>{profile.name}</Text>
                        <Text style={styles.profileCardNickname}>{profile.nickname}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>

          <Modal visible={confirmModalVisible} animationType="fade" transparent onRequestClose={() => setConfirmModalVisible(false)}>
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmTitle}>
                  以下のProfileを「{shareTargetFriend?.name ?? ''}」に送る
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.confirmList}>
                  {selectedProfiles.map((profile) => (
                    <View key={`confirm-${profile.id}`} style={styles.confirmMiniCard}>
                      <Text style={styles.confirmMiniName}>{profile.name}</Text>
                      <Text style={styles.confirmMiniNick}>{profile.nickname}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.confirmActions}>
                  <Pressable style={styles.confirmCancelButton} onPress={() => setConfirmModalVisible(false)}>
                    <Text style={styles.confirmCancelText}>‹ 戻る</Text>
                  </Pressable>
                  <Pressable style={styles.confirmShareButton} onPress={handleConfirmShare}>
                    <Text style={styles.confirmShareText}>共有</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </Modal>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.screenBase,
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: ScreenHorizontalInset,
    marginBottom: 8,
    gap: 4,
  },
  toolbarSpacer: {
    flex: 1,
  },
  toolbarIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  emptyQrText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  qrFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  qrFriendMain: {
    flex: 1,
    gap: 2,
  },
  qrFriendName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  qrFriendNickname: {
    fontSize: 13,
    color: '#64748b',
  },
  qrFriendDate: {
    fontSize: 12,
    color: '#64748b',
  },
  actionRow: {
    marginHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  primaryActionButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0ea5e9',
    backgroundColor: '#bae6fd',
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryActionButtonText: {
    color: '#0c4a6e',
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: ScreenHorizontalInset,
    paddingBottom: 24,
    gap: 12,
  },
  section: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  incomingCard: {
    borderWidth: 1,
    borderColor: '#4caf50',
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  incomingText: {
    flex: 1,
    fontSize: 13,
    color: '#166534',
  },
  checkProfileButton: {
    borderWidth: 1,
    borderColor: '#4caf50',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  checkProfileButtonText: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 12,
  },
  searchArea: {
    backgroundColor: Theme.searchAreaBase,
    borderColor: '#7e8b94',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldContainer: {
    flex: 1,
  },
  textInput: {
    backgroundColor: '#fff',
    borderColor: '#8aa0ad',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  selectButton: {
    backgroundColor: '#fff',
    borderColor: '#8aa0ad',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 38,
  },
  selectValue: {
    fontSize: 13,
    color: '#111827',
    flex: 1,
  },
  selectPlaceholder: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  selectChevron: {
    fontSize: 10,
    color: '#475569',
    marginLeft: 6,
  },
  friendRow: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  friendName: {
    width: 90,
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 14,
  },
  friendStatus: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  shareButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  shareModalCard: {
    width: '100%',
    height: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#94a3b8',
    padding: 10,
  },
  shareActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  shareTargetTag: {
    flex: 1,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareTargetTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  shareTopButton: {
    minWidth: 86,
    borderWidth: 1,
    borderColor: '#0ea5e9',
    borderRadius: 8,
    backgroundColor: '#0c4a6e',
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  shareTopButtonDisabled: {
    backgroundColor: '#94a3b8',
    borderColor: '#94a3b8',
  },
  shareTopButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  shareFilterArea: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    padding: 8,
    marginBottom: 10,
  },
  profileGridContainer: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 16,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  profileCard: {
    width: '31.5%',
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 0,
    overflow: 'visible',
    marginBottom: 0,
  },
  profileCardSelected: {
    borderColor: '#4caf50',
    borderWidth: 2,
  },
  profileCheckboxWrap: {
    position: 'absolute',
    right: -6,
    top: -6,
    zIndex: 2,
  },
  profileCheckbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#94a3b8',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCheckboxChecked: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  profileCheckboxMark: {
    color: '#2e7d32',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 16,
  },
  profilePhotoWrapper: {
    marginTop: -2,
    marginLeft: -2,
    marginRight: -2,
    borderWidth: 2,
    borderColor: '#aaa',
    borderRadius: 10,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    aspectRatio: 1,
  },
  profileImagePlaceholder: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  profileImagePlaceholderText: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '600',
  },
  profileCardName: {
    paddingHorizontal: 8,
    paddingTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  profileCardNickname: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    fontSize: 10,
    color: '#334155',
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#94a3b8',
    padding: 12,
  },
  confirmTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 10,
  },
  confirmList: {
    gap: 8,
    paddingBottom: 8,
  },
  confirmMiniCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    minWidth: 90,
  },
  confirmMiniName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  confirmMiniNick: {
    fontSize: 11,
    color: '#334155',
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  confirmCancelButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confirmCancelText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  confirmShareButton: {
    borderWidth: 1,
    borderColor: '#2e7d32',
    borderRadius: 8,
    backgroundColor: '#4caf50',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  confirmShareText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
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
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  modalOptionSelected: {
    backgroundColor: '#e0f2fe',
  },
  modalOptionText: {
    fontSize: 14,
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
