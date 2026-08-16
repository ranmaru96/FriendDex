import * as DocumentPicker from 'expo-document-picker';
import {
  cacheDirectory,
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { createBackupPayload, importBackupPayload, initializeDatabase } from './db';
import {
  FRIENDDEX_BACKUP_TABLE_NAMES,
  FRIENDDEX_BACKUP_V1_TABLE_NAMES,
  FRIENDDEX_BACKUP_V4_TABLE_NAMES,
  FRIENDDEX_BACKUP_V5_TABLE_NAMES,
  FriendDexBackup,
  FriendDexBackupTableName,
} from './types';

const AUTO_BACKUP_FILENAME = 'frienddex_auto_backup.json';

const isBackupRow = (value: unknown): value is Record<string, string | number | null> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.values(value).every(
    (entry) => typeof entry === 'string' || typeof entry === 'number' || entry === null
  );
};

const requiredTablesForVersion = (version: FriendDexBackup['version']): readonly string[] => {
  if (version === 6) {
    return FRIENDDEX_BACKUP_TABLE_NAMES;
  }
  if (version === 5) {
    return FRIENDDEX_BACKUP_V5_TABLE_NAMES;
  }
  if (version === 4 || version === 3) {
    return FRIENDDEX_BACKUP_V4_TABLE_NAMES;
  }
  if (version === 2) {
    return [...FRIENDDEX_BACKUP_V1_TABLE_NAMES, 'episode_photos'];
  }
  return FRIENDDEX_BACKUP_V1_TABLE_NAMES;
};

export const isFriendDexBackup = (value: unknown): value is FriendDexBackup => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<FriendDexBackup>;
  if (
    candidate.version !== 1 &&
    candidate.version !== 2 &&
    candidate.version !== 3 &&
    candidate.version !== 4 &&
    candidate.version !== 5 &&
    candidate.version !== 6
  ) {
    return false;
  }
  if (typeof candidate.exportedAt !== 'string') {
    return false;
  }
  if (!candidate.tables || typeof candidate.tables !== 'object') {
    return false;
  }
  const requiredTables = requiredTablesForVersion(candidate.version);
  return requiredTables.every((tableName) => {
    const rows = candidate.tables?.[tableName as FriendDexBackupTableName];
    return Array.isArray(rows) && rows.every(isBackupRow);
  });
};

const formatExportFilename = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `frienddex_backup_${year}${month}${day}.json`;
};

const serializeBackup = (payload: FriendDexBackup): string => JSON.stringify(payload, null, 2);

const writeJsonFile = async (directory: string | null, filename: string, contents: string): Promise<string> => {
  if (!directory) {
    throw new Error('ファイル保存先を取得できませんでした。');
  }
  const fileUri = `${directory}${filename}`;
  await writeAsStringAsync(fileUri, contents, { encoding: 'utf8' });
  return fileUri;
};

export const runAutoBackup = async (): Promise<void> => {
  try {
    initializeDatabase();
    const payload = createBackupPayload();
    await writeJsonFile(documentDirectory, AUTO_BACKUP_FILENAME, serializeBackup(payload));
  } catch {
    // 起動時の自動バックアップ失敗はアプリ利用を妨げない
  }
};

export const exportBackupAndShare = async (): Promise<void> => {
  initializeDatabase();
  const payload = createBackupPayload();
  const contents = serializeBackup(payload);
  const fileUri = await writeJsonFile(cacheDirectory, formatExportFilename(), contents);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('この端末では共有機能を利用できません。');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'FriendDex バックアップを保存',
  });
};

export const importBackupFromPicker = async (): Promise<void> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    return;
  }

  const contents = await readAsStringAsync(result.assets[0].uri, { encoding: 'utf8' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('JSONファイルの形式が正しくありません。');
  }

  if (!isFriendDexBackup(parsed)) {
    throw new Error('FriendDex のバックアップファイルではありません。');
  }

  initializeDatabase();
  importBackupPayload(parsed);
};

export const confirmAndImportBackup = (): void => {
  Alert.alert(
    'バックアップから復元',
    '現在のデータは上書きされます。よろしいですか？',
    [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '復元する',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await importBackupFromPicker();
              Alert.alert('復元完了', 'バックアップからデータを復元しました。');
            } catch (error) {
              const message = error instanceof Error ? error.message : '復元に失敗しました。';
              Alert.alert('復元失敗', message);
            }
          })();
        },
      },
    ]
  );
};

export const confirmAndExportBackup = (): void => {
  void (async () => {
    try {
      await exportBackupAndShare();
      Alert.alert('書き出し完了', 'バックアップファイルを共有できます。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '書き出しに失敗しました。';
      Alert.alert('書き出し失敗', message);
    }
  })();
};
