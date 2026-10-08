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
import {
  claimEpisodePhotoPrefetch,
  peekEpisodePhotoPrefetch,
  type EpisodePhotoPrefetch,
} from '@/utils/episodePhotoPrefetch';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';

const NEXT_PAGE_SIZE = 400;
/** 上へ足す枚数。一度に足しすぎると、見えている日付の描画が追いつかない。 */
const NEWER_CHUNK_SIZE = 80;
/** 開いた直後に、対象日より新しい側へ足す最大枚数。続きは先頭付近まで来てから。 */
const NEWER_INITIAL_MAX = 400;
/** 先頭から何行以内なら、新しい側の続きを足すか。 */
const NEWER_NEAR_TOP_ROWS = 6;
/** ページ境界で重なりうる id だけ見る。全件の照合はしない。 */
const NEWER_BOUNDARY_IDS = 64;
/** チャンクを反映したあと、次を足すまでの間隔。操作中はさらに待つ。 */
const CHUNK_GAP_MS = 250;
/** ドラッグ終了後、慣性開始が来なければ操作中を解く。 */
const USER_BUSY_RELEASE_MS = 80;
/** busy のままイベントが来なければ操作中を解く。 */
const USER_BUSY_STALE_MS = 3000;
/** waitForIdle が busy / スクラブ待ちする上限。 */
const WAIT_FOR_IDLE_BUSY_MAX_MS = 2000;
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
  /** エピソードの日付。YYYY-MM-DD。空や当日は最新の写真から開く。 */
  anchorDate: string;
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

function appendUnique(current: MediaLibrary.Asset[], incoming: MediaLibrary.Asset[]): MediaLibrary.Asset[] {
  if (incoming.length === 0) {
    return current;
  }
  const seen = new Set(current.map((asset) => asset.id));
  const extra = incoming.filter((asset) => !seen.has(asset.id));
  if (extra.length === 0) {
    return current;
  }
  return [...current, ...extra];
}

/** 一覧の組み直しとスクロール位置の維持が描画に追いついてから、次のページを取る。 */
function settleFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 描画の合間を空け、スクロールやスクラブのあいだはチャンクを足さない。 */
async function waitForIdle(
  generation: number,
  generationRef: { current: number },
  userBusyRef: { current: boolean },
  scrubbingRef: { current: boolean },
): Promise<void> {
  await settleFrame();
  await delay(CHUNK_GAP_MS);
  const busyStartedAt = Date.now();
  while (generationRef.current === generation && (userBusyRef.current || scrubbingRef.current)) {
    if (Date.now() - busyStartedAt >= WAIT_FOR_IDLE_BUSY_MAX_MS) {
      break;
    }
    await delay(150);
  }
}

/** 取得ページの先頭と、直前チャンクの境界だけを見る。createdAfter と createdBefore は範囲が重ならない。 */
function appendNewerPending(
  pending: MediaLibrary.Asset[],
  head: MediaLibrary.Asset[],
  incoming: MediaLibrary.Asset[],
): void {
  if (incoming.length === 0) {
    return;
  }
  const seen = new Set<string>();
  if (pending.length > 0) {
    const start = Math.max(0, pending.length - NEWER_BOUNDARY_IDS);
    for (let index = start; index < pending.length; index += 1) {
      seen.add(pending[index].id);
    }
  } else {
    const count = Math.min(NEWER_BOUNDARY_IDS, head.length);
    for (let index = 0; index < count; index += 1) {
      seen.add(head[index].id);
    }
  }
  for (const asset of incoming) {
    if (seen.has(asset.id)) {
      continue;
    }
    seen.add(asset.id);
    pending.push(asset);
  }
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
  anchorDate,
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
  const currentOffsetRef = useRef(0);
  const pendingScrollAdjustRef = useRef(0);
  const pinToTopRef = useRef(false);
  const correctingScrollRef = useRef(false);
  const scrubScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prepareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrepareOffsetRef = useRef<number | null>(null);
  const lastPrepareKeyRef = useRef('');
  const thumbPixelSizeRef = useRef(1);
  const headRef = useRef<MediaLibrary.Asset[]>([]);
  const tailRef = useRef<MediaLibrary.Asset[]>([]);
  const newerCursorRef = useRef<string | undefined>(undefined);
  const newerHasNextRef = useRef(false);
  const newerPendingRef = useRef<MediaLibrary.Asset[]>([]);
  const newerLoadingRef = useRef(false);
  const newerBeforeMsRef = useRef(0);
  const newerGenerationRef = useRef(0);
  const loadMoreNewerRef = useRef<(generation: number) => Promise<void>>(async () => {});
  const requestNewerIfNearTopRef = useRef<() => void>(() => {});
  const userBusyRef = useRef(false);
  const userBusyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userBusyStaleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ratioSv = useSharedValue(0);
  const scrubbingSv = useSharedValue(0);
  const trackHeightSv = useSharedValue(0);

  assetsRef.current = assets;
  rowStrideRef.current = rowStride;
  paddingBottomRef.current = insets.bottom + 24;
  thumbPixelSizeRef.current = Math.max(1, Math.round(cellSize * PixelRatio.get()));

  const loadLibrary = useCallback(async (generation: number) => {
    const publish = () => {
      if (generationRef.current !== generation) {
        return;
      }
      const next = [...headRef.current, ...tailRef.current];
      assetsRef.current = next;
      setAssets(next);
    };
    const showTopDate = (list: MediaLibrary.Asset[]) => {
      const top = list[0];
      setTopDateLabel(top ? formatAssetDate(top.creationTime) : null);
    };

    headRef.current = [];
    tailRef.current = [];
    newerCursorRef.current = undefined;
    newerHasNextRef.current = false;
    newerPendingRef.current = [];
    newerLoadingRef.current = false;
    newerBeforeMsRef.current = 0;
    newerGenerationRef.current = generation;
    pendingScrollAdjustRef.current = 0;
    pinToTopRef.current = false;
    correctingScrollRef.current = false;
    currentOffsetRef.current = 0;
    lastScrubOffsetRef.current = 0;
    const peeked = peekEpisodePhotoPrefetch(anchorDate);
    if (peeked && peeked.assets.length > 0) {
      tailRef.current = peeked.assets;
      publish();
      setLoading(false);
      showTopDate(peeked.assets);
    } else {
      setAssets([]);
      assetsRef.current = [];
      setTopDateLabel(null);
      setLoading(true);
    }

    let seeded: EpisodePhotoPrefetch;
    try {
      seeded = await claimEpisodePhotoPrefetch(anchorDate);
    } catch {
      if (generationRef.current === generation) {
        setLoading(false);
      }
      return;
    }
    if (generationRef.current !== generation) {
      return;
    }
    if (!seeded.granted) {
      setLoading(false);
      return;
    }
    if (tailRef.current.length === 0) {
      tailRef.current = seeded.assets;
      publish();
      setLoading(false);
      showTopDate(seeded.assets);
    }
    newerBeforeMsRef.current = seeded.beforeMs;

    const flushChunk = (force: boolean) => {
      if (generationRef.current !== generation) {
        return false;
      }
      const pending = newerPendingRef.current;
      const leftover = pending.length % COLUMNS;
      const aligned = pending.length - leftover;
      const count = force
        ? pending.length <= COLUMNS
          ? pending.length
          : Math.min(NEWER_CHUNK_SIZE, aligned)
        : pending.length >= NEWER_CHUNK_SIZE
          ? NEWER_CHUNK_SIZE
          : 0;
      if (count === 0) {
        return false;
      }
      const stride = rowStrideRef.current;
      const isRemainder = count % COLUMNS !== 0;
      if (isRemainder) {
        // 端数は先頭付近だけで出す。列ずれ補正はせず、先頭に固定する。
        if (stride > 0 && currentOffsetRef.current >= stride) {
          return false;
        }
        const chunk = pending.slice(0, count);
        newerPendingRef.current = pending.slice(count);
        chunk.reverse();
        headRef.current = [...chunk, ...headRef.current];
        pinToTopRef.current = true;
        pendingScrollAdjustRef.current = 0;
        publish();
        return true;
      }
      const chunk = pending.slice(0, count);
      newerPendingRef.current = pending.slice(count);
      chunk.reverse();
      headRef.current = [...chunk, ...headRef.current];
      if (stride > 0) {
        pendingScrollAdjustRef.current += (count / COLUMNS) * stride;
      }
      publish();
      return true;
    };

    const fetchNewerPage = async () => {
      const page = await MediaLibrary.getAssetsAsync({
        first: NEXT_PAGE_SIZE,
        after: newerCursorRef.current,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
        createdAfter: newerBeforeMsRef.current,
      });
      if (generationRef.current !== generation) {
        return false;
      }
      appendNewerPending(newerPendingRef.current, headRef.current, page.assets);
      newerHasNextRef.current = page.hasNextPage && Boolean(page.endCursor);
      newerCursorRef.current = page.endCursor;
      return true;
    };

    const pumpNewer = async (maxHead: number, pauseBeforeFirstChunk: boolean) => {
      let pause = pauseBeforeFirstChunk;
      while (generationRef.current === generation && headRef.current.length < maxHead) {
        const needFetch = newerPendingRef.current.length < NEWER_CHUNK_SIZE && newerHasNextRef.current;
        if (!needFetch && newerPendingRef.current.length === 0) {
          break;
        }
        if (pause) {
          await waitForIdle(generation, generationRef, userBusyRef, scrubbingRef);
          if (generationRef.current !== generation) {
            return;
          }
        }
        if (newerPendingRef.current.length < NEWER_CHUNK_SIZE && newerHasNextRef.current) {
          const fetched = await fetchNewerPage();
          if (!fetched || generationRef.current !== generation) {
            return;
          }
        }
        if (headRef.current.length >= maxHead) {
          break;
        }
        const exhausted = !newerHasNextRef.current;
        if (!flushChunk(exhausted)) {
          break;
        }
        pause = true;
        if (headRef.current.length >= maxHead) {
          break;
        }
      }
      if (generationRef.current === generation && !newerHasNextRef.current) {
        while (generationRef.current === generation && newerPendingRef.current.length > 0) {
          if (pause) {
            await waitForIdle(generation, generationRef, userBusyRef, scrubbingRef);
            if (generationRef.current !== generation) {
              return;
            }
          }
          if (!flushChunk(true)) {
            break;
          }
          pause = true;
        }
      }
    };

    const loadOlder = async () => {
      let cursor = seeded.endCursor;
      let hasNext = seeded.hasNextPage;
      while (generationRef.current === generation && hasNext && cursor) {
        const page = await MediaLibrary.getAssetsAsync({
          first: NEXT_PAGE_SIZE,
          after: cursor,
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: [MediaLibrary.SortBy.creationTime],
          createdBefore: seeded.beforeMs,
        });
        if (generationRef.current !== generation) {
          return;
        }
        tailRef.current = appendUnique(tailRef.current, page.assets);
        publish();
        hasNext = page.hasNextPage;
        cursor = page.endCursor;
        if (hasNext) {
          await waitForIdle(generation, generationRef, userBusyRef, scrubbingRef);
          if (generationRef.current !== generation) {
            return;
          }
        }
      }
    };

    const loadNewer = async () => {
      if (seeded.isToday) {
        return;
      }
      // 該当日を描いてから、その直後の写真を上へ足す。新しい順のままだと今日側から入り、
      // 位置を戻すスクロールが見えていない範囲へ飛んで画面が空になる。
      newerHasNextRef.current = true;
      newerLoadingRef.current = true;
      try {
        await pumpNewer(NEWER_INITIAL_MAX, true);
      } finally {
        newerLoadingRef.current = false;
      }
    };

    const loadMoreNewer = async (requestedGeneration: number) => {
      if (requestedGeneration === 0 || generationRef.current !== requestedGeneration) {
        return;
      }
      if (newerLoadingRef.current) {
        return;
      }
      if (!newerHasNextRef.current && newerPendingRef.current.length === 0) {
        return;
      }
      newerLoadingRef.current = true;
      try {
        const maxHead = headRef.current.length + NEWER_INITIAL_MAX;
        await pumpNewer(maxHead, false);
      } catch {
        // 続きは次に先頭付近へ来たときに取り直す。
      } finally {
        newerLoadingRef.current = false;
      }
      if (generationRef.current === requestedGeneration) {
        requestNewerIfNearTopRef.current();
      }
    };
    loadMoreNewerRef.current = loadMoreNewer;

    let failed = false;
    try {
      await loadNewer();
    } catch {
      failed = true;
    }
    if (generationRef.current !== generation) {
      return;
    }
    try {
      await loadOlder();
    } catch {
      failed = true;
    }
    if (
      failed &&
      generationRef.current === generation &&
      tailRef.current.length === 0 &&
      headRef.current.length === 0
    ) {
      setAssets([]);
      assetsRef.current = [];
      setTopDateLabel(null);
    }
    if (generationRef.current === generation) {
      setLoading(false);
    }
  }, [anchorDate]);

  const reload = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    if (generationRef.current !== generation) {
      return;
    }
    setAccessPrivileges(permission.accessPrivileges);
    ratioSv.value = 0;
    lastPrepareKeyRef.current = '';
    lastScrubOffsetRef.current = 0;
    currentOffsetRef.current = 0;
    pendingScrollAdjustRef.current = 0;
    pinToTopRef.current = false;
    correctingScrollRef.current = false;
    if (!permission.granted) {
      headRef.current = [];
      tailRef.current = [];
      newerCursorRef.current = undefined;
      newerHasNextRef.current = false;
      newerPendingRef.current = [];
      newerLoadingRef.current = false;
      newerGenerationRef.current = 0;
      assetsRef.current = [];
      setAssets([]);
      setTopDateLabel(null);
      setLoading(false);
      return;
    }
    await loadLibrary(generation);
  }, [loadLibrary]);

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
      if (userBusyTimerRef.current != null) {
        clearTimeout(userBusyTimerRef.current);
        userBusyTimerRef.current = null;
      }
      if (userBusyStaleTimerRef.current != null) {
        clearTimeout(userBusyStaleTimerRef.current);
        userBusyStaleTimerRef.current = null;
      }
      userBusyRef.current = false;
      scrubbingRef.current = false;
      newerHasNextRef.current = false;
      newerPendingRef.current = [];
      newerLoadingRef.current = false;
      newerGenerationRef.current = 0;
      pendingScrollAdjustRef.current = 0;
      pinToTopRef.current = false;
      correctingScrollRef.current = false;
      currentOffsetRef.current = 0;
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
    currentOffsetRef.current = offset;
    lastScrubOffsetRef.current = offset;
  }, []);

  const applyPendingScrollAdjust = useCallback(() => {
    if (pinToTopRef.current) {
      pinToTopRef.current = false;
      pendingScrollAdjustRef.current = 0;
      correctingScrollRef.current = true;
      scrollListTo(0);
      return;
    }
    const delta = pendingScrollAdjustRef.current;
    if (delta <= 0) {
      return;
    }
    pendingScrollAdjustRef.current = 0;
    const next = currentOffsetRef.current + delta;
    correctingScrollRef.current = true;
    scrollListTo(next);
  }, [scrollListTo]);

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
    const key = `${ids[0] ?? ''}:${ids.length}`;
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
    schedulePrepare(lastScrubOffsetRef.current);
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

  const requestNewerIfNearTop = useCallback(() => {
    if (scrubbingRef.current) {
      return;
    }
    const stride = rowStrideRef.current;
    if (stride <= 0 || currentOffsetRef.current >= stride * NEWER_NEAR_TOP_ROWS) {
      return;
    }
    const pendingCount = newerPendingRef.current.length;
    const canFetchMore = newerHasNextRef.current;
    const canFlushChunk = pendingCount >= NEWER_CHUNK_SIZE;
    const canFlushRemainder = pendingCount > 0 && !canFetchMore && currentOffsetRef.current < stride;
    if (!canFetchMore && !canFlushChunk && !canFlushRemainder) {
      return;
    }
    void loadMoreNewerRef.current(newerGenerationRef.current);
  }, []);
  requestNewerIfNearTopRef.current = requestNewerIfNearTop;

  const armUserBusyStale = useCallback(() => {
    if (userBusyStaleTimerRef.current != null) {
      clearTimeout(userBusyStaleTimerRef.current);
    }
    userBusyStaleTimerRef.current = setTimeout(() => {
      userBusyStaleTimerRef.current = null;
      userBusyRef.current = false;
    }, USER_BUSY_STALE_MS);
  }, []);

  const markUserBusy = useCallback(() => {
    if (userBusyTimerRef.current != null) {
      clearTimeout(userBusyTimerRef.current);
      userBusyTimerRef.current = null;
    }
    userBusyRef.current = true;
    armUserBusyStale();
  }, [armUserBusyStale]);

  const releaseUserBusySoon = useCallback(() => {
    if (userBusyTimerRef.current != null) {
      clearTimeout(userBusyTimerRef.current);
    }
    userBusyTimerRef.current = setTimeout(() => {
      userBusyTimerRef.current = null;
      if (userBusyStaleTimerRef.current != null) {
        clearTimeout(userBusyStaleTimerRef.current);
        userBusyStaleTimerRef.current = null;
      }
      userBusyRef.current = false;
    }, USER_BUSY_RELEASE_MS);
  }, []);

  const markUserIdle = useCallback(() => {
    if (userBusyTimerRef.current != null) {
      clearTimeout(userBusyTimerRef.current);
      userBusyTimerRef.current = null;
    }
    if (userBusyStaleTimerRef.current != null) {
      clearTimeout(userBusyStaleTimerRef.current);
      userBusyStaleTimerRef.current = null;
    }
    userBusyRef.current = false;
  }, []);

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
    requestNewerIfNearTop();
  }, [requestNewerIfNearTop, scrollListTo]);

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
      currentOffsetRef.current = offset;
      lastScrubOffsetRef.current = offset;
      if (correctingScrollRef.current) {
        correctingScrollRef.current = false;
        const { maxOffset } = libraryScrollMetrics(
          assetsRef.current.length,
          rowStrideRef.current,
          viewport,
          paddingBottomRef.current,
        );
        ratioSv.value = maxOffset <= 0 ? 0 : Math.min(1, Math.max(0, offset / maxOffset));
        return;
      }
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
      ratioSv.value = ratio;
      requestNewerIfNearTop();
    },
    [ratioSv, requestNewerIfNearTop, showDateAtOffset]
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
              onScrollBeginDrag={markUserBusy}
              onScrollEndDrag={releaseUserBusySoon}
              onMomentumScrollBegin={markUserBusy}
              onMomentumScrollEnd={markUserIdle}
              onContentSizeChange={() => {
                applyPendingScrollAdjust();
              }}
              onLayout={(event) => {
                viewportHeightRef.current = event.nativeEvent.layout.height;
                schedulePrepare(currentOffsetRef.current);
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
    left: 6,
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
