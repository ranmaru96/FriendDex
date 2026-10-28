import type { Href } from 'expo-router';
import { tabFromPathPrefix, type BottomNavTabKey } from '@/utils/bottomNavVisibility';
import { getEpisodeDetailHostTab } from '@/utils/episodeDetailHost';

export type DetailKind = 'person' | 'episode' | 'event' | 'task' | 'task-group';

const PREFIX: Record<BottomNavTabKey, string> = {
  home: '/people',
  calendar: '/calendar',
  episode: '/episode',
  tasks: '/tasks',
  tools: '/tools',
};

const DEFAULT_TAB: Record<DetailKind, BottomNavTabKey> = {
  person: 'home',
  episode: 'episode',
  event: 'calendar',
  task: 'tasks',
  'task-group': 'tasks',
};

const SEGMENT: Record<DetailKind, string> = {
  person: 'detail',
  episode: 'episode-detail',
  event: 'event-detail',
  task: 'task-detail',
  'task-group': 'task-group',
};

export function detailPathname(kind: DetailKind, tab: BottomNavTabKey | null): string {
  const resolved = kind === 'task-group' ? 'tasks' : (tab ?? DEFAULT_TAB[kind]);
  return `${PREFIX[resolved]}/${SEGMENT[kind]}`;
}

export function detailHref(
  kind: DetailKind,
  tab: BottomNavTabKey | null,
  params: Record<string, string>
): Href {
  return { pathname: detailPathname(kind, tab), params } as Href;
}

export function detailHrefFromPathname(
  kind: DetailKind,
  pathname: string,
  params: Record<string, string>
): Href {
  return detailHref(kind, tabFromPathPrefix(pathname), params);
}

/** 点灯中のタブ。無い、または使えないときは種類ごとの既定タブ。 */
export function detailHrefFromHost(kind: DetailKind, params: Record<string, string>): Href {
  return detailHref(kind, getEpisodeDetailHostTab(), params);
}
