import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import {
  formatFriendBirthdayBadge,
  FriendHomeCard,
} from '@/components/friend/FriendHomeCard';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { Radius } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { claimAndFetchIdentityProfile, scheduleFriendProfileSync } from '@/lib/identityProfileSync';
import { acceptConnection, scheduleRequestConnection } from '@/lib/connectionSync';
import { requireOnline } from '@/lib/networkReachability';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentMutedTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { getFriendHomeCardWidth } from '@/utils/homeCardPhotoMetrics';
import {
  applyQrLinkToFriend,
  findFriendByScannedUserId,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMyself,
  getQrUserIdOwnerFriendId,
  initializeDatabase,
} from '@/db';
import type { Friend } from '@/types';
import { findFriendsWithSameName, resolvePersonNameParts } from '@/utils/personName';
import {
  buildFriendInputFromQrPayload,
  filterPayloadByPublicFields,
  getPublicFieldLabels,
  qrPayloadToRouteParams,
  routeParamsToQrPayload,
  sortFriendsByQrNameMatch,
  type QrScanPayload,
} from '@/utils/qrScanHelpers';
import { setPendingQrImportPayload } from '@/utils/qrImportSession';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import { resolveFriendDisplayPhotoUri } from '@/utils/friendPhoto';

type ImportMode = 'new' | 'overwrite';
type ImportStep = 'confirm-match' | 'choose-mode';

function previewFriendFromPayload(payload: QrScanPayload): Friend {
  const nameParts = resolvePersonNameParts(payload);
  return {
    id: 'qr-preview',
    name: nameParts.name.trim() || '（名前なし）',
    familyName: nameParts.familyName,
    givenName: nameParts.givenName,
    nickname: payload.nickname?.trim() ?? '',
    origin: payload.origin?.trim() ?? '',
    residence: payload.residence?.trim() ?? '',
    mbti: (payload.mbti?.trim() ?? '') as Friend['mbti'],
    birthday: payload.birthday?.trim() ?? '',
    height: null,
    weight: null,
    category: '',
    description: '',
    photoUri: payload.photoUri?.trim() || null,
    identityPhotoUri: payload.photoUri?.trim() || null,
    photoSource: payload.photoUri?.trim() ? 'identity' : 'local',
    affiliations: [],
    personalities: [],
    experiences: [],
    traits: [],
    notes: [],
    likes: [],
    dislikes: [],
    episodes: [],
    sayings: [],
    importSource: 'manual',
    scannedUserId: payload.userId,
    scannedAt: '',
  };
}

export default function QrImportScreen() {
  const router = useRouter();
  const content = useContentColors();
  const { patternColors, shape } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{
    scannedUserId?: string;
    publicFields?: string;
    fromFollow?: string;
    name?: string;
    familyName?: string;
    givenName?: string;
    hasSplitName?: string;
    nickname?: string;
    birthday?: string;
    height?: string;
    weight?: string;
    origin?: string;
    residence?: string;
    mbti?: string;
    photoUri?: string;
  }>();
  const fromFollow = params.fromFollow === 'true';
  const { ready: authReady, session } = useAuthSession();
  const sessionUserId = session?.user.id ?? '';
  const qrPayload = useMemo(
    () => routeParamsToQrPayload(params),
    [params.scannedUserId, params.publicFields]
  );
  const [payload, setPayload] = useState<QrScanPayload | null>(null);
  const [hydrateReady, setHydrateReady] = useState(!qrPayload);
  const [hydrateError, setHydrateError] = useState<'login' | 'fetch' | 'own' | null>(null);

  const [mode, setMode] = useState<ImportMode>('new');
  const [step, setStep] = useState<ImportStep>('choose-mode');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [matchCandidateId, setMatchCandidateId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [friends, setFriends] = useState<Friend[]>(() => {
    initializeDatabase();
    const myselfId = getMyself();
    return getAllFriendsInDefaultOrder().filter((friend) => friend.id !== myselfId);
  });
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());

  const linkedFriend = useMemo(() => {
    if (!payload?.userId) return null;
    return findFriendByScannedUserId(payload.userId);
  }, [payload?.userId]);

  const ownerFriendId = useMemo(() => {
    if (!payload?.userId) return null;
    return getQrUserIdOwnerFriendId(payload.userId);
  }, [payload?.userId]);

  const blockedIds = useMemo(() => {
    const blocked = new Set<string>();
    if (!ownerFriendId) return blocked;
    friends.forEach((friend) => {
      if (friend.id !== ownerFriendId) {
        blocked.add(friend.id);
      }
    });
    return blocked;
  }, [friends, ownerFriendId]);

  const nameMatchCandidates = useMemo(() => {
    if (!payload) return [];
    const parts = resolvePersonNameParts(payload);
    return findFriendsWithSameName(friends, parts.familyName, parts.givenName);
  }, [friends, payload]);

  const selectorFriends = useMemo(() => {
    if (!payload) {
      return friends;
    }
    return sortFriendsByQrNameMatch(friends, {
      ...resolvePersonNameParts(payload),
      nickname: payload.nickname,
    });
  }, [friends, payload]);

  const affiliationOptions = useMemo(
    () => getDistinctAffiliations().map((value) => ({ label: value, value })),
    []
  );
  const experienceOptions = useMemo(
    () => getDistinctExperiences().map((value) => ({ label: value, value })),
    []
  );

  const previewFriend = useMemo(
    () => (payload ? previewFriendFromPayload(payload) : null),
    [payload]
  );
  const cardWidth = Math.min(getFriendHomeCardWidth(windowWidth) * 1.45, windowWidth * 0.46);
  const birthdayBadgeText = formatFriendBirthdayBadge(previewFriend?.birthday);
  const selectedOverwriteFriend = useMemo(
    () => friends.find((friend) => friend.id === selectedFriendId) ?? null,
    [friends, selectedFriendId]
  );
  const overwriteChips = useMemo(() => {
    if (!selectedOverwriteFriend) return [];
    return [
      {
        id: `individual:${selectedOverwriteFriend.id}`,
        kind: 'individual' as const,
        label: selectedOverwriteFriend.name,
        friendId: selectedOverwriteFriend.id,
        photoUri: resolveFriendDisplayPhotoUri(selectedOverwriteFriend),
      },
    ];
  }, [selectedOverwriteFriend]);

  useEffect(() => {
    let cancelled = false;
    const showAndStop = (kind: 'login' | 'fetch' | 'own') => {
      if (cancelled) {
        return;
      }
      setPayload(null);
      setHydrateError(kind);
      setHydrateReady(true);
    };
    if (!qrPayload) {
      setPayload(null);
      setHydrateError(null);
      setHydrateReady(true);
      return;
    }
    if (!authReady) {
      setHydrateReady(false);
      return;
    }
    if (!sessionUserId) {
      showAndStop('login');
      return;
    }
    setHydrateError(null);
    setHydrateReady(false);
    void claimAndFetchIdentityProfile(qrPayload.userId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.payload) {
          const allowed =
            qrPayload.publicFields.length > 0 ? qrPayload.publicFields : result.payload.publicFields;
          setPayload(filterPayloadByPublicFields(result.payload, allowed));
          setHydrateReady(true);
          return;
        }
        if (result.skipped && sessionUserId === qrPayload.userId) {
          showAndStop('own');
          return;
        }
        showAndStop('fetch');
      })
      .catch(() => {
        showAndStop('fetch');
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, qrPayload, sessionUserId]);

  useEffect(() => {
    if (!payload || !hydrateReady || initialized) return;
    if (fromFollow && linkedFriend) {
      setStep('choose-mode');
      setMode('overwrite');
      setSelectedFriendId(linkedFriend.id);
    } else if (nameMatchCandidates.length > 0) {
      setStep('confirm-match');
      setMatchCandidateId(nameMatchCandidates[0]?.id ?? null);
    } else if (linkedFriend) {
      setStep('choose-mode');
      setMode('overwrite');
      setSelectedFriendId(linkedFriend.id);
    } else {
      setStep('choose-mode');
      setMode('new');
    }
    setInitialized(true);
  }, [fromFollow, hydrateReady, initialized, linkedFriend, nameMatchCandidates, payload]);

  useEffect(() => {
    if (!hydrateReady || payload) {
      return;
    }
    if (hydrateError === 'login') {
      Alert.alert(
        'ログインが必要です',
        fromFollow
          ? '公開カードをサーバーから取るには、設定のアカウントからログインしてください。ログインしたあと、もう一度許可してください。'
          : '公開カードをサーバーから取るには、設定のアカウントからログインしてください。ログインしたあと、もう一度QRを読み取ってください。',
        [
          { text: '閉じる', onPress: () => router.back() },
          { text: '設定を開く', onPress: () => router.replace('/appsettings') },
        ]
      );
      return;
    }
    if (hydrateError === 'own') {
      Alert.alert('取り込みできません', '自分のQRは友達として登録しません。', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return;
    }
    if (hydrateError === 'fetch') {
      Alert.alert(
        '取得できませんでした',
        fromFollow
          ? '公開カードをサーバーから取れませんでした。ログインした状態でもう一度許可するか、相手がプロフィールをサーバーへ保存しているか確認してください。'
          : '公開カードをサーバーから取れませんでした。ログインした状態でもう一度試すか、相手がプロフィールをサーバーへ保存しているか確認してください。',
        [{ text: 'OK', onPress: () => router.back() }]
      );
      return;
    }
    Alert.alert('エラー', 'QRコードの内容を読み取れませんでした', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }, [fromFollow, hydrateError, hydrateReady, payload, router]);

  const reloadFriends = useCallback(() => {
    initializeDatabase();
    const myselfId = getMyself();
    setFriends(getAllFriendsInDefaultOrder().filter((friend) => friend.id !== myselfId));
  }, []);

  const openExistingSelector = useCallback(() => {
    setSelectedIndividualIds(selectedFriendId ? new Set([selectedFriendId]) : new Set());
    setSelectedGroupValues(new Set());
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  }, [selectedFriendId]);

  const handleSelectorCancel = useCallback(() => {
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, []);

  const handleSelectorConfirm = useCallback(() => {
    const nextId = Array.from(selectedIndividualIds)[0] ?? null;
    setSelectedFriendId(nextId);
    handleSelectorCancel();
  }, [handleSelectorCancel, selectedIndividualIds]);

  const toggleSelectorIndividual = useCallback(
    (friendId: string) => {
      if (blockedIds.has(friendId)) {
        Alert.alert('選択できません', 'このQRコードは別の人物カードと同期済みです。');
        return;
      }
      setSelectedIndividualIds((prev) => {
        if (prev.has(friendId)) {
          return new Set();
        }
        return new Set([friendId]);
      });
    },
    [blockedIds]
  );

  const handleSelectExistingMode = useCallback(() => {
    setMode('overwrite');
    openExistingSelector();
  }, [openExistingSelector]);

  const handleOverwrite = useCallback(
    (friendId?: string) => {
      if (!requireOnline()) {
        return;
      }
      const targetId = friendId ?? selectedFriendId;
      if (!payload || !targetId) return;
      const target = friends.find((friend) => friend.id === targetId);
      if (!target) return;

      const fieldLabels = getPublicFieldLabels(payload.publicFields);
      const fieldsText = fieldLabels.length > 0 ? fieldLabels.join('、') : '（公開項目なし）';

      Alert.alert(
        fromFollow ? 'この人物として許可しますか？' : '上書きしますか？',
        `${target.name} の以下の項目を更新します。\n\n${fieldsText}\n\n手元の写真と、相手本人の写真は両方残します。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: fromFollow ? '許可する' : '上書き',
            style: 'destructive',
            onPress: () => {
              const input = buildFriendInputFromQrPayload(payload);
              const ok = applyQrLinkToFriend(
                targetId,
                input,
                payload.publicFields,
                payload.userId
              );
              if (!ok) {
                Alert.alert('エラー', '上書きに失敗しました。');
                return;
              }
              const afterSave = () => {
                scheduleFriendProfileSync(targetId);
                router.replace({ pathname: '/detail', params: { id: targetId } });
              };
              if (fromFollow) {
                void acceptConnection(payload.userId).then((result) => {
                  if (result.errorMessage) {
                    Alert.alert('許可できませんでした', result.errorMessage);
                    return;
                  }
                  afterSave();
                });
                return;
              }
              scheduleRequestConnection(payload.userId);
              afterSave();
            },
          },
        ]
      );
    },
    [friends, fromFollow, payload, router, selectedFriendId]
  );

  const handleNewRegister = useCallback(() => {
    if (!payload) return;
    if (!requireOnline()) {
      return;
    }
    if (fromFollow && linkedFriend) {
      handleOverwrite(linkedFriend.id);
      return;
    }
    setPendingQrImportPayload(payload);
    router.push({
      pathname: '/edit',
      params: {
        fromScan: 'true',
        ...(fromFollow ? { fromFollow: 'true' } : {}),
        ...qrPayloadToRouteParams(payload),
      },
    });
  }, [fromFollow, handleOverwrite, linkedFriend, payload, router]);

  const handleConfirmMatchYes = useCallback(() => {
    if (!matchCandidateId) return;
    handleOverwrite(matchCandidateId);
  }, [handleOverwrite, matchCandidateId]);

  const handleConfirmMatchNo = useCallback(() => {
    setStep('choose-mode');
    setMode('new');
    setSelectedFriendId(null);
  }, []);

  const modeButtonStyle = (selected: boolean) =>
    selected
      ? {
          backgroundColor: patternColors.chipOn,
          borderColor: patternColors.chipOn,
        }
      : {
          backgroundColor: content.contentCard,
          borderColor: content.contentBorder,
        };
  const modeButtonTextStyle = (selected: boolean) =>
    selected
      ? { color: patternColors.chipOnInk }
      : contentTextStyle(content);

  if (!hydrateReady) {
    return (
      <SubToolScreenTemplate
        title={fromFollow ? 'コネクトの許可' : 'QR読み取り結果'}
        titleFramed={false}
        onBack={() => router.back()}
        scrollable={false}
        contentStyle={styles.container}
      >
        <View style={styles.loading}>
          <ActivityIndicator color={content.contentText} />
        </View>
      </SubToolScreenTemplate>
    );
  }

  if (!payload || !previewFriend) {
    return null;
  }

  const confirmMatch = step === 'confirm-match' && nameMatchCandidates.length > 0;
  const alreadyLinkedFollow = Boolean(fromFollow && linkedFriend);
  const pairCardWidth = Math.min(
    getFriendHomeCardWidth(windowWidth) * 1.2,
    (windowWidth - 92) / 2
  );

  return (
    <>
    <SubToolScreenTemplate
      title={fromFollow ? 'コネクトの許可' : 'QR読み取り結果'}
      titleFramed={false}
      onBack={() => router.back()}
      scrollable={false}
      contentStyle={styles.container}
    >
      {confirmMatch ? (
        <>
          <View style={styles.syncPairBlock}>
            <View style={styles.syncPairRow}>
              <Text style={[styles.syncCardLabel, styles.syncCardCol, contentMutedTextStyle(content)]}>
                {fromFollow ? '申請者' : '読み取り'}
              </Text>
              <View style={styles.syncArrowSlot} />
              <Text style={[styles.syncCardLabel, styles.syncCardCol, contentMutedTextStyle(content)]}>
                登録済み
              </Text>
            </View>
            <View style={styles.syncPairRow}>
              <View style={styles.syncCardCol}>
                <FriendHomeCard
                  friend={previewFriend}
                  width={pairCardWidth}
                  birthdayBadgeText={birthdayBadgeText}
                />
              </View>
              <View style={styles.syncArrowCol} accessibilityLabel="同期">
                <Ionicons name="arrow-forward" size={22} color={content.contentText} />
                <Text style={[styles.syncArrowLabel, contentMutedTextStyle(content)]}>同期</Text>
              </View>
              <View style={styles.syncCardCol}>
                {nameMatchCandidates.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.matchCardRow}
                  >
                    {nameMatchCandidates.map((friend) => {
                      const selected = friend.id === matchCandidateId;
                      return (
                        <Pressable
                          key={friend.id}
                          onPress={() => setMatchCandidateId(friend.id)}
                          style={[
                            styles.matchCardWrap,
                            selected
                              ? { borderColor: '#f59e0b' }
                              : { borderColor: 'transparent' },
                          ]}
                        >
                          <FriendHomeCard
                            friend={friend}
                            width={pairCardWidth * 0.92}
                            birthdayBadgeText={formatFriendBirthdayBadge(friend.birthday)}
                          />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <FriendHomeCard
                    friend={nameMatchCandidates[0]}
                    width={pairCardWidth}
                    birthdayBadgeText={formatFriendBirthdayBadge(nameMatchCandidates[0]?.birthday)}
                  />
                )}
              </View>
            </View>
          </View>
          <Text style={[styles.questionText, contentTextStyle(content)]}>
            {fromFollow
              ? nameMatchCandidates.length > 1
                ? '同姓同名の人物カードがあります。この人物として許可しますか？'
                : 'この人物として許可しますか？'
              : nameMatchCandidates.length > 1
                ? '同姓同名の人物カードがあります。この人物に同期しますか？'
                : 'この人物に同期しますか？'}
          </Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[
                styles.modeButton,
                {
                  borderRadius: Math.max(Radius.sm, shape.innerRadius),
                  backgroundColor: content.contentCard,
                  borderColor: content.contentBorder,
                },
              ]}
              onPress={handleConfirmMatchNo}
            >
              <Text style={[styles.modeButtonText, contentTextStyle(content)]}>いいえ</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modeButton,
                {
                  borderRadius: Math.max(Radius.sm, shape.innerRadius),
                  backgroundColor: patternColors.chipOn,
                  borderColor: patternColors.chipOn,
                },
                !matchCandidateId ? styles.primaryButtonDisabled : null,
              ]}
              onPress={handleConfirmMatchYes}
              disabled={!matchCandidateId}
            >
              <Text style={[styles.modeButtonText, { color: patternColors.chipOnInk }]}>はい</Text>
            </Pressable>
          </View>
          <View style={styles.newSpacer} />
        </>
      ) : (
        <>
          <View style={styles.cardStage}>
            <FriendHomeCard
              friend={previewFriend}
              width={cardWidth}
              birthdayBadgeText={birthdayBadgeText}
            />
          </View>

          {!alreadyLinkedFollow ? (
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'new' }}
              style={[
                styles.modeButton,
                { borderRadius: Math.max(Radius.sm, shape.innerRadius) },
                modeButtonStyle(mode === 'new'),
              ]}
              onPress={() => setMode('new')}
            >
              <Text style={[styles.modeButtonText, modeButtonTextStyle(mode === 'new')]}>新規</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'overwrite' }}
              style={[
                styles.modeButton,
                { borderRadius: Math.max(Radius.sm, shape.innerRadius) },
                modeButtonStyle(mode === 'overwrite'),
              ]}
              onPress={handleSelectExistingMode}
            >
              <Text style={[styles.modeButtonText, modeButtonTextStyle(mode === 'overwrite')]}>
                既存
              </Text>
            </Pressable>
          </View>
          ) : null}

          {alreadyLinkedFollow ? (
            <>
              <Text style={[styles.helpText, contentMutedTextStyle(content)]}>
                この相手は「{linkedFriend?.name}」とつながっています。許可するとコネクトになります。手元の写真と相手本人の写真は両方残します。
              </Text>
              <View style={styles.newSpacer} />
            </>
          ) : mode === 'new' ? (
            <>
              <Text style={[styles.helpText, contentMutedTextStyle(content)]}>
                新しい人物カードとして登録します。内容は次の画面で確認・編集できます。
              </Text>
              <View style={styles.newSpacer} />
            </>
          ) : (
            <View style={styles.overwritePanel}>
              {linkedFriend ? (
                <Text style={[styles.helpText, contentMutedTextStyle(content)]}>
                  このQRコードは「{linkedFriend.name}」と同期済みです。別の人物に上書きする場合は選び直せます。
                </Text>
              ) : (
                <Text style={[styles.helpText, contentMutedTextStyle(content)]}>
                  上書きする人物を1人選んでください。名前の一致が多い順に並んでいます。
                </Text>
              )}
              <ParticipantChipList
                chips={overwriteChips}
                compact
                layout="wrap"
                onRemoveChip={() => setSelectedFriendId(null)}
                trailing={
                  <Pressable
                    accessibilityLabel="上書きする人物を選ぶ"
                    style={[
                      styles.addPersonButton,
                      {
                        backgroundColor: content.contentCard,
                        borderColor: content.contentText,
                      },
                    ]}
                    onPress={openExistingSelector}
                  >
                    <Text style={[styles.addPersonButtonText, contentTextStyle(content)]}>＋</Text>
                  </Pressable>
                }
              />
              <View style={styles.newSpacer} />
            </View>
          )}

          <Pressable
            style={[
              styles.primaryButton,
              contentFilledButtonStyle(content),
              !alreadyLinkedFollow && mode === 'overwrite' && !selectedFriendId
                ? styles.primaryButtonDisabled
                : null,
            ]}
            onPress={
              alreadyLinkedFollow
                ? () => handleOverwrite(linkedFriend?.id)
                : mode === 'new'
                  ? handleNewRegister
                  : () => handleOverwrite()
            }
            disabled={!alreadyLinkedFollow && mode === 'overwrite' && !selectedFriendId}
          >
            <Text style={[styles.primaryButtonText, contentFilledButtonTextStyle(content)]}>
              {alreadyLinkedFollow
                ? 'この人物として許可'
                : mode === 'new'
                  ? '登録内容を確認して保存'
                  : fromFollow
                    ? '選択した人物として許可'
                    : '選択した人物に上書き'}
            </Text>
          </Pressable>
        </>
      )}
    </SubToolScreenTemplate>
    <EntrySelectorModal
      visible={selectorVisible}
      selectorTab={selectorTab}
      onTabChange={setSelectorTab}
      nameFilter={selectorNameFilter}
      onNameFilterChange={setSelectorNameFilter}
      affiliationFilter={selectorAffiliationFilter}
      onAffiliationFilterChange={setSelectorAffiliationFilter}
      experienceFilter={selectorExperienceFilter}
      onExperienceFilterChange={setSelectorExperienceFilter}
      friends={selectorFriends}
      affiliationOptions={affiliationOptions}
      experienceOptions={experienceOptions}
      groupOptions={affiliationOptions}
      selectedIndividualIds={selectedIndividualIds}
      selectedGroupValues={selectedGroupValues}
      onToggleIndividual={toggleSelectorIndividual}
      onToggleGroup={(groupValue) => {
        setSelectedGroupValues((prev) => {
          const next = new Set(prev);
          if (next.has(groupValue)) {
            next.delete(groupValue);
          } else {
            next.add(groupValue);
          }
          return next;
        });
      }}
      onCancel={handleSelectorCancel}
      onConfirm={handleSelectorConfirm}
      onPersonCreated={reloadFriends}
      highlightedIds={new Set(nameMatchCandidates.map((friend) => friend.id))}
      enableGroupTab={false}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 16,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStage: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  newSpacer: {
    flex: 1,
  },
  syncPairBlock: {
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  syncPairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  syncCardCol: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  syncCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 0,
  },
  syncArrowSlot: {
    width: 36,
    flexShrink: 0,
  },
  syncArrowCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: 36,
    flexShrink: 0,
  },
  syncArrowLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  matchCardRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  matchCardWrap: {
    borderWidth: 2,
    borderRadius: Radius.md,
    padding: 4,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  overwritePanel: {
    flex: 1,
    gap: 8,
    marginBottom: 10,
    minHeight: 0,
  },
  addPersonButton: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  addPersonButtonText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  helpText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  primaryButton: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
