import { useCallback, useEffect, useRef, useState } from 'react';
import { getAppSetting, initializeDatabase, setAppSetting } from '@/db';

export const FILTER_KEYS = {
  home: 'filter.home',
  episodeList: 'filter.episode_list',
  detailEpisodeInactive: 'filter.detail_episode.__inactive',
  detailEpisode: (friendId: string) => `filter.detail_episode.${friendId}`,
} as const;

export type UsePersistedFilterOptions<T> = {
  debounceMs?: number;
  validate?: (value: unknown) => value is T;
};

function readPersistedValue<T>(
  key: string,
  defaultValue: T,
  validate?: (value: unknown) => value is T
): T {
  initializeDatabase();
  const stored = getAppSetting(key);
  if (stored == null) {
    return defaultValue;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (validate && !validate(parsed)) {
      return defaultValue;
    }
    return parsed as T;
  } catch {
    return defaultValue;
  }
}

export function usePersistedFilter<T>(
  key: string,
  defaultValue: T,
  options?: UsePersistedFilterOptions<T>
): readonly [T, (value: T | ((prev: T) => T)) => void] {
  const debounceMs = options?.debounceMs ?? 300;
  const validate = options?.validate;

  const [value, setValueState] = useState<T>(() => readPersistedValue(key, defaultValue, validate));

  const persist = useCallback(
    (next: T) => {
      initializeDatabase();
      setAppSetting(key, JSON.stringify(next));
    },
    [key]
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextPersistRef = useRef(true);
  const prevKeyRef = useRef(key);
  const validateRef = useRef(options?.validate);
  validateRef.current = options?.validate;

  useEffect(() => {
    if (prevKeyRef.current === key) {
      return;
    }
    prevKeyRef.current = key;
    skipNextPersistRef.current = true;
    setValueState(readPersistedValue(key, defaultValue, validateRef.current));
  }, [key, defaultValue]);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      persist(value);
    }, debounceMs);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, debounceMs, persist]);

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    setValueState((prev) => (typeof next === 'function' ? (next as (prev: T) => T)(prev) : next));
  }, []);

  return [value, setValue] as const;
}
