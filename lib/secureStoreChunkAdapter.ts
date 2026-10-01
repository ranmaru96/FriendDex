import { requireOptionalNativeModule } from 'expo';
import {
  deleteAppSetting,
  getAppSetting,
  initializeDatabase,
  setAppSetting,
} from '@/db';

const CHUNK_SIZE = 1800;
const CHUNK_HEADER_PREFIX = 'fdc:';

const loadSecureStore = (): typeof import('expo-secure-store') | null => {
  try {
    if (!requireOptionalNativeModule('ExpoSecureStore')) {
      return null;
    }
    return require('expo-secure-store') as typeof import('expo-secure-store');
  } catch {
    return null;
  }
};

const settingKey = (key: string): string => `supabase.auth:${key}`;

const parseChunkCount = (header: string): number | null => {
  const raw = header.startsWith(CHUNK_HEADER_PREFIX)
    ? header.slice(CHUNK_HEADER_PREFIX.length)
    : /^\d+$/.test(header)
      ? header
      : null;
  if (raw == null) {
    return null;
  }
  const count = Number(raw);
  if (!Number.isFinite(count) || count < 1 || count > 50) {
    return null;
  }
  return Math.floor(count);
};

const readFromSecureStore = async (key: string): Promise<string | null> => {
  const secureStore = loadSecureStore();
  if (!secureStore) {
    return null;
  }
  try {
    const header = await secureStore.getItemAsync(key);
    if (!header) {
      return null;
    }
    const chunkCount = parseChunkCount(header);
    if (chunkCount == null) {
      return header;
    }
    const parts: string[] = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const part = await secureStore.getItemAsync(`${key}.${index}`);
      if (part == null) {
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  } catch {
    return null;
  }
};

const writeToSecureStore = async (key: string, value: string): Promise<void> => {
  const secureStore = loadSecureStore();
  if (!secureStore) {
    return;
  }
  try {
    const previousHeader = await secureStore.getItemAsync(key);
    const previousCount = previousHeader ? parseChunkCount(previousHeader) : null;
    const chunkCount = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    await secureStore.setItemAsync(key, `${CHUNK_HEADER_PREFIX}${chunkCount}`);
    for (let index = 0; index < chunkCount; index += 1) {
      const slice = value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      await secureStore.setItemAsync(`${key}.${index}`, slice);
    }
    if (previousCount != null && previousCount > chunkCount) {
      for (let index = chunkCount; index < previousCount; index += 1) {
        await secureStore.deleteItemAsync(`${key}.${index}`);
      }
    }
  } catch {
    // SQLite 側に本体があるので SecureStore 失敗は無視する
  }
};

const deleteFromSecureStore = async (key: string): Promise<void> => {
  const secureStore = loadSecureStore();
  if (!secureStore) {
    return;
  }
  try {
    const header = await secureStore.getItemAsync(key);
    const chunkCount = header ? parseChunkCount(header) : null;
    if (chunkCount != null) {
      for (let index = 0; index < chunkCount; index += 1) {
        await secureStore.deleteItemAsync(`${key}.${index}`);
      }
    }
    await secureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
};

/** SQLite を本体にし、SecureStore は補助。設定画面を離れてもセッションを残す */
export function createSupabaseAuthStorage() {
  return {
    getItem: async (key: string): Promise<string | null> => {
      initializeDatabase();
      const fromDb = getAppSetting(settingKey(key));
      if (fromDb) {
        return fromDb;
      }
      const fromSecure = await readFromSecureStore(key);
      if (fromSecure) {
        setAppSetting(settingKey(key), fromSecure);
      }
      return fromSecure;
    },
    setItem: async (key: string, value: string): Promise<void> => {
      initializeDatabase();
      setAppSetting(settingKey(key), value);
      await writeToSecureStore(key, value);
    },
    removeItem: async (key: string): Promise<void> => {
      initializeDatabase();
      deleteAppSetting(settingKey(key));
      await deleteFromSecureStore(key);
    },
  };
}
