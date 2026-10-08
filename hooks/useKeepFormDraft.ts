import { useCallback, useEffect, useRef } from 'react';
import { deleteFormDraft, writeFormDraftRecord } from '@/utils/formDraftStore';

const DEBOUNCE_MS = 300;

/**
 * 入力が保存済みの内容と違うあいだだけ下書きを残す。
 * この画面で一度も書いていない下書きは、開いただけでは消さない。
 */
export function useKeepFormDraft(
  active: boolean,
  storageKey: string | null,
  snapshot: string,
  baseline: string | null
) {
  const snapshotRef = useRef(snapshot);
  const keyRef = useRef(storageKey);
  const baselineRef = useRef(baseline);
  const skipRef = useRef(false);
  const ownsRef = useRef(false);
  snapshotRef.current = snapshot;
  keyRef.current = storageKey;
  baselineRef.current = baseline;

  const persist = useCallback((key: string, base: string, current: string) => {
    if (current === base) {
      if (ownsRef.current) {
        deleteFormDraft(key);
        ownsRef.current = false;
      }
      return;
    }
    writeFormDraftRecord(key, { base, fields: current });
    ownsRef.current = true;
  }, []);

  useEffect(() => {
    if (!active || !storageKey || baseline == null || skipRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      if (skipRef.current) {
        return;
      }
      persist(storageKey, baseline, snapshot);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, baseline, persist, snapshot, storageKey]);

  useEffect(() => {
    return () => {
      if (skipRef.current) {
        return;
      }
      const key = keyRef.current;
      const base = baselineRef.current;
      if (!key || base == null) {
        return;
      }
      persist(key, base, snapshotRef.current);
    };
  }, [persist]);

  const claim = useCallback(() => {
    ownsRef.current = true;
  }, []);

  const stopKeeping = useCallback(() => {
    skipRef.current = true;
  }, []);

  const flush = useCallback(() => {
    if (skipRef.current) {
      return;
    }
    const key = keyRef.current;
    const base = baselineRef.current;
    if (!key || base == null) {
      return;
    }
    persist(key, base, snapshotRef.current);
  }, [persist]);

  return { claim, stopKeeping, flush };
}
