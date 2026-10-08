import { deleteAppSetting, getAppSetting, initializeDatabase, setAppSetting } from '@/db';

const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type Envelope = {
  savedAt: number;
  body: string;
};

export type FormDraftRecord = {
  /** 下書きを取り始めた時点の保存済み内容。編集中に本体が変わっていたら使わない。 */
  base: string;
  /** 現在の入力。 */
  fields: string;
};

export function writeFormDraftRecord(key: string, record: FormDraftRecord): void {
  initializeDatabase();
  const envelope: Envelope = {
    savedAt: Date.now(),
    body: JSON.stringify(record),
  };
  setAppSetting(key, JSON.stringify(envelope));
}

export function readFormDraftRecord(key: string): FormDraftRecord | null {
  initializeDatabase();
  const raw = getAppSetting(key);
  if (!raw) {
    return null;
  }
  try {
    const envelope = JSON.parse(raw) as Partial<Envelope>;
    if (typeof envelope.savedAt !== 'number' || typeof envelope.body !== 'string') {
      deleteAppSetting(key);
      return null;
    }
    if (Date.now() - envelope.savedAt > DRAFT_TTL_MS) {
      deleteAppSetting(key);
      return null;
    }
    const record = JSON.parse(envelope.body) as Partial<FormDraftRecord>;
    if (typeof record.base !== 'string' || typeof record.fields !== 'string') {
      deleteAppSetting(key);
      return null;
    }
    return { base: record.base, fields: record.fields };
  } catch {
    deleteAppSetting(key);
    return null;
  }
}

export function deleteFormDraft(key: string): void {
  initializeDatabase();
  deleteAppSetting(key);
}
