import { Dimensions, PixelRatio } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import { preparePhotoThumbnails } from '@/modules/photo-thumbnails/src';
import { formatDateKey, parseDateKey } from '@/utils/eventHelpers';

const FIRST_PAGE_SIZE = 80;

export type EpisodePhotoAnchor = {
  dateKey: string;
  /** この時刻より前の写真が、開いた画面の先頭側に来る。 */
  beforeMs: number;
  isToday: boolean;
};

export type EpisodePhotoPrefetch = {
  dateKey: string;
  beforeMs: number;
  isToday: boolean;
  granted: boolean;
  assets: MediaLibrary.Asset[];
  endCursor?: string;
  hasNextPage: boolean;
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
  const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return { dateKey: dayKey, beforeMs: nextDay.getTime(), isToday };
}

function thumbPixelSize(): number {
  const width = Dimensions.get('window').width;
  return Math.max(1, Math.round(Math.floor(width / 4) * PixelRatio.get()));
}

function snapshot(task: Task): EpisodePhotoPrefetch {
  return {
    dateKey: task.dateKey,
    beforeMs: task.beforeMs,
    isToday: task.isToday,
    granted: task.granted,
    assets: task.assets,
    endCursor: task.endCursor,
    hasNextPage: task.hasNextPage,
  };
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
  try {
    const page = await MediaLibrary.getAssetsAsync({
      first: FIRST_PAGE_SIZE,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [MediaLibrary.SortBy.creationTime],
      createdBefore: task.beforeMs,
    });
    if (current !== task) {
      return snapshot(task);
    }
    task.assets = page.assets;
    task.endCursor = page.endCursor;
    task.hasNextPage = page.hasNextPage;
    preparePhotoThumbnails(
      page.assets.map((asset) => asset.id),
      thumbPixelSize()
    );
  } catch {
    if (current === task) {
      task.assets = [];
      task.hasNextPage = false;
    }
  }
  if (current === task) {
    task.settled = true;
  }
  return snapshot(task);
}

function start(dateKey: string): Promise<EpisodePhotoPrefetch> {
  const anchor = episodePhotoAnchor(dateKey);
  if (
    current?.dateKey === anchor.dateKey &&
    current.generation === generationCounter &&
    (!current.settled || current.granted)
  ) {
    return current.promise;
  }
  const generation = ++generationCounter;
  const task: Task = {
    generation,
    dateKey: anchor.dateKey,
    beforeMs: anchor.beforeMs,
    isToday: anchor.isToday,
    granted: false,
    settled: false,
    assets: [],
    hasNextPage: true,
    promise: Promise.resolve({
      dateKey: anchor.dateKey,
      beforeMs: anchor.beforeMs,
      isToday: anchor.isToday,
      granted: false,
      assets: [],
      hasNextPage: false,
    }),
  };
  current = task;
  task.promise = run(task);
  return task.promise;
}

/** 編集画面を開いているあいだ、その日の写真の先頭ページを先に取る。許可が無いときは何もしない。 */
export function beginEpisodePhotoPrefetch(dateKey: string) {
  void start(dateKey);
}

export function cancelEpisodePhotoPrefetch() {
  generationCounter += 1;
  current = null;
}

export function peekEpisodePhotoPrefetch(dateKey: string): EpisodePhotoPrefetch | null {
  const anchor = episodePhotoAnchor(dateKey);
  if (!current || current.dateKey !== anchor.dateKey || !current.settled || !current.granted) {
    return null;
  }
  return snapshot(current);
}

export function claimEpisodePhotoPrefetch(dateKey: string): Promise<EpisodePhotoPrefetch> {
  return start(dateKey);
}
