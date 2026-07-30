import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PersonSelectPanel } from '@/components/PersonSelectPanel';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { Radius, Theme } from '@/constants/theme';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  applyQrLinkToFriend,
  findFriendByScannedUserId,
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMyself,
  getQrUserIdOwnerFriendId,
  initializeDatabase,
} from '@/db';
import {
  buildFriendInputFromQrPayload,
  getPublicFieldLabels,
  namesLikelyMatch,
  qrPayloadToRouteParams,
  routeParamsToQrPayload,
} from '@/utils/qrScanHelpers';

type ImportMode = 'new' | 'overwrite';

export default function QrImportScreen() {
  const router = useRouter();
  const content = useContentColors();
  const params = useLocalSearchParams<{
    scannedUserId?: string;
    publicFields?: string;
    name?: string;
    nickname?: string;
    birthday?: string;
    height?: string;
    weight?: string;
    origin?: string;
    residence?: string;
    mbti?: string;
  }>();
  const payload = useMemo(() => routeParamsToQrPayload(params), [params]);

  const [mode, setMode] = useState<ImportMode>('new');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const friends = useMemo(() => {
    initializeDatabase();
    const myselfId = getMyself();
    return getAllFriends().filter((friend) => friend.id !== myselfId);
  }, []);

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

  const highlightedIds = useMemo(() => {
    const highlighted = new Set<string>();
    if (!payload) return highlighted;
    friends.forEach((friend) => {
      if (namesLikelyMatch(payload.name, friend.name)) {
        highlighted.add(friend.id);
      }
    });
    return highlighted;
  }, [friends, payload]);

  const affiliationOptions = useMemo(
    () => getDistinctAffiliations().map((value) => ({ label: value, value })),
    []
  );
  const experienceOptions = useMemo(
    () => getDistinctExperiences().map((value) => ({ label: value, value })),
    []
  );

  useEffect(() => {
    if (!payload || initialized) return;
    if (linkedFriend) {
      setMode('overwrite');
      setSelectedFriendId(linkedFriend.id);
    }
    setInitialized(true);
  }, [initialized, linkedFriend, payload]);

  useEffect(() => {
    if (!payload) {
      Alert.alert('エラー', 'QRコードの内容を読み取れませんでした', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [payload, router]);

  const handleSelectId = useCallback((id: string) => {
    setSelectedFriendId(id || null);
  }, []);

  const handleNewRegister = useCallback(() => {
    if (!payload) return;
    router.push({
      pathname: '/edit',
      params: {
        fromScan: 'true',
        ...qrPayloadToRouteParams(payload),
      },
    });
  }, [payload, router]);

  const handleOverwrite = useCallback(() => {
    if (!payload || !selectedFriendId) return;
    const target = friends.find((friend) => friend.id === selectedFriendId);
    if (!target) return;

    const fieldLabels = getPublicFieldLabels(payload.publicFields);
    const fieldsText = fieldLabels.length > 0 ? fieldLabels.join('、') : '（公開項目なし）';

    Alert.alert(
      '上書きしますか？',
      `${target.name} の以下の項目を更新します。\n\n${fieldsText}\n\n手動で入れた他の項目は保持されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '上書き',
          style: 'destructive',
          onPress: () => {
            const input = buildFriendInputFromQrPayload(payload);
            const ok = applyQrLinkToFriend(
              selectedFriendId,
              input,
              payload.publicFields,
              payload.userId
            );
            if (!ok) {
              Alert.alert('エラー', '上書きに失敗しました。');
              return;
            }
            router.replace({ pathname: '/detail', params: { id: selectedFriendId } });
          },
        },
      ]
    );
  }, [friends, payload, router, selectedFriendId]);

  if (!payload) {
    return null;
  }

  const displayName = payload.name?.trim() || '（名前なし）';

  return (
    <SubToolScreenTemplate useTopBar={false} scrollable={false} contentStyle={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>‹ 戻る</Text>
      </Pressable>

        <Text style={styles.title}>QR読み取り結果</Text>
        <Text style={[styles.subtitle, contentMutedTextStyle(content)]}>
          {displayName} のプロフィールをどう登録しますか？
        </Text>

        <View style={styles.modeRow}>
          <Pressable
            style={[
              styles.modeButton,
              contentInputStyle(content),
              mode === 'new' ? contentSelectedOptionStyle(content) : null,
            ]}
            onPress={() => setMode('new')}
          >
            <Text style={[styles.modeButtonText, contentTextStyle(content)]}>
              新規で登録
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeButton,
              contentInputStyle(content),
              mode === 'overwrite' ? contentSelectedOptionStyle(content) : null,
            ]}
            onPress={() => setMode('overwrite')}
          >
            <Text style={[styles.modeButtonText, contentTextStyle(content)]}>
              既存に上書き
            </Text>
          </Pressable>
        </View>

        {mode === 'new' ? (
          <View style={styles.newPanel}>
            <Text style={[styles.helpText, contentMutedTextStyle(content)]}>
              新しい人物カードとして登録します。内容は次の画面で確認・編集できます。
            </Text>
            <Pressable style={styles.primaryButton} onPress={handleNewRegister}>
              <Text style={styles.primaryButtonText}>登録内容を確認して保存</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.overwritePanel}>
            {linkedFriend ? (
              <Text style={[styles.helpText, contentMutedTextStyle(content)]}>
                このQRコードは「{linkedFriend.name}」と同期済みです。別の人物に上書きする場合は選び直せます。
              </Text>
            ) : (
              <Text style={[styles.helpText, contentMutedTextStyle(content)]}>
                上書きする人物を1人選んでください。名前が一致する候補はハイライト表示されます。
              </Text>
            )}
            <PersonSelectPanel
              friends={friends}
              selectedId={selectedFriendId}
              onSelectId={handleSelectId}
              blockedIds={blockedIds}
              highlightedIds={highlightedIds}
              affiliationOptions={affiliationOptions}
              experienceOptions={experienceOptions}
            />
            <Pressable
              style={[styles.primaryButton, !selectedFriendId && styles.primaryButtonDisabled]}
              onPress={handleOverwrite}
              disabled={!selectedFriendId}
            >
              <Text style={styles.primaryButtonText}>選択した人物に上書き</Text>
            </Pressable>
          </View>
        )}
    </SubToolScreenTemplate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 6,
    marginBottom: 8,
  },
  backText: {
    fontSize: 17,
    color: Theme.topBarText,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.topBarText,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Theme.textSecondary,
    marginBottom: 14,
    lineHeight: 20,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  newPanel: {
    flex: 1,
    gap: 16,
  },
  overwritePanel: {
    flex: 1,
    gap: 12,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: Theme.btnPrimaryBg,
    borderRadius: Radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: Theme.btnPrimaryText,
    fontSize: 15,
    fontWeight: '700',
  },
});
