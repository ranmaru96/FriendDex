import * as Linking from 'expo-linking';

const WIDGET_PARAM = 'widget';
const WIDGET_VALUE = '1';

/** 今日の予定ウィジェットの URL。素の `scheme:///` とクエリで区別する。 */
export function widgetRootUrl(): string {
  return Linking.createURL('/', { queryParams: { [WIDGET_PARAM]: WIDGET_VALUE } });
}

function parsedUrl(path: string): URL | null {
  try {
    return new URL(path);
  } catch {
    return null;
  }
}

function isBareRoot(path: string): boolean {
  const trimmed = path.trim();
  if (trimmed === '' || trimmed === '/') {
    return true;
  }
  const url = parsedUrl(trimmed);
  if (!url) {
    return false;
  }
  const pathname = url.pathname || '/';
  return pathname === '/' && url.search === '' && url.hash === '';
}

function isWidgetRoot(path: string): boolean {
  const url = parsedUrl(path.trim());
  if (!url) {
    return false;
  }
  const pathname = url.pathname || '/';
  return pathname === '/' && url.searchParams.get(WIDGET_PARAM) === WIDGET_VALUE;
}

/**
 * プロセスが無いときの起動だけ、ウィジェットの URL をカレンダーにする。
 * すでに起動しているときのウィジェット URL と、素の `scheme:///` は画面を動かさない。
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  if (isWidgetRoot(path)) {
    return initial ? '/' : null;
  }
  if (!initial && isBareRoot(path)) {
    return null;
  }
  return path;
}
