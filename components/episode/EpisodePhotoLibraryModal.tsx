import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';

const PAGE_SIZE = 60;

type EpisodePhotoLibraryModalProps = {
  visible: boolean;
  maxSelection: number;
  /** エピソードに既についている枚数。 */
  registeredCount: number;
  /** 調整が終わってエピソードに入った写真。チェックから外す。 */
  dismissedAssetIds: string[];
  preparing: boolean;
  onClose: () => void;
  onRegister: (assets: { id: string; uri: string }[]) => void;
  children?: ReactNode;
};

function PhotoThumb({ assetId, uri }: { assetId: string; uri: string }) {
  return (
    <Image
      source={{ uri }}
      style={styles.thumb}
      contentFit="cover"
      recyclingKey={assetId}
      cachePolicy="memory-disk"
      transition={0}
      allowDownscaling
    />
  );
}

export function EpisodePhotoLibraryModal({
  visible,
  maxSelection,
  registeredCount,
  dismissedAssetIds,
  preparing,
  onClose,
  onRegister,
  children,
}: EpisodePhotoLibraryModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accessPrivileges, setAccessPrivileges] = useState<'all' | 'limited' | 'none' | undefined>(
    undefined
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const cellSize = Math.floor((width - 4) / 3);

  const loadPage = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        after: cursor,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      setAssets((prev) => (cursor ? [...prev, ...page.assets] : page.assets));
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
    } catch {
      if (!cursor) {
        setAssets([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    setAccessPrivileges(permission.accessPrivileges);
    setAssets([]);
    setEndCursor(undefined);
    setHasNextPage(false);
    if (permission.granted) {
      await loadPage(undefined);
    }
  }, [loadPage]);

  useEffect(() => {
    if (!visible) {
      setSelectedIds([]);
      return;
    }
    void reload();
  }, [reload, visible]);

  useEffect(() => {
    if (!visible || dismissedAssetIds.length === 0) {
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => !dismissedAssetIds.includes(id)));
  }, [dismissedAssetIds, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const subscription = MediaLibrary.addListener((event) => {
      if (!event.hasIncrementalChanges) {
        void reload();
      }
    });
    return () => subscription.remove();
  }, [reload, visible]);

  const toggle = useCallback(
    (assetId: string) => {
      setSelectedIds((prev) => {
        const index = prev.indexOf(assetId);
        if (index >= 0) {
          return prev.filter((id) => id !== assetId);
        }
        if (prev.length >= maxSelection) {
          return prev;
        }
        return [...prev, assetId];
      });
    },
    [maxSelection]
  );

  const addMorePhotos = useCallback(async () => {
    try {
      await MediaLibrary.presentPermissionsPickerAsync(['photo']);
      await reload();
    } catch {
      Alert.alert('写真を追加できません', '選択できる写真の変更に失敗しました。');
    }
  }, [reload]);

  const orderById = useMemo(() => {
    const map = new Map<string, number>();
    selectedIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [selectedIds]);

  const limited = accessPrivileges === 'limited';
  const photoLimit = registeredCount + maxSelection;
  const usedCount = registeredCount + selectedIds.length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: colors.screenBackground, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.topBarBorder }]}>
          <Pressable onPress={onClose} hitSlop={8} disabled={preparing}>
            <Text style={[styles.headerAction, { color: colors.onScreenText }]}>閉じる</Text>
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.onScreenText }]} numberOfLines={1}>
              写真  {usedCount}/{photoLimit}
            </Text>
            <Text style={[styles.titleMeta, { color: colors.onScreenTextSecondary }]} numberOfLines={1}>
              登録済み {registeredCount}　選択中 {selectedIds.length}
            </Text>
          </View>
          <Pressable
            style={styles.registerButton}
            onPress={() =>
              onRegister(
                selectedIds.flatMap((id) => {
                  const asset = assets.find((item) => item.id === id);
                  return asset ? [{ id: asset.id, uri: asset.uri }] : [];
                })
              )
            }
            hitSlop={8}
            disabled={preparing || selectedIds.length === 0}
          >
            <Text
              style={[
                styles.headerAction,
                styles.registerLabel,
                { color: colors.onScreenText },
                preparing || selectedIds.length === 0 ? styles.headerActionDisabled : null,
              ]}
            >
              登録
            </Text>
          </Pressable>
        </View>
        {limited ? (
          <View style={styles.limitedRow}>
            <Text style={[styles.limitedText, { color: colors.onScreenTextSecondary }]}>
              選択した写真のみ表示しています
            </Text>
            <Pressable onPress={() => void addMorePhotos()} disabled={preparing}>
              <Text style={[styles.limitedAction, { color: colors.onScreenText }]}>写真を追加</Text>
            </Pressable>
          </View>
        ) : null}
        <FlatList
          style={styles.list}
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={3}
          initialNumToRender={21}
          maxToRenderPerBatch={12}
          windowSize={5}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          onEndReached={() => {
            if (hasNextPage && endCursor && !loading) {
              void loadPage(endCursor);
            }
          }}
          onEndReachedThreshold={0.6}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={styles.empty} color={colors.onScreenTextSecondary} />
            ) : (
              <Text style={[styles.emptyText, { color: colors.onScreenTextSecondary }]}>
                {limited ? '表示できる写真がありません' : '写真がありません'}
              </Text>
            )
          }
          renderItem={({ item }) => {
            const order = orderById.get(item.id);
            const checked = order != null;
            return (
              <Pressable
                style={{ width: cellSize, height: cellSize, margin: 0.5 }}
                onPress={() => toggle(item.id)}
                disabled={preparing || (!checked && selectedIds.length >= maxSelection)}
              >
                <PhotoThumb assetId={item.id} uri={item.uri} />
                <View style={[styles.badge, checked ? styles.badgeOn : styles.badgeOff]}>
                  <Text style={styles.badgeText}>{checked ? String(order + 1) : ''}</Text>
                </View>
              </Pressable>
            );
          }}
        />
        {preparing ? (
          <View style={styles.preparing}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.preparingText}>写真を読み込んでいます</Text>
          </View>
        ) : null}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  registerButton: {
    minWidth: 64,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  registerLabel: {
    textAlign: 'right',
  },
  list: {
    flex: 1,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  titleMeta: {
    marginTop: 2,
    fontSize: 12,
  },
  headerAction: {
    fontSize: 16,
    minWidth: 52,
  },
  headerActionDisabled: {
    opacity: 0.35,
  },
  limitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 12,
  },
  limitedText: {
    flex: 1,
    fontSize: 13,
  },
  limitedAction: {
    fontSize: 14,
    fontWeight: '600',
  },
  thumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#d6d6d6',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: {
    backgroundColor: '#b4b4b4',
  },
  badgeOff: {
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  empty: {
    marginTop: 48,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
  },
  preparing: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  preparingText: {
    color: '#ffffff',
    fontSize: 15,
  },
});
