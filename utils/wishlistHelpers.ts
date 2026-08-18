import type { WishlistItem, WishlistKind } from '../types';

export const UNSET_WISHLIST_LOCATION_LABEL = '場所未設定';
export const UNSET_WISHLIST_CUISINE_LABEL = '種類未設定';

export const DEFAULT_VISIT_PURPOSE_TAGS = [
  '観光',
  '散歩',
  '写真',
  '買い物',
  'イベント',
  '温泉',
  '自然',
];

export const DEFAULT_EAT_CUISINES = [
  '和食',
  '中華',
  'イタリアン',
  'フレンチ',
  '焼肉',
  'ラーメン',
  'カフェ',
  'その他',
];

export type WishlistOption = { label: string; value: string };

export function normalizeWishlistLabel(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function uniqueWishlistLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = normalizeWishlistLabel(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

export function mergeWishlistOptions(
  defaults: string[],
  used: string[]
): WishlistOption[] {
  return uniqueWishlistLabels([...defaults, ...used]).map((value) => ({
    label: value,
    value,
  }));
}

export type WishlistEatFolder = {
  key: string;
  label: string;
  items: WishlistItem[];
};

function groupWishlistEatBy(
  items: WishlistItem[],
  getKey: (item: WishlistItem) => string,
  unsetLabel: string
): WishlistEatFolder[] {
  const grouped = new Map<string, WishlistItem[]>();
  items.forEach((item) => {
    const key = normalizeWishlistLabel(getKey(item));
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  });

  const named = Array.from(grouped.entries())
    .filter(([key]) => key.length > 0)
    .sort(([a], [b]) => a.localeCompare(b, 'ja'));
  const unnamed = grouped.get('') ?? [];

  const toFolder = (key: string, folderItems: WishlistItem[]): WishlistEatFolder => ({
    key,
    label: key || unsetLabel,
    items: [...folderItems].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
  });

  const folders = named.map(([key, folderItems]) => toFolder(key, folderItems));
  if (unnamed.length > 0) {
    folders.push(toFolder('', unnamed));
  }
  return folders;
}

export function groupWishlistEatItems(items: WishlistItem[]): WishlistEatFolder[] {
  return groupWishlistEatBy(items, (item) => item.location ?? '', UNSET_WISHLIST_LOCATION_LABEL);
}

export function groupWishlistEatByCuisine(items: WishlistItem[]): WishlistEatFolder[] {
  return groupWishlistEatBy(items, (item) => item.cuisine ?? '', UNSET_WISHLIST_CUISINE_LABEL);
}

export function eatFolderPreviewLabels(
  folder: WishlistEatFolder,
  browse: 'area' | 'cuisine'
): string[] {
  const values = folder.items.map((item) =>
    browse === 'area' ? item.cuisine ?? '' : item.location ?? ''
  );
  return uniqueWishlistLabels(values).slice(0, 4);
}

export function matchesWishlistQuery(item: WishlistItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = [
    item.name,
    item.location ?? '',
    item.cuisine ?? '',
    item.memo ?? '',
    item.link ?? '',
    ...item.purposeTags,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function formatWishlistIndex(kind: WishlistKind, index: number): string {
  const prefix = kind === 'visit' ? 'V' : 'E';
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

/** 保存文字列をブラウザで開ける URL にする。スキームがなければ https を付ける */
export function toWishlistOpenUrl(link: string | null | undefined): string | null {
  const trimmed = (link ?? '').trim();
  if (!trimmed) {
    return null;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
