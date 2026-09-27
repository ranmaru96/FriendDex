import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import {
  findFriendByScannedUserId,
  getAllFriends,
  getFriendById,
  getQrScannedFriends,
  getResolvedMyselfId,
  initializeDatabase,
} from '../db';
import type { Friend } from '../types';
import {
  listConnections,
  rejectConnection,
  removeConnection,
  type ConnectionRow,
} from '@/lib/connectionSync';
import { requireOnline } from '@/lib/networkReachability';
import { formatScannedAtLabel } from '@/utils/qrScanHelpers';
import { resolveFriendDisplayPhotoUri } from '@/utils/friendPhoto';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentMutedTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

const AVATAR_SM = 32;
const HERO_PHOTO = 40;

/** 人物カード詳細と同じ二重枠の丸角四角 */
function CardPhotoThumb({
  name,
  photoUri,
  size,
}: {
  name: string;
  photoUri: string | null;
  size: number;
}) {
  const content = useContentColors();
  const { variant, shape, patternId } = useAppTheme();
  const uri = photoUri?.trim() || undefined;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const photoRadius = shape.cardBorderRadius;
  const offset = usesOffsetChrome(patternId);
  const outerBorderWidth = offset ? 0 : variant === 'white' ? 1 : shape.cardBorderWidth;
  const innerBorderWidth = offset ? 0 : 2;

  return (
    <View
      style={[
        styles.cardPhotoOuter,
        {
          width: size,
          height: size,
          borderColor: variant === 'white' ? content.contentTextSecondary : content.contentBorder,
          borderWidth: outerBorderWidth,
          borderRadius: photoRadius,
        },
      ]}
    >
      <View
        style={[
          styles.cardPhotoInner,
          {
            borderColor: content.contentPhotoInnerBorder,
            borderWidth: innerBorderWidth,
            borderRadius: Math.max(0, photoRadius - 2),
            backgroundColor: content.contentPhotoPlaceholder,
          },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.cardPhotoImage} resizeMode="cover" />
        ) : (
          <Text
            style={[
              styles.cardPhotoInitial,
              { color: content.contentPhotoPlaceholderText, fontSize: Math.max(14, Math.round(size * 0.36)) },
            ]}
          >
            {initial}
          </Text>
        )}
      </View>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  count,
  expanded,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count?: number;
  expanded?: boolean;
  onPress: () => void;
}) {
  const content = useContentColors();
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed ? { opacity: 0.7 } : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count != null && count > 0 ? `${label} ${count}` : label}
      accessibilityState={expanded != null ? { expanded } : undefined}
    >
      <Ionicons name={icon} size={20} color={content.contentText} />
      <Text style={[styles.menuLabel, contentTextStyle(content)]} numberOfLines={1}>
        {label}
      </Text>
      {count != null && count > 0 ? (
        <Text style={[styles.menuCount, contentMutedTextStyle(content)]}>{count}</Text>
      ) : null}
      {expanded != null ? (
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={18}
          color={content.contentTextSecondary}
        />
      ) : null}
    </Pressable>
  );
}

function HeroActionButton({
  icon,
  label,
  accessibilityLabel,
  onPress,
  emphasis,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  emphasis: 'primary' | 'quiet';
}) {
  const content = useContentColors();
  const primary = emphasis === 'primary';
  const ink = primary ? content.contentCard : content.contentTextSecondary;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.heroActionButton,
        primary ? styles.heroActionButtonPrimary : styles.heroActionButtonQuiet,
        primary
          ? contentFilledButtonStyle(content)
          : { borderColor: content.contentBorder, backgroundColor: 'transparent' },
        pressed ? { opacity: 0.7 } : null,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={primary ? 18 : 16} color={ink} />
      <Text
        style={[
          styles.heroActionLabel,
          primary ? contentFilledButtonTextStyle(content) : contentMutedTextStyle(content),
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatCell({
  value,
  label,
  accessibilityLabel,
}: {
  value: number;
  label: string;
  accessibilityLabel: string;
}) {
  const content = useContentColors();
  return (
    <View style={styles.statCell} accessibilityLabel={accessibilityLabel}>
      <Text style={[styles.statLabel, contentMutedTextStyle(content)]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statNumber, contentTextStyle(content)]}>{value}</Text>
    </View>
  );
}

export default function MyPageScreen() {
  const content = useContentColors();
  const router = useRouter();
  const { session } = useAuthSession();
  const myUserId = session?.user.id?.trim().toLowerCase() ?? '';
  const [qrFriends, setQrFriends] = useState<Friend[]>([]);
  const [myself, setMyself] = useState<Friend | null>(null);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [busyPeerId, setBusyPeerId] = useState<string | null>(null);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(true);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [personCount, setPersonCount] = useState(0);
  const [episodeCount, setEpisodeCount] = useState(0);

  const loadLocal = useCallback(() => {
    initializeDatabase();
    setQrFriends(getQrScannedFriends());
    const myselfId = getResolvedMyselfId();
    setMyself(myselfId ? getFriendById(myselfId) : null);
    const friends = getAllFriends();
    setPersonCount(friends.length);
    const episodeIds = new Set<string>();
    friends.forEach((friend) => {
      (friend.episodes ?? []).forEach((episode) => {
        const id = episode.id?.trim();
        if (id) {
          episodeIds.add(id);
        }
      });
    });
    setEpisodeCount(episodeIds.size);
  }, []);

  const loadConnections = useCallback(async () => {
    if (!myUserId) {
      setConnections([]);
      setListError(null);
      return;
    }
    const result = await listConnections();
    if (result.errorMessage) {
      setListError(result.errorMessage);
      setConnections([]);
      return;
    }
    setListError(null);
    setConnections(result.rows);
  }, [myUserId]);

  useFocusEffect(
    useCallback(() => {
      loadLocal();
      void loadConnections();
    }, [loadConnections, loadLocal])
  );

  const incoming = connections.filter(
    (row) => row.status === 'pending' && row.requestedBy !== myUserId
  );
  const outgoing = connections.filter(
    (row) => row.status === 'pending' && row.requestedBy === myUserId
  );
  const accepted = connections.filter((row) => row.status === 'accepted');

  useEffect(() => {
    if (incoming.length > 0) {
      setRequestsOpen(true);
    }
  }, [incoming.length]);

  const peerFriend = (peerUserId: string) => findFriendByScannedUserId(peerUserId);

  const peerName = (peerUserId: string, fallback: string) =>
    peerFriend(peerUserId)?.name?.trim() || fallback;

  const handleAccept = (peerUserId: string) => {
    if (!requireOnline()) {
      return;
    }
    router.push({
      pathname: '/qr-import',
      params: { scannedUserId: peerUserId, fromFollow: 'true' },
    });
  };

  const handleReject = async (peerUserId: string) => {
    if (!requireOnline()) {
      return;
    }
    setBusyPeerId(peerUserId);
    try {
      const result = await rejectConnection(peerUserId);
      if (result.errorMessage) {
        Alert.alert('拒否できませんでした', result.errorMessage);
        return;
      }
      await loadConnections();
    } finally {
      setBusyPeerId(null);
    }
  };

  const handleRemove = (peerUserId: string, name: string) => {
    if (!requireOnline()) {
      return;
    }
    Alert.alert(
      'コネクトを解除しますか？',
      `「${name}」とのコネクトは切れます。人物カードは残ります。解除するまでカードは削除できません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除する',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyPeerId(peerUserId);
              try {
                const result = await removeConnection(peerUserId);
                if (result.skipped) {
                  Alert.alert('解除できませんでした', 'コネクトの解除はオンラインで行ってください。');
                  return;
                }
                if (result.errorMessage) {
                  Alert.alert('解除できませんでした', result.errorMessage);
                  return;
                }
                await loadConnections();
              } finally {
                setBusyPeerId(null);
              }
            })();
          },
        },
      ]
    );
  };

  const myselfName = myself?.name?.trim() || '本人未設定';
  const myselfPhoto = myself ? resolveFriendDisplayPhotoUri(myself) : null;
  const openMyself = () => {
    if (myself) {
      router.push({ pathname: '/detail', params: { id: myself.id } });
      return;
    }
    router.push('/appsettings');
  };

  return (
    <SubToolScreenTemplate
      title="マイページ"
      titleFramed={false}
      onBack={() => router.back()}
      scrollContentStyle={styles.scrollContent}
    >
      <View style={styles.heroBlock}>
        <View style={styles.heroRow}>
          <Pressable
            onPress={openMyself}
            style={styles.heroIdentity}
            accessibilityLabel="自分のプロフィール"
          >
            <CardPhotoThumb name={myselfName} photoUri={myselfPhoto} size={HERO_PHOTO} />
            <Text style={[styles.heroName, contentTextStyle(content)]} numberOfLines={1}>
              {myselfName}
            </Text>
          </Pressable>
          <View
            style={[
              styles.statRow,
              {
                borderColor: content.contentBorder,
                backgroundColor: content.contentInputBg,
              },
            ]}
            accessibilityLabel={`コネクト${accepted.length}、人物カード${personCount}、エピソード${episodeCount}`}
          >
            <StatCell
              value={accepted.length}
              label="コネクト"
              accessibilityLabel={`コネクト ${accepted.length}`}
            />
            <View style={[styles.statDivider, { backgroundColor: content.contentBorder }]} />
            <StatCell
              value={personCount}
              label="人物カード"
              accessibilityLabel={`人物カード ${personCount}`}
            />
            <View style={[styles.statDivider, { backgroundColor: content.contentBorder }]} />
            <StatCell
              value={episodeCount}
              label="エピソード"
              accessibilityLabel={`エピソード ${episodeCount}`}
            />
          </View>
        </View>
        <View style={styles.heroActionRow}>
          <HeroActionButton
            emphasis="quiet"
            icon="options-outline"
            label="公開設定"
            accessibilityLabel="プロフィール公開項目設定"
            onPress={() => router.push('/myprofile')}
          />
          <HeroActionButton
            emphasis="primary"
            icon="qr-code-outline"
            label="QR表示"
            accessibilityLabel="QRコードを表示"
            onPress={() => router.push('/myprofile-qr')}
          />
          <HeroActionButton
            emphasis="primary"
            icon="scan-outline"
            label="読み取る"
            accessibilityLabel="QRコードを読み取る"
            onPress={() => {
              if (!requireOnline()) {
                return;
              }
              router.push('/scan');
            }}
          />
        </View>
      </View>

      {!myUserId ? (
        <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
          リクエストとコネクトの一覧は、設定のアカウントからログインすると表示されます。
        </Text>
      ) : null}
      {listError ? (
        <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
          つながり一覧を取れませんでした。{'\n'}
          {listError}
        </Text>
      ) : null}

      <View style={styles.menuBlock}>
        <MenuRow
          icon="person-add-outline"
          label="コネクトリクエスト"
          count={incoming.length}
          expanded={requestsOpen}
          onPress={() => setRequestsOpen((prev) => !prev)}
        />
        {requestsOpen ? (
          <View style={styles.nested}>
            {!myUserId ? (
              <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>ログインが必要です。</Text>
            ) : incoming.length === 0 ? (
              <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
                届いている許可はありません。
              </Text>
            ) : (
              incoming.map((row) => {
                const linked = peerFriend(row.peerUserId);
                const name = peerName(row.peerUserId, row.requesterDisplayName);
                const busy = busyPeerId === row.peerUserId;
                return (
                  <View key={row.peerUserId} style={styles.personRow}>
                    <CardPhotoThumb
                      name={name}
                      photoUri={linked ? resolveFriendDisplayPhotoUri(linked) : null}
                      size={AVATAR_SM}
                    />
                    <Text style={[styles.personName, styles.personNameGrow, contentTextStyle(content)]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Pressable
                      style={[styles.compactButton, contentFilledButtonStyle(content), busy && styles.actionDisabled]}
                      onPress={() => handleAccept(row.peerUserId)}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator color={content.contentCard} size="small" />
                      ) : (
                        <Text style={[styles.compactButtonText, contentFilledButtonTextStyle(content)]}>
                          許可
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[
                        styles.compactButton,
                        styles.compactButtonGhost,
                        { borderColor: content.contentBorder },
                        busy && styles.actionDisabled,
                      ]}
                      onPress={() => void handleReject(row.peerUserId)}
                      disabled={busy}
                    >
                      <Text style={[styles.compactButtonText, contentMutedTextStyle(content)]}>拒否</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
            {outgoing.length > 0
              ? outgoing.map((row) => {
                  const linked = peerFriend(row.peerUserId);
                  const name = peerName(row.peerUserId, '（相手）');
                  return (
                    <View key={`out:${row.peerUserId}`} style={styles.personRow}>
                      <CardPhotoThumb
                        name={name}
                        photoUri={linked ? resolveFriendDisplayPhotoUri(linked) : null}
                        size={AVATAR_SM}
                      />
                      <Text style={[styles.personName, styles.personNameGrow, contentTextStyle(content)]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[styles.meta, contentMutedTextStyle(content)]}>許可待ち</Text>
                    </View>
                  );
                })
              : null}
          </View>
        ) : null}

        <MenuRow
          icon="people-outline"
          label="コネクト"
          count={accepted.length}
          expanded={friendsOpen}
          onPress={() => setFriendsOpen((prev) => !prev)}
        />
        {friendsOpen ? (
          <View style={styles.nested}>
            {!myUserId ? (
              <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>ログインが必要です。</Text>
            ) : accepted.length === 0 ? (
              <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
                まだコネクトはありません。
              </Text>
            ) : (
              accepted.map((row) => {
                const linked = peerFriend(row.peerUserId);
                const name =
                  linked?.name?.trim() ||
                  (row.requestedBy !== myUserId ? row.requesterDisplayName : '（相手）');
                const busy = busyPeerId === row.peerUserId;
                return (
                  <View key={row.peerUserId} style={styles.personRow}>
                    <Pressable
                      style={styles.personRowMain}
                      onPress={
                        linked
                          ? () => router.push({ pathname: '/detail', params: { id: linked.id } })
                          : undefined
                      }
                      disabled={!linked}
                    >
                      <CardPhotoThumb
                        name={name}
                        photoUri={linked ? resolveFriendDisplayPhotoUri(linked) : null}
                        size={AVATAR_SM}
                      />
                      <Text
                        style={[styles.personName, styles.personNameGrow, contentTextStyle(content)]}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.compactButton,
                        styles.compactButtonGhost,
                        { borderColor: content.contentBorder },
                        busy && styles.actionDisabled,
                      ]}
                      onPress={() => handleRemove(row.peerUserId, name)}
                      disabled={busy}
                      accessibilityLabel={`${name}とのコネクトを解除`}
                    >
                      {busy ? (
                        <ActivityIndicator color={content.contentTextSecondary} size="small" />
                      ) : (
                        <Text style={[styles.compactButtonText, contentMutedTextStyle(content)]}>
                          解除
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {qrFriends.length > 0 ? (
          <>
            <MenuRow
              icon="qr-code-outline"
              label="QRで追加した人"
              count={qrFriends.length}
              expanded={qrExpanded}
              onPress={() => setQrExpanded((prev) => !prev)}
            />
            {qrExpanded ? (
              <View style={styles.nested}>
                {qrFriends.map((friend) => (
                  <Pressable
                    key={friend.id}
                    style={styles.personRow}
                    onPress={() => router.push({ pathname: '/detail', params: { id: friend.id } })}
                  >
                    <CardPhotoThumb
                      name={friend.name || '-'}
                      photoUri={resolveFriendDisplayPhotoUri(friend)}
                      size={AVATAR_SM}
                    />
                    <View style={styles.personMain}>
                      <Text style={[styles.personName, contentTextStyle(content)]} numberOfLines={1}>
                        {friend.name || '-'}
                      </Text>
                      {friend.nickname.trim() ? (
                        <Text style={[styles.meta, contentMutedTextStyle(content)]} numberOfLines={1}>
                          {friend.nickname}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.meta, contentMutedTextStyle(content)]}>
                      {formatScannedAtLabel(friend.scannedAt)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={[styles.footerRule, { backgroundColor: content.contentBorder }]} />

      <View style={styles.menuBlock}>
        <MenuRow
          icon="settings-outline"
          label="設定"
          onPress={() => router.push('/appsettings')}
        />
      </View>
    </SubToolScreenTemplate>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: Spacing.md,
    gap: 4,
  },
  heroBlock: {
    gap: 10,
    paddingBottom: Spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  heroActionButton: {
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  heroActionButtonQuiet: {
    flexGrow: 0.8,
    flexShrink: 1,
    flexBasis: 0,
    borderWidth: 1,
  },
  heroActionButtonPrimary: {
    flexGrow: 1.15,
    flexShrink: 1,
    flexBasis: 0,
    borderWidth: 1,
  },
  heroActionLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  heroName: {
    flex: 1,
    minWidth: 0,
    fontSize: Typography.lg,
    lineHeight: 20,
    fontWeight: '600',
  },
  statRow: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  statCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 12,
  },
  statNumber: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    lineHeight: 17,
  },
  menuBlock: {
    gap: 0,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 8,
  },
  menuLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: Typography.lg,
    fontWeight: '700',
  },
  menuCount: {
    fontSize: Typography.base,
    fontWeight: '600',
  },
  nested: {
    paddingLeft: 4,
    paddingBottom: 4,
    gap: 0,
  },
  footerRule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.base,
    lineHeight: 20,
    paddingVertical: 8,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 40,
    paddingVertical: 4,
  },
  personRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  personMain: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  personName: {
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
  },
  personNameGrow: {
    flex: 1,
  },
  meta: {
    fontSize: Typography.sm,
    flexShrink: 0,
  },
  cardPhotoOuter: {
    overflow: 'hidden',
  },
  cardPhotoInner: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhotoImage: {
    width: '100%',
    height: '100%',
  },
  cardPhotoInitial: {
    fontWeight: '800',
  },
  compactButton: {
    minWidth: 52,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButtonGhost: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  compactButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.6,
  },
});
