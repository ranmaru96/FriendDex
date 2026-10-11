import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Image } from 'expo-image';
import { PhotoLibraryThumb, preparePhotoThumbnails } from '@/modules/photo-thumbnails/src';
import {
  claimEpisodePhotoPrefetch,
  DEFAULT_EPISODE_PHOTO_SPAN,
  EXTEND_DAYS,
  PHOTO_LIBRARY_COLUMNS,
  peekEpisodePhotoPrefetch,
  photoLibraryCellSize,
  photoThumbPixelSize,
  type EpisodePhotoPrefetch,
  type EpisodePhotoSpan,
} from '@/utils/episodePhotoPrefetch';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';

const COLUMNS = PHOTO_LIBRARY_COLUMNS;
/** 慣性が止まってから、止まったとみなすまで。 */
const SETTLE_AFTER_MOMENTUM_MS = 150;
/** 指を離したあと、慣性が始まらなければ止まったとみなすまで。 */
const SETTLE_AFTER_DRAG_MS = 80;
/** 高解像度にする範囲。表示中の行の前後に足す行数。 */
const HIGH_RES_MARGIN_ROWS = 2;
const SCRUBBER_HIT = 16;
const SCRUBBER_THUMB = 44;
/** ドラッグ中に写真を描き直す間隔。毎フレーム動かすと読み込みが追いつかず画面が空になる。 */
const SCRUB_SCROLL_MS = 100;
const THUMB_PREPARE_MS = 50;
/** getItemLayout の offset に足すため、先頭のボタンは高さ固定にする。 */
const EXTEND_BUTTON_HEIGHT = 48;
/**
 * true にすると iOS で BlurView を使う。
 * expo-blur が未導入のため false。導入後に true へ切り替え可能。
 */
const PREVIEW_BLUR_ENABLED = false;
const PREVIEW_SIDE_INSET = 16;
const PREVIEW_MAX_HEIGHT_RATIO = 0.7;
const PREVIEW_RADIUS = 16;
const PREVIEW_ENTER_MS = 120;

type ExtendSide = 'newer' | 'older';

type PhotoPreview = {
  asset: MediaLibrary.Asset;
  localUri: string | null;
};

/** 取得前の asset.width / height で枠を決め、localUri 到着後も寸法が跳ねないようにする。 */
function previewCardSize(
  asset: MediaLibrary.Asset,
  screenWidth: number,
  screenHeight: number,
): { width: number; height: number } {
  const maxWidth = Math.max(1, screenWidth - PREVIEW_SIDE_INSET * 2);
  const maxHeight = Math.max(1, screenHeight * PREVIEW_MAX_HEIGHT_RATIO);
  const aspect =
    asset.width > 0 && asset.height > 0 ? asset.width / asset.height : 1;
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return { width, height };
}

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

type LibraryPhotoCellProps = {
  asset: MediaLibrary.Asset;
  cellSize: number;
  pixelSize: number;
  highQuality: boolean;
  order: number | undefined;
  selectionFull: boolean;
  preparing: boolean;
  onToggle: (assetId: string) => void;
  onPreviewStart: (asset: MediaLibrary.Asset) => void;
  onPreviewEnd: () => void;
};

const LibraryPhotoCell = memo(function LibraryPhotoCell({
  asset,
  cellSize,
  pixelSize,
  highQuality,
  order,
  selectionFull,
  preparing,
  onToggle,
  onPreviewStart,
  onPreviewEnd,
}: LibraryPhotoCellProps) {
  const checked = order != null;
  const longPressedRef = useRef(false);
  return (
    <Pressable
      style={{ width: cellSize, height: cellSize, backgroundColor: '#d6d6d6' }}
      onPress={() => {
        // 長押し成立後に onPress が来ても選択を切り替えない。
        if (longPressedRef.current) {
          return;
        }
        if (!checked && selectionFull) {
          return;
        }
        onToggle(asset.id);
      }}
      onLongPress={() => {
        longPressedRef.current = true;
        onPreviewStart(asset);
      }}
      onPressOut={() => {
        onPreviewEnd();
        longPressedRef.current = false;
      }}
      disabled={preparing}
    >
      <PhotoLibraryThumb
        assetId={asset.id}
        uri={asset.uri}
        pixelSize={pixelSize}
        highQuality={highQuality}
        style={styles.thumb}
      />
      {checked ? (
        <View style={[styles.badge, styles.badgeOn]}>
          <Text style={styles.badgeText}>{String(order + 1)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

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
  const { width, height: windowHeight } = useWindowDimensions();
  const { colors } = useAppTheme();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessPrivileges, setAccessPrivileges] = useState<'all' | 'limited' | 'none' | undefined>(
    undefined
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topDateLabel, setTopDateLabel] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [listKey, setListKey] = useState(0);
  const [initialRow, setInitialRow] = useState(0);
  const [hasNewerBeyond, setHasNewerBeyond] = useState(false);
  const [hasOlderBeyond, setHasOlderBeyond] = useState(false);
  const [extending, setExtending] = useState<ExtendSide | null>(null);
  const [preview, setPreview] = useState<PhotoPreview | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const cellSize = photoLibraryCellSize(width);
  const lowPixelSize = photoThumbPixelSize(cellSize, false);
  const highPixelSize = photoThumbPixelSize(cellSize, true);
  const rowStride = cellSize;
  const headerHeight = hasNewerBeyond ? EXTEND_BUTTON_HEIGHT : 0;

  const listRef = useRef<FlatList<MediaLibrary.Asset>>(null);
  const generationRef = useRef(0);
  const assetsRef = useRef(assets);
  const rowStrideRef = useRef(rowStride);
  const headerHeightRef = useRef(headerHeight);
  const viewportHeightRef = useRef(0);
  const paddingBottomRef = useRef(0);
  const scrubbingRef = useRef(false);
  const trackHeightRef = useRef(0);
  const pendingScrubOffsetRef = useRef<number | null>(null);
  const lastScrubOffsetRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const scrubScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prepareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrepareOffsetRef = useRef<number | null>(null);
  const lastPrepareKeyRef = useRef('');
  const lowPixelSizeRef = useRef(lowPixelSize);
  const highPixelSizeRef = useRef(highPixelSize);
  const spanRef = useRef<EpisodePhotoSpan>(DEFAULT_EPISODE_PHOTO_SPAN);
  const extendingRef = useRef(false);
  const previewTokenRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMovingRef = useRef(false);
  const ratioSv = useSharedValue(0);
  const scrubbingSv = useSharedValue(0);
  const trackHeightSv = useSharedValue(0);
  const previewEnterSv = useSharedValue(0);

  assetsRef.current = assets;
  rowStrideRef.current = rowStride;
  headerHeightRef.current = headerHeight;
  paddingBottomRef.current = insets.bottom + 24;
  lowPixelSizeRef.current = lowPixelSize;
  highPixelSizeRef.current = highPixelSize;
  isMovingRef.current = isMoving;

  const syncRatio = useCallback(
    (offset: number) => {
      const viewport = viewportHeightRef.current;
      if (viewport <= 0) {
        return;
      }
      const { maxOffset } = libraryScrollMetrics(
        assetsRef.current.length,
        rowStrideRef.current,
        viewport,
        paddingBottomRef.current,
      );
      ratioSv.value = maxOffset <= 0 ? 0 : Math.min(1, Math.max(0, offset / maxOffset));
    },
    [ratioSv]
  );

  const showResult = useCallback(
    (result: EpisodePhotoPrefetch, anchorId: string | null) => {
      const list = result.assets;
      let topIndex = result.dayStartIndex;
      if (anchorId) {
        const found = list.findIndex((asset) => asset.id === anchorId);
        if (found >= 0) {
          topIndex = found;
        }
      }
      topIndex = list.length === 0 ? 0 : Math.min(list.length - 1, Math.max(0, topIndex));
      const row = Math.floor(topIndex / COLUMNS);
      const header = result.hasNewerBeyond ? EXTEND_BUTTON_HEIGHT : 0;
      const offset = row > 0 ? header + row * rowStrideRef.current : 0;
      assetsRef.current = list;
      headerHeightRef.current = header;
      currentOffsetRef.current = offset;
      lastScrubOffsetRef.current = offset;
      lastPrepareKeyRef.current = '';
      if (settleTimerRef.current != null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      setAssets(list);
      setInitialRow(row);
      setHasNewerBeyond(result.hasNewerBeyond);
      setHasOlderBeyond(result.hasOlderBeyond);
      setListKey((prev) => prev + 1);
      setIsMoving(false);
      const top = list[topIndex];
      setTopDateLabel(top ? formatAssetDate(top.creationTime) : null);
      syncRatio(offset);
      setLoading(false);
    },
    [syncRatio]
  );

  const loadLibrary = useCallback(
    async (generation: number, anchorId: string | null) => {
      const span = spanRef.current;
      if (anchorId == null) {
        const peeked = peekEpisodePhotoPrefetch(anchorDate, span);
        if (peeked) {
          showResult(peeked, null);
          return;
        }
        assetsRef.current = [];
        setAssets([]);
        setTopDateLabel(null);
        setLoading(true);
      }
      let result: EpisodePhotoPrefetch;
      try {
        result = await claimEpisodePhotoPrefetch(anchorDate, span);
      } catch {
        if (generationRef.current === generation) {
          setLoading(false);
        }
        return;
      }
      if (generationRef.current !== generation) {
        return;
      }
      if (!result.granted) {
        setLoading(false);
        return;
      }
      showResult(result, anchorId);
    },
    [anchorDate, showResult]
  );

  const closePreview = useCallback(() => {
    previewTokenRef.current += 1;
    previewEnterSv.value = 0;
    setPreview(null);
  }, [previewEnterSv]);

  const openPreview = useCallback(async (asset: MediaLibrary.Asset) => {
    if (isMovingRef.current) {
      return;
    }
    const token = previewTokenRef.current + 1;
    previewTokenRef.current = token;
    previewEnterSv.value = 0;
    setPreview({ asset, localUri: null });
    previewEnterSv.value = withTiming(1, { duration: PREVIEW_ENTER_MS });
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: true });
      if (previewTokenRef.current !== token) {
        return;
      }
      if (!info.localUri) {
        throw new Error('localUri missing');
      }
      setPreview({ asset, localUri: info.localUri });
    } catch {
      if (previewTokenRef.current !== token) {
        return;
      }
      previewTokenRef.current += 1;
      previewEnterSv.value = 0;
      setPreview(null);
    }
  }, [previewEnterSv]);

  const reload = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    spanRef.current = DEFAULT_EPISODE_PHOTO_SPAN;
    closePreview();
    const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    if (generationRef.current !== generation) {
      return;
    }
    setAccessPrivileges(permission.accessPrivileges);
    ratioSv.value = 0;
    lastPrepareKeyRef.current = '';
    lastScrubOffsetRef.current = 0;
    currentOffsetRef.current = 0;
    if (!permission.granted) {
      assetsRef.current = [];
      setAssets([]);
      setHasNewerBeyond(false);
      setHasOlderBeyond(false);
      setTopDateLabel(null);
      setLoading(false);
      return;
    }
    await loadLibrary(generation, null);
  }, [closePreview, loadLibrary, ratioSv]);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    assetsRef.current = [];
    setAssets([]);
    setHasNewerBeyond(false);
    setHasOlderBeyond(false);
    setTopDateLabel(null);
    setLoading(true);
  }, [visible]);

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
      if (settleTimerRef.current != null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      scrubbingRef.current = false;
      setIsMoving(false);
      spanRef.current = DEFAULT_EPISODE_PHOTO_SPAN;
      extendingRef.current = false;
      setExtending(null);
      closePreview();
      return;
    }
    void reload();
  }, [closePreview, reload, visible]);

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
  }, []);

  /** ヘッダーのボタンを除いた、写真の並びの中での位置。 */
  const topIndexAt = useCallback((offset: number) => {
    const list = assetsRef.current;
    return topIndexForOffset(
      Math.max(0, offset - headerHeightRef.current),
      list.length,
      rowStrideRef.current,
      viewportHeightRef.current,
      paddingBottomRef.current,
    );
  }, []);

  const flushPrepare = useCallback(() => {
    const offset = pendingPrepareOffsetRef.current;
    if (offset == null) {
      return;
    }
    const list = assetsRef.current;
    const viewport = viewportHeightRef.current;
    const stride = rowStrideRef.current;
    const ids = thumbnailIdsAround(list, topIndexAt(offset), viewport, stride);
    const key = `${ids[0] ?? ''}:${ids.length}`;
    if (key === lastPrepareKeyRef.current) {
      return;
    }
    lastPrepareKeyRef.current = key;
    preparePhotoThumbnails(ids, lowPixelSizeRef.current);
  }, [topIndexAt]);

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

  const prepareHighResAround = useCallback(
    (offset: number) => {
      const list = assetsRef.current;
      if (list.length === 0) {
        return;
      }
      const topIndex = topIndexAt(offset);
      const viewport = viewportHeightRef.current;
      const stride = rowStrideRef.current;
      const visibleRows = stride > 0 && viewport > 0 ? Math.ceil(viewport / stride) : 8;
      const row = Math.floor(Math.max(0, topIndex) / COLUMNS);
      const start = Math.max(0, (row - HIGH_RES_MARGIN_ROWS) * COLUMNS);
      const end = Math.min(list.length, (row + visibleRows + HIGH_RES_MARGIN_ROWS) * COLUMNS);
      const ids: string[] = [];
      for (let index = start; index < end; index += 1) {
        ids.push(list[index].id);
      }
      preparePhotoThumbnails(ids, highPixelSizeRef.current, true);
    },
    [topIndexAt]
  );

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current != null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const markMoving = useCallback(() => {
    clearSettleTimer();
    setIsMoving(true);
  }, [clearSettleTimer]);

  const scheduleSettled = useCallback(
    (delayMs: number) => {
      clearSettleTimer();
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        if (scrubbingRef.current) {
          return;
        }
        setIsMoving(false);
        prepareHighResAround(currentOffsetRef.current);
      }, delayMs);
    },
    [clearSettleTimer, prepareHighResAround]
  );

  useEffect(() => {
    if (!visible || assetsRef.current.length === 0) {
      lastPrepareKeyRef.current = '';
      return;
    }
    schedulePrepare(currentOffsetRef.current);
  }, [listKey, schedulePrepare, visible]);

  useEffect(() => {
    if (!visible || isMoving || assets.length === 0) {
      return;
    }
    prepareHighResAround(currentOffsetRef.current);
  }, [assets.length, isMoving, listKey, prepareHighResAround, visible]);

  const showDateAtOffset = useCallback(
    (offset: number) => {
      const asset = assetsRef.current[topIndexAt(offset)];
      const label = asset ? formatAssetDate(asset.creationTime) : '';
      setTopDateLabel((prev) => (prev === label ? prev : label || null));
      schedulePrepare(offset);
    },
    [schedulePrepare, topIndexAt]
  );

  const extendRange = useCallback(
    async (side: ExtendSide) => {
      if (extendingRef.current) {
        return;
      }
      const list = assetsRef.current;
      const anchorId = list[topIndexAt(currentOffsetRef.current)]?.id ?? null;
      const span = spanRef.current;
      spanRef.current =
        side === 'newer'
          ? { ...span, newerDays: span.newerDays + EXTEND_DAYS }
          : { ...span, olderDays: span.olderDays + EXTEND_DAYS };
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      extendingRef.current = true;
      setExtending(side);
      try {
        await loadLibrary(generation, anchorId);
      } finally {
        extendingRef.current = false;
        setExtending(null);
      }
    },
    [loadLibrary, topIndexAt]
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
        markMoving();
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
    [markMoving, scrollListTo, showDateAtOffset]
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
    scheduleSettled(SETTLE_AFTER_MOMENTUM_MS);
  }, [scheduleSettled, scrollListTo]);

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
      viewportHeightRef.current = event.nativeEvent.layoutMeasurement.height;
      currentOffsetRef.current = offset;
      if (scrubbingRef.current) {
        return;
      }
      lastScrubOffsetRef.current = offset;
      showDateAtOffset(offset);
      syncRatio(offset);
    },
    [showDateAtOffset, syncRatio]
  );

  const orderById = useMemo(() => {
    const map = new Map<string, number>();
    selectedIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [selectedIds]);

  const limited = accessPrivileges === 'limited';
  const photoLimit = registeredCount + maxSelection;
  const usedCount = registeredCount + selectedIds.length;
  const selectionFull = selectedIds.length >= maxSelection;
  const useHighThumbs = !isMoving;
  const thumbPixelSize = useHighThumbs ? highPixelSize : lowPixelSize;
  const listExtraData = useMemo(
    () => ({ useHighThumbs, selectedIds, preparing, selectionFull }),
    [preparing, selectedIds, selectionFull, useHighThumbs]
  );
  const handlePreviewStart = useCallback(
    (asset: MediaLibrary.Asset) => {
      void openPreview(asset);
    },
    [openPreview]
  );
  const renderPhoto = useCallback(
    ({ item }: { item: MediaLibrary.Asset }) => (
      <LibraryPhotoCell
        asset={item}
        cellSize={cellSize}
        pixelSize={thumbPixelSize}
        highQuality={useHighThumbs}
        order={orderById.get(item.id)}
        selectionFull={selectionFull}
        preparing={preparing}
        onToggle={toggle}
        onPreviewStart={handlePreviewStart}
        onPreviewEnd={closePreview}
      />
    ),
    [
      cellSize,
      closePreview,
      handlePreviewStart,
      orderById,
      preparing,
      selectionFull,
      thumbPixelSize,
      toggle,
      useHighThumbs,
    ]
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
      offset: headerHeight + cellSize * index,
      index,
    }),
    [cellSize, headerHeight]
  );
  const renderExtendButton = (side: ExtendSide) => (
    <Pressable
      style={styles.extendButton}
      onPress={() => void extendRange(side)}
      disabled={extending != null || preparing}
    >
      {extending === side ? (
        <ActivityIndicator color={colors.onScreenTextSecondary} />
      ) : (
        <Text
          style={[
            styles.extendLabel,
            { color: colors.onScreenText },
            extending != null ? styles.headerActionDisabled : null,
          ]}
        >
          {side === 'newer' ? 'さらに新しい写真を表示' : 'さらに古い写真を表示'}
        </Text>
      )}
    </Pressable>
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

  const showList = !loading && assets.length > 0;
  const previewFrame = useMemo(
    () => (preview ? previewCardSize(preview.asset, width, windowHeight) : null),
    [preview, width, windowHeight]
  );
  const previewCardAnimStyle = useAnimatedStyle(() => ({
    opacity: previewEnterSv.value,
    transform: [{ scale: 0.92 + previewEnterSv.value * 0.08 }],
  }));
  const previewVeilAnimStyle = useAnimatedStyle(() => ({
    opacity: previewEnterSv.value,
  }));

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
            {showList ? (
              <FlatList
                key={`library-${listKey}`}
                ref={listRef}
                style={styles.list}
                data={assets}
                extraData={listExtraData}
                keyExtractor={(item) => item.id}
                numColumns={COLUMNS}
                initialNumToRender={COLUMNS * 8}
                initialScrollIndex={initialRow > 0 ? initialRow : undefined}
                maxToRenderPerBatch={COLUMNS * 8}
                updateCellsBatchingPeriod={16}
                windowSize={4}
                removeClippedSubviews={false}
                scrollEventThrottle={32}
                getItemLayout={getItemLayout}
                onScroll={onScroll}
                onScrollBeginDrag={markMoving}
                onScrollEndDrag={() => scheduleSettled(SETTLE_AFTER_DRAG_MS)}
                onMomentumScrollBegin={markMoving}
                onMomentumScrollEnd={() => scheduleSettled(SETTLE_AFTER_MOMENTUM_MS)}
                onLayout={(event) => {
                  viewportHeightRef.current = event.nativeEvent.layout.height;
                  syncRatio(currentOffsetRef.current);
                  schedulePrepare(currentOffsetRef.current);
                }}
                contentContainerStyle={listContentStyle}
                renderItem={renderPhoto}
                ListHeaderComponent={hasNewerBeyond ? renderExtendButton('newer') : null}
                ListFooterComponent={hasOlderBeyond ? renderExtendButton('older') : null}
              />
            ) : loading ? (
              <ActivityIndicator style={styles.empty} color={colors.onScreenTextSecondary} />
            ) : (
              <Text style={[styles.emptyText, { color: colors.onScreenTextSecondary }]}>
                {limited ? '表示できる写真がありません' : '写真がありません'}
              </Text>
            )}
            {showList && topDateLabel ? (
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
                {showList ? (
                  <Animated.View
                    style={[styles.scrubberThumb, thumbStyle, { backgroundColor: colors.onScreenText }]}
                  />
                ) : null}
              </View>
            </GestureDetector>
          </View>
          {preview && previewFrame ? (
            <View pointerEvents="none" style={styles.previewOverlay}>
              <Animated.View
                style={[
                  styles.previewVeil,
                  PREVIEW_BLUR_ENABLED && Platform.OS === 'ios'
                    ? styles.previewVeilIos
                    : styles.previewVeilSolid,
                  previewVeilAnimStyle,
                ]}
              />
              <View style={styles.previewCenter}>
                <Animated.View
                  style={[
                    styles.previewCard,
                    {
                      width: previewFrame.width,
                      height: previewFrame.height,
                      borderRadius: PREVIEW_RADIUS,
                    },
                    previewCardAnimStyle,
                  ]}
                >
                  {preview.localUri ? (
                    <Image
                      source={{ uri: preview.localUri }}
                      style={styles.previewImage}
                      contentFit="contain"
                      transition={0}
                    />
                  ) : (
                    <View style={styles.previewLoading}>
                      <PhotoLibraryThumb
                        assetId={preview.asset.id}
                        uri={preview.asset.uri}
                        pixelSize={lowPixelSize}
                        style={styles.previewImage}
                      />
                      <ActivityIndicator style={styles.previewSpinner} color="#ffffff" />
                    </View>
                  )}
                </Animated.View>
              </View>
            </View>
          ) : null}
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
  previewOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
  previewVeil: {
    ...StyleSheet.absoluteFill,
  },
  previewVeilSolid: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  previewVeilIos: {
    // expo-blur 導入後は BlurView に差し替える。暫定は薄い暗い膜。
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  previewCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewLoading: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSpinner: {
    position: 'absolute',
  },
  extendButton: {
    height: EXTEND_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extendLabel: {
    fontSize: 14,
    fontWeight: '600',
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
