import { Redirect, useLocalSearchParams } from 'expo-router';
import { detailHrefFromHost, type DetailKind } from '@/utils/detailPaths';

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return null;
}

/** 旧 URL を、クエリを保ったままタブ別の詳細へ送る。 */
export function LegacyDetailRedirect({ kind }: { kind: DetailKind }) {
  const params = useLocalSearchParams();
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('__')) {
      continue;
    }
    const text = firstString(value);
    if (text != null && text.length > 0) {
      next[key] = text;
    }
  }
  return <Redirect href={detailHrefFromHost(kind, next)} />;
}
