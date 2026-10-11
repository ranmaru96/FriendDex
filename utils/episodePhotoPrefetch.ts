import { Dimensions, PixelRatio } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import { preparePhotoThumbnails } from '@/modules/photo-thumbnails/src';
import { formatDateKey, parseDateKey } from '@/utils/eventHelpers';

/** 対象日より新しい側に含める日数。 */
export const NEWER_DAYS = 14;
/** 対象日より古い側に含める日数。 */
export const OLDER_DAYS = 3;
/** 「さらに新しい / 古い写真を表示」1回で広げる日数。 */
export const EXTEND_DAYS = 30;
const PAGE_SIZE = 400;
const MAX_ASSETS = 3000;
/** 対象日側（当日と古い側）に割り当てる上限。残りを新しい側に回す。 */
const MAX_OLDER_SIDE_ASSETS = MAX_ASSETS / 2;
/** 開く前に用意するサムネイルの枚数。dayStartIndex の前後に半分ずつ。 */
const PREPARE_WINDOW = 70;

export type EpisodePhotoSpan = {
  newerDays: number;
  olderDays: number;
};

export const DEFAULT_EPISODE_PHOTO_SPAN: EpisodePhotoSpan = {
  newerDays: NEWER_DAYS,
  olderDays: OLDER_DAYS,
};

export type EpisodePhotoAnchor = {
  dateKey: string;
  dayStartMs: number;
  nextDayMs: number;
  isToday: boolean;
};

export type EpisodePhotoPrefetch = {
  dateKey: string;
  isToday: boolean;
  span: EpisodePhotoSpan;
  granted: boolean;
  /** 新しい順。 */
  assets: MediaLibrary.Asset[];
  /** 当日の最初の写真。当日が0枚なら当日に一番近い古い写真。どちらも無ければ 0。 */
  dayStartIndex: number;
  hasNewerBeyond: boolean;
  hasOlderBeyond: boolean;
};

type Task = EpisodePhotoPrefetch & {
  generation: number;
  settled: boolean;
  promise: Promise<EpisodePhotoPrefetch>;
};

let generationCounter = 0;
let current: Task | null = null;

export function episodePhotoAnchor(dateKey: string): EpisodePhotoAnchor {
  const todayKey = formatDateKey(new Date());
  const trimmed = dateKey.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : todayKey;
  const isToday = parsed >= todayKey;
  const dayKey = isToday ? todayKey : parsed;
  const day = parseDateKey(dayKey);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return { dateKey: dayKey, dayStartMs: dayStart.getTime(), nextDayMs: nextDay.getTime(), isToday };
}

/** 取得範囲。newerEndMs より前、olderStartMs 以後。 */
export function episodePhotoRange(
  anchor: EpisodePhotoAnchor,
  span: EpisodePhotoSpan,
): { newerEndMs: number; olderStartMs: number } {
  const day = parseDateKey(anchor.dateKey);
  const newerDays = anchor.isToday ? 0 : span.newerDays;
  const newerEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1 + newerDays);
  const olderStart = new Date(day.getFullYear(), day.getMonth(), day.getDate() - span.olderDays);
  return { newerEndMs: newerEnd.getTime(), olderStartMs: olderStart.getTime() };
}

/** creationTime は秒のこともある。 */
function assetTimeMs(creationTime: number): number {
  return creationTime > 0 && creationTime < 1e12 ? creationTime * 1000 : creationTime;
}

function sameSpan(a: EpisodePhotoSpan, b: EpisodePhotoSpan): boolean {
  return a.newerDays === b.newerDays && a.olderDays === b.olderDays;
}

/** 写真一覧の列数。セルの大きさとサムネイルの解像度の計算に使う。 */
export const PHOTO_LIBRARY_COLUMNS = 4;
/** 止まったあとに差し替える高解像度の倍率。 */
export const THUMB_SCALE_HIGH = 1.5;

export function photoLibraryCellSize(windowWidth: number): number {
  return Math.floor(windowWidth / PHOTO_LIBRARY_COLUMNS);
}

/** 一覧のサムネイルの画素数。モーダルと先読みで同じ値にする。 */
export function photoThumbPixelSize(cellSize: number, high: boolean): number {
  const low = Math.max(1, Math.round(cellSize * PixelRatio.get()));
  return high ? Math.max(1, Math.round(low * THUMB_SCALE_HIGH)) : low;
}

function thumbPixelSize(): number {
  return photoThumbPixelSize(photoLibraryCellSize(Dimensions.get('window').width), false);
}

function snapshot(task: Task): EpisodePhotoPrefetch {
  return {
    dateKey: task.dateKey,
    isToday: task.isToday,
    span: task.span,
    granted: task.granted,
    assets: task.assets,
    dayStartIndex: task.dayStartIndex,
    hasNewerBeyond: task.hasNewerBeyond,
    hasOlderBeyond: task.hasOlderBeyond,
  };
}

async function fetchSpan(
  createdAfter: number,
  createdBefore: number,
  ascending: boolean,
  limit: number,
  isCurrent: () => boolean,
): Promise<{ assets: MediaLibrary.Asset[]; truncated: boolean } | null> {
  const assets: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  while (assets.length < limit) {
    const page = await MediaLibrary.getAssetsAsync({
      first: Math.min(PAGE_SIZE, limit - assets.length),
      after,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, ascending]],
      createdAfter,
      createdBefore,
    });
    if (!isCurrent()) {
      return null;
    }
    assets.push(...page.assets);
    if (!page.hasNextPage || !page.endCursor) {
      return { assets, truncated: false };
    }
    after = page.endCursor;
  }
  return { assets, truncated: true };
}

async function existsPhoto(options: { createdAfter?: number; createdBefore?: number }): Promise<boolean> {
  const page = await MediaLibrary.getAssetsAsync({
    first: 1,
    mediaType: MediaLibrary.MediaType.photo,
    ...options,
  });
  return page.assets.length > 0;
}

async function run(task: Task): Promise<EpisodePhotoPrefetch> {
  const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  if (current !== task) {
    return snapshot(task);
  }
  task.granted = permission.granted;
  if (!permission.granted) {
    task.settled = true;
    return snapshot(task);
  }
  const isCurrent = () => current === task;
  try {
    const anchor = episodePhotoAnchor(task.dateKey);
    const { newerEndMs, olderStartMs } = episodePhotoRange(anchor, task.span);
    // 上限で切るときに対象日側が落ちないよう、対象日を境に両側から近い順に取る。
    const older = await fetchSpan(olderStartMs - 1, anchor.nextDayMs, false, MAX_OLDER_SIDE_ASSETS, isCurrent);
    if (!older) {
      return snapshot(task);
    }
    const newer =
      newerEndMs > anchor.nextDayMs
        ? await fetchSpan(anchor.nextDayMs - 1, newerEndMs, true, MAX_ASSETS - older.assets.length, isCurrent)
        : { assets: [], truncated: false };
    if (!newer) {
      return snapshot(task);
    }
    const [newerBeyond, olderBeyond] = await Promise.all([
      newer.truncated ? true : existsPhoto({ createdAfter: newerEndMs - 1 }),
      older.truncated ? true : existsPhoto({ createdBefore: olderStartMs }),
    ]);
    if (!isCurrent()) {
      return snapshot(task);
    }
    const seen = new Set<string>();
    const assets: MediaLibrary.Asset[] = [];
    for (let index = newer.assets.length - 1; index >= 0; index -= 1) {
      const asset = newer.assets[index];
      if (!seen.has(asset.id)) {
        seen.add(asset.id);
        assets.push(asset);
      }
    }
    for (const asset of older.assets) {
      if (!seen.has(asset.id)) {
        seen.add(asset.id);
        assets.push(asset);
      }
    }
    // 新しい順なので、翌日0時より前の最初の写真が当日の先頭。当日が0枚なら一番近い古い写真になる。
    const dayStartIndex = Math.max(
      0,
      assets.findIndex((asset) => assetTimeMs(asset.creationTime) < anchor.nextDayMs),
    );
    task.assets = assets;
    task.dayStartIndex = dayStartIndex;
    task.hasNewerBeyond = newerBeyond;
    task.hasOlderBeyond = olderBeyond;
    const start = Math.max(0, dayStartIndex - PREPARE_WINDOW / 2);
    const end = Math.min(assets.length, start + PREPARE_WINDOW);
    preparePhotoThumbnails(
      assets.slice(start, end).map((asset) => asset.id),
      thumbPixelSize()
    );
  } catch {
    if (current === task) {
      task.assets = [];
      task.dayStartIndex = 0;
      task.hasNewerBeyond = false;
      task.hasOlderBeyond = false;
    }
  }
  if (current === task) {
    task.settled = true;
  }
  return snapshot(task);
}

function start(dateKey: string, span: EpisodePhotoSpan): Promise<EpisodePhotoPrefetch> {
  const anchor = episodePhotoAnchor(dateKey);
  if (
    current?.dateKey === anchor.dateKey &&
    sameSpan(current.span, span) &&
    current.generation === generationCounter &&
    (!current.settled || current.granted)
  ) {
    return current.promise;
  }
  const generation = ++generationCounter;
  const empty: EpisodePhotoPrefetch = {
    dateKey: anchor.dateKey,
    isToday: anchor.isToday,
    span,
    granted: false,
    assets: [],
    dayStartIndex: 0,
    hasNewerBeyond: false,
    hasOlderBeyond: false,
  };
  const task: Task = {
    ...empty,
    generation,
    settled: false,
    promise: Promise.resolve(empty),
  };
  current = task;
  task.promise = run(task);
  return task.promise;
}

/** 編集画面を開いているあいだ、その日の前後の写真を先に取る。許可が無いときは何もしない。 */
export function beginEpisodePhotoPrefetch(dateKey: string) {
  void start(dateKey, DEFAULT_EPISODE_PHOTO_SPAN);
}

export function cancelEpisodePhotoPrefetch() {
  generationCounter += 1;
  current = null;
}

export function peekEpisodePhotoPrefetch(
  dateKey: string,
  span: EpisodePhotoSpan = DEFAULT_EPISODE_PHOTO_SPAN,
): EpisodePhotoPrefetch | null {
  const anchor = episodePhotoAnchor(dateKey);
  if (
    !current ||
    current.dateKey !== anchor.dateKey ||
    !sameSpan(current.span, span) ||
    !current.settled ||
    !current.granted
  ) {
    return null;
  }
  return snapshot(current);
}

export function claimEpisodePhotoPrefetch(
  dateKey: string,
  span: EpisodePhotoSpan = DEFAULT_EPISODE_PHOTO_SPAN,
): Promise<EpisodePhotoPrefetch> {
  return start(dateKey, span);
}
