import {
  getAppSetting,
  initializeDatabase,
  PENDING_OWNED_DELETES_KEY,
  setAppSetting,
} from '@/db';

export type PendingOwnedDeleteKind = 'event' | 'episode';

type PendingOwnedDeletes = {
  events: string[];
  episodes: string[];
};

const emptyPending = (): PendingOwnedDeletes => ({ events: [], episodes: [] });

const uniqueIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

const parsePending = (raw: string | null): PendingOwnedDeletes => {
  if (!raw) {
    return emptyPending();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PendingOwnedDeletes>;
    return {
      events: uniqueIds(Array.isArray(parsed.events) ? parsed.events : []),
      episodes: uniqueIds(Array.isArray(parsed.episodes) ? parsed.episodes : []),
    };
  } catch {
    return emptyPending();
  }
};

export const loadPendingOwnedDeletes = (): PendingOwnedDeletes => {
  initializeDatabase();
  return parsePending(getAppSetting(PENDING_OWNED_DELETES_KEY));
};

const savePendingOwnedDeletes = (next: PendingOwnedDeletes): void => {
  initializeDatabase();
  setAppSetting(
    PENDING_OWNED_DELETES_KEY,
    JSON.stringify({
      events: uniqueIds(next.events),
      episodes: uniqueIds(next.episodes),
    })
  );
};

const keyForKind = (kind: PendingOwnedDeleteKind): 'events' | 'episodes' =>
  kind === 'event' ? 'events' : 'episodes';

export const enqueuePendingOwnedDelete = (kind: PendingOwnedDeleteKind, id: string): void => {
  const trimmed = id.trim();
  if (!trimmed) {
    return;
  }
  const pending = loadPendingOwnedDeletes();
  const key = keyForKind(kind);
  pending[key] = uniqueIds([...pending[key], trimmed]);
  savePendingOwnedDeletes(pending);
};

export const dequeuePendingOwnedDelete = (kind: PendingOwnedDeleteKind, id: string): void => {
  const trimmed = id.trim();
  if (!trimmed) {
    return;
  }
  const pending = loadPendingOwnedDeletes();
  const key = keyForKind(kind);
  pending[key] = pending[key].filter((item) => item !== trimmed);
  savePendingOwnedDeletes(pending);
};
