import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import { PhotoLibraryThumb, preparePhotoThumbnails } from '@/modules/photo-thumbnails/src';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';

const FIRST_PAGE_SIZE = 80;
const NEXT_PAGE_SIZE = 400;
const COLUMNS = 4;
const SCRUBBER_HIT = 16;
const SCRUBBER_THUMB = 44;
/** ドラッグ中に写真を描き直す間隔。毎フレーム動かすと読み込みが追いつかず画面が空になる。 */
const SCRUB_SCROLL_MS = 100;
const THUMB_PREPARE_MS = 50;

function libraryScrollMetrics(
  count: number,
  stride: number,
  viewport: number,
  paddingBottom: number,
): { rows: number; contentHeight: number; maxOffset: number } {
  const rows = count <= 0 || stride <= 0 ? 0 : Math.ceil(count / COLUMNS);
  const contentHeight = rows * stride + paddingBottom;
  const maxOffset = Math.max(0, contentHeight - Math.max(0, viewport));
  return { rows, contentHeight, maxOffset };
}

function topIndexForOffset(
  offset: number,
  count: number,
  stride: number,
  viewport: number,
  paddingBottom: number,
): number {
  if (count <= 0 || stride <= 0) {
    return 0;
  }
  const { rows, maxOffset } = libraryScrollMetrics(count, stride, viewport, paddingBottom);
  const clamped = Math.min(maxOffset, Math.max(0, offset));
  const row = Math.min(Math.max(0, rows - 1), Math.floor(clamped / stride));
  return Math.min(count - 1, row * COLUMNS);
}

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

/** creationTime は秒のこともある。ミリ秒ならそのまま使う。 */
function formatAssetDate(creationTime: number): string {
  const ms = creationTime > 0 && creationTime < 1e12 ? creationTime * 1000 : creationTime;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function thumbnailIdsAround(
  assets: MediaLibrary.Asset[],
  topIndex: number,
  viewport: number,
  stride: number,
): string[] {
  const visibleRows = stride > 0 && viewport > 0 ? Math.ceil(viewport / stride) : 8;
  const row = Math.floor(Math.max(0, topIndex) / COLUMNS);
  const start = Math.max(0, (row - 2) * COLUMNS);
  const end = Math.min(assets.length, (row + visibleRows + 6) * COLUMNS);
  const ids: string[] = [];
  for (let index = start; index < end; index += 1) {
    ids.push(assets[index].id);
  }
  return ids;
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
  const [loading, setLoading] = useState(false);
  const [accessPrivileges, setAccessPrivileges] = useState<'all' | 'limited' | 'none' | undefined>(
    undefined
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topDateLabel, setTopDateLabel] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const cellSize = Math.floor(width / COLUMNS);
  const rowStride = cellSize;

  const listRef = useRef<FlatList<MediaLibrary.Asset>>(null);
  const generationRef = useRef(0);
  const assetsRef = useRef(assets);
  const rowStrideRef = useRef(rowStride);
  const viewportHeightRef = useRef(0);
  const paddingBottomRef = useRef(0);
  const scrubbingRef = useRef(false);
  const trackHeightRef = useRef(0);
  const pendingScrubOffsetRef = useRef<number | null>(null);
  const lastScrubOffsetRef = useRef(0);
  const scrubScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prepareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrepareOffsetRef = useRef<number | null>(null);
  const lastPrepareKeyRef = useRef('');
  const thumbPixelSizeRef = useRef(1);
  const ratioSv = useSharedValue(0);
  const scrubbingSv = useSharedValue(0);
  const trackHeightSv = useSharedValue(0);

  assetsRef.current = assets;
  rowStrideRef.current = rowStride;
  paddingBottomRef.current = insets.bottom + 24;
  thumbPixelSizeRef.current = Math.max(1, Math.round(cellSize * PixelRatio.get()));

  const loadAll = useCallback(async (generation: number) => {
    setLoading(true);
    let cursor: string | undefined;
    let first = true;
    try {
      while (generationRef.current === generation) {
        const page = await MediaLibrary.getAssetsAsync({
          first: first ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE,
          after: cursor,
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: [MediaLibrary.SortBy.creationTime],
        });
        if (generationRef.current !== generation) {
          return;
        }
        setAssets((prev) => (first ? page.assets : [...prev, ...page.assets]));
        if (first) {
          setLoading(false);
          const newest = page.assets[0];
          setTopDateLabel(newest ? formatAssetDate(newest.creationTime) : null);
        }
        first = false;
        if (!page.hasNextPage || !page.endCursor) {
          return;
        }
        cursor = page.endCursor;
      }
    } catch {
      if (generationRef.current === generation && first) {
        setAssets([]);
        setTopDateLabel(null);
      }
    } finally {
      if (generationRef.current === generation) {
        setLoading(false);
      }
    }
  }, []);

  const reload = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    if (generationRef.current !== generation) {
      return;
    }
    setAccessPrivileges(permission.accessPrivileges);
    setAssets([]);
    setTopDateLabel(null);
    ratioSv.value = 0;
    lastPrepareKeyRef.current = '';
    if (!permission.granted) {
      setLoading(false);
      return;
    }
    await loadAll(generation);
  }, [loadAll]);

  useEffect(() => {
    if (!visible) {
      generationRef.current += 1;
      setSelectedIds([]);
      if (scrubScrollTimerRef.current != null) {
        clearTimeout(scrubScrollTimerRef.current);
        scrubScrollTimerRef.current = null;
      }
      if (prepareTimerRef.current != null) {
        clearTimeout(prepareTimerRef.current);
        prepareTimerRef.current = null;
      }
      scrubbingRef.current = false;
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

  const scrollListTo = useCallback((offset: number) => {
    listRef.current?.scrollToOffset({ offset, animated: false });
  }, []);

  const flushPrepare = useCallback(() => {
    const offset = pendingPrepareOffsetRef.current;
    if (offset == null) {
      return;
    }
    const list = assetsRef.current;
    const viewport = viewportHeightRef.current;
    const stride = rowStrideRef.current;
    const topIndex = topIndexForOffset(offset, list.length, stride, viewport, paddingBottomRef.current);
    const ids = thumbnailIdsAround(list, topIndex, viewport, stride);
    const key = `${ids[0] ?? ''}:${ids.length}:${list.length}`;
    if (key === lastPrepareKeyRef.current) {
      return;
    }
    lastPrepareKeyRef.current = key;
    preparePhotoThumbnails(ids, thumbPixelSizeRef.current);
  }, []);

  const schedulePrepare = useCallback(
    (offset: number) => {
      pendingPrepareOffsetRef.current = offset;
      if (prepareTimerRef.current != null) {
        return;
      }
      flushPrepare();
      prepareTimerRef.current = setTimeout(() => {
        prepareTimerRef.current = null;
        flushPrepare();
      }, THUMB_PREPARE_MS);
    },
    [flushPrepare]
  );

  useEffect(() => {
    if (!visible || assets.length === 0) {
      if (assets.length === 0) {
        lastPrepareKeyRef.current = '';
      }
      return;
    }
    schedulePrepare(0);
  }, [assets.length === 0, schedulePrepare, visible]);

  const showDateAtOffset = useCallback(
    (offset: number) => {
      const list = assetsRef.current;
      const topIndex = topIndexForOffset(
        offset,
        list.length,
        rowStrideRef.current,
        viewportHeightRef.current,
        paddingBottomRef.current,
      );
      const asset = list[topIndex];
      const label = asset ? formatAssetDate(asset.creationTime) : '';
      setTopDateLabel((prev) => (prev === label ? prev : label || null));
      schedulePrepare(offset);
    },
    [schedulePrepare]
  );

  const applyScrub = useCallback(
    (y: number) => {
      const height = trackHeightRef.current;
      const list = assetsRef.current;
      const viewport = viewportHeightRef.current;
      if (height <= 0 || list.length === 0 || viewport <= 0) {
        return;
      }
      const ratio = Math.min(1, Math.max(0, y / height));
      const { maxOffset } = libraryScrollMetrics(
        list.length,
        rowStrideRef.current,
        viewport,
        paddingBottomRef.current,
      );
      const offset = ratio * maxOffset;
      if (!scrubbingRef.current) {
        scrubbingRef.current = true;
        setScrubbing(true);
      }
      showDateAtOffset(offset);
      pendingScrubOffsetRef.current = offset;
      const delta = Math.abs(offset - lastScrubOffsetRef.current);
      if (delta < rowStrideRef.current) {
        return;
      }
      if (delta <= viewport || scrubScrollTimerRef.current == null) {
        lastScrubOffsetRef.current = offset;
        scrollListTo(offset);
        if (delta <= viewport || scrubScrollTimerRef.current != null) {
          return;
        }
        scrubScrollTimerRef.current = setTimeout(() => {
          scrubScrollTimerRef.current = null;
          if (!scrubbingRef.current) {
            return;
          }
          const pending = pendingScrubOffsetRef.current;
          if (pending == null || Math.abs(pending - lastScrubOffsetRef.current) < rowStrideRef.current) {
            return;
          }
          lastScrubOffsetRef.current = pending;
          scrollListTo(pending);
        }, SCRUB_SCROLL_MS);
      }
    },
    [scrollListTo, showDateAtOffset]
  );

  const endScrub = useCallback(() => {
    if (scrubScrollTimerRef.current != null) {
      clearTimeout(scrubScrollTimerRef.current);
      scrubScrollTimerRef.current = null;
    }
    const pending = pendingScrubOffsetRef.current;
    pendingScrubOffsetRef.current = null;
    if (pending != null) {
      lastScrubOffsetRef.current = pending;
      scrollListTo(pending);
    }
    scrubbingRef.current = false;
    setScrubbing(false);
  }, [scrollListTo]);

  const scrubGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 8 })
        .onBegin((event) => {
          const height = trackHeightSv.value;
          if (height > 0) {
            ratioSv.value = Math.min(1, Math.max(0, event.y / height));
          }
          scrubbingSv.value = 1;
          runOnJS(applyScrub)(event.y);
        })
        .onUpdate((event) => {
          const height = trackHeightSv.value;
          if (height > 0) {
            ratioSv.value = Math.min(1, Math.max(0, event.y / height));
          }
          runOnJS(applyScrub)(event.y);
        })
        .onFinalize(() => {
          scrubbingSv.value = 0;
          runOnJS(endScrub)();
        }),
    [applyScrub, endScrub, ratioSv, scrubbingSv, trackHeightSv]
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.y;
      const viewport = event.nativeEvent.layoutMeasurement.height;
      viewportHeightRef.current = viewport;
      if (scrubbingRef.current) {
        return;
      }
      showDateAtOffset(offset);
      const { maxOffset } = libraryScrollMetrics(
        assetsRef.current.length,
        rowStrideRef.current,
        viewport,
        paddingBottomRef.current,
      );
      const ratio = maxOffset <= 0 ? 0 : Math.min(1, Math.max(0, offset / maxOffset));
      lastScrubOffsetRef.current = offset;
      ratioSv.value = ratio;
    },
    [ratioSv, showDateAtOffset]
  );

  const orderById = useMemo(() => {
    const map = new Map<string, number>();
    selectedIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [selectedIds]);

  const limited = accessPrivileges === 'limited';
  const photoLimit = registeredCount + maxSelection;
  const usedCount = registeredCount + selectedIds.length;
  const renderPhoto = useCallback(
    ({ item }: { item: MediaLibrary.Asset }) => {
      const order = orderById.get(item.id);
      const checked = order != null;
      return (
        <Pressable
          style={{ width: cellSize, height: cellSize, backgroundColor: '#d6d6d6' }}
          onPress={() => toggle(item.id)}
          disabled={preparing || (!checked && selectedIds.length >= maxSelection)}
        >
          <PhotoLibraryThumb
            assetId={item.id}
            uri={item.uri}
            pixelSize={thumbPixelSizeRef.current}
            style={styles.thumb}
          />
          {checked ? (
            <View style={[styles.badge, styles.badgeOn]}>
              <Text style={styles.badgeText}>{String(order + 1)}</Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [cellSize, maxSelection, orderById, preparing, selectedIds.length, toggle]
  );

  const listContentStyle = useMemo(
    () => ({
      paddingBottom: insets.bottom + 24,
      minHeight:
        (assets.length === 0 ? 0 : Math.ceil(assets.length / COLUMNS) * cellSize) +
        insets.bottom +
        24,
    }),
    [assets.length, cellSize, insets.bottom]
  );
  const getItemLayout = useCallback(
    (_data: ArrayLike<MediaLibrary.Asset> | null | undefined, index: number) => ({
      length: cellSize,
      offset: cellSize * index,
      index,
    }),
    [cellSize]
  );
  const thumbStyle = useAnimatedStyle(() => ({
    top: ratioSv.value * Math.max(0, trackHeightSv.value - SCRUBBER_THUMB),
  }));
  const dateChipStyle = useAnimatedStyle(() => {
    const travel = Math.max(0, trackHeightSv.value - SCRUBBER_THUMB);
    const thumbTop = ratioSv.value * travel;
    const top = scrubbingSv.value
      ? Math.min(Math.max(8, thumbTop + SCRUBBER_THUMB / 2 - 18), Math.max(8, trackHeightSv.value - 40))
      : 8;
    return { top };
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.screen}>
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
          <View style={styles.body}>
            <FlatList
              ref={listRef}
              style={styles.list}
              data={assets}
              keyExtractor={(item) => item.id}
              numColumns={COLUMNS}
              initialNumToRender={COLUMNS * 8}
              maxToRenderPerBatch={COLUMNS * 8}
              updateCellsBatchingPeriod={16}
              windowSize={4}
              removeClippedSubviews={false}
              scrollEventThrottle={32}
              getItemLayout={getItemLayout}
              onScroll={onScroll}
              onLayout={(event) => {
                viewportHeightRef.current = event.nativeEvent.layout.height;
                schedulePrepare(lastScrubOffsetRef.current);
              }}
              contentContainerStyle={listContentStyle}
              renderItem={renderPhoto}
              ListEmptyComponent={
                loading ? (
                  <ActivityIndicator style={styles.empty} color={colors.onScreenTextSecondary} />
                ) : (
                  <Text style={[styles.emptyText, { color: colors.onScreenTextSecondary }]}>
                    {limited ? '表示できる写真がありません' : '写真がありません'}
                  </Text>
                )
              }
            />
            {topDateLabel ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.dateChip, scrubbing ? styles.dateChipScrubbing : null, dateChipStyle]}
              >
                <Text style={[styles.dateChipText, scrubbing ? styles.dateChipTextScrubbing : null]}>
                  {topDateLabel}
                </Text>
              </Animated.View>
            ) : null}
            <GestureDetector gesture={scrubGesture}>
              <View
                style={styles.scrubber}
                accessibilityRole="adjustable"
                accessibilityLabel="写真の日付をさかのぼる"
                onLayout={(event) => {
                  const height = event.nativeEvent.layout.height;
                  trackHeightRef.current = height;
                  trackHeightSv.value = height;
                }}
              >
                <View style={[styles.scrubberTrack, { backgroundColor: colors.topBarBorder }]} />
                {assets.length > 0 ? (
                  <Animated.View
                    style={[styles.scrubberThumb, thumbStyle, { backgroundColor: colors.onScreenText }]}
                  />
                ) : null}
              </View>
            </GestureDetector>
          </View>
          {preparing ? (
            <View style={styles.preparing}>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.preparingText}>写真を読み込んでいます</Text>
            </View>
          ) : null}
          {children}
        </View>
      </GestureHandlerRootView>
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
  body: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  dateChip: {
    position: 'absolute',
    top: 8,
    right: SCRUBBER_HIT + 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  dateChipScrubbing: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  dateChipText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  dateChipTextScrubbing: {
    fontSize: 16,
  },
  scrubber: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: SCRUBBER_HIT,
    alignItems: 'flex-end',
  },
  scrubberTrack: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    right: 2,
    width: 2,
    borderRadius: 1,
  },
  scrubberThumb: {
    position: 'absolute',
    right: 1,
    width: 4,
    height: SCRUBBER_THUMB,
    borderRadius: 2,
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
    ...StyleSheet.absoluteFill,
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
