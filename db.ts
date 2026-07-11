import 'react-native-get-random-values';
import * as SQLite from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';
import {
  CommonItemKind,
  CommonItemOption,
  Episode,
  EpisodeParticipant,
  EpisodePhoto,
  EpisodeVisibilityEntry,
  EpisodeVisibilityMode,
  Event,
  EventInput,
  EventParticipant,
  FRIENDDEX_BACKUP_TABLE_NAMES,
  Friend,
  FriendDexBackup,
  FriendDexBackupRow,
  FriendDexBackupTableName,
  FriendInput,
  FriendSearchFilters,
  ImportSource,
  CreateMoneyLoansInput,
  CreateMoneyLoanLineInput,
  MoneyLoan,
  MoneyLoanCounterpartyKind,
  MoneyLoanDirection,
  MoneyLoanSession,
  ShufflePool,
  PendingReviewEpisodeRef,
  Profile,
  Saying,
} from './types';
import { normalizeEpisodeTag } from './utils/episodeHelpers';
import { buildDefaultShufflePoolLabel, buildShuffleMemberSetKey, normalizeShuffleMemberIds } from './utils/shuffleHelpers';
import { mergeFriendInputWithPublicFields } from './utils/qrScanHelpers';

/** 移行用: 旧 friends テーブル行（DROP 後は未使用） */
type FriendRow = {
  id: string;
  name: string;
  nickname: string;
  origin: string;
  residence: string;
  mbti: Friend['mbti'];
  birthday: string;
  height: number | null;
  weight: number | null;
  category: string;
  description: string;
  photoUri: string | null;
  affiliations: string;
  personalities: string;
  experiences: string;
  traits: string;
  likes: string;
  dislikes: string;
  episodes: string;
  sayings: string;
  createdAt: string;
  updatedAt: string;
};

type ProfileRow = {
  id: string;
  friendId: string;
  name: string;
  authorUserId: string | null;
  source: Profile['source'];
  isDefault: number;
  nickname: string;
  origin: string;
  residence: string;
  mbti: Friend['mbti'];
  birthday: string;
  height: number | null;
  weight: number | null;
  category: string;
  description: string;
  photoUri: string | null;
  affiliations: string;
  personalities: string;
  experiences: string;
  traits: string;
  likes: string;
  dislikes: string;
  episodes: string;
  sayings: string;
  createdAt: string;
  userId?: string | null;
  publicFields?: string | null;
  importSource?: string | null;
  scannedUserId?: string | null;
  scannedAt?: string | null;
  updatedAt: string;
};

type CommonItemOptionRow = {
  id: string;
  kind: CommonItemKind;
  label: string;
  members: string;
  createdAt: string;
  updatedAt: string;
};

type EpisodePhotoRow = {
  id: number;
  episode_id: string;
  photo_uri: string;
  sort_order: number;
  created_at: string;
};

type EventRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: number;
  memo: string | null;
  notify_at: string | null;
  notify_enabled: number;
  notification_id: string | null;
  auto_episode_created: number;
  episode_tag: string | null;
  created_at: string;
  updated_at: string;
};

type EventParticipantRow = {
  event_id: string;
  profile_id: string;
  created_at: string;
};

type MoneyLoanSessionRow = {
  id: string;
  title: string;
  created_at: string;
};

type MoneyLoanRow = {
  id: string;
  session_id: string;
  group_id: string;
  counterparty_kind: MoneyLoanCounterpartyKind;
  counterparty_value: string;
  amount: number;
  direction: MoneyLoanDirection;
  memo: string;
  is_repaid: number;
  created_at: string;
};

type ShufflePoolRow = {
  id: string;
  label: string;
  label_is_custom: number;
  member_ids: string;
  member_set_key: string;
  created_at: string;
  last_used_at: string;
};

const LEGACY_MONEY_LOAN_SESSION_ID = 'frienddex-legacy-money-loan-session';

const DB_NAME = 'frienddex.db';
const FRIENDS_TABLE = 'friends';
const SETTINGS_TABLE = 'app_settings';
const PROFILES_TABLE = 'friend_profiles';
const COMMON_ITEM_OPTIONS_TABLE = 'common_item_options';
export const EPISODE_PHOTOS_TABLE = 'episode_photos';
const EVENTS_TABLE = 'events';
const EVENT_PARTICIPANTS_TABLE = 'event_participants';
const MONEY_LOAN_SESSIONS_TABLE = 'money_loan_sessions';
const MONEY_LOANS_TABLE = 'money_loans';
const SHUFFLE_POOLS_TABLE = 'shuffle_pools';
const MYSELF_KEY = 'myself_friend_id';

const db = SQLite.openDatabaseSync(DB_NAME);

const toJson = (value: string[]) => JSON.stringify(value ?? []);
const toEpisodeJson = (value: Episode[]) => JSON.stringify(value ?? []);
const toSayingJson = (value: Saying[]) => JSON.stringify(value ?? []);

const fromJson = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const sanitizeSaying = (value: unknown): Saying | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<Saying>;
  if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string' || typeof candidate.date !== 'string') {
    return null;
  }
  return { id: candidate.id, text: candidate.text, date: candidate.date };
};

const fromSayingJson = (value: string): Saying[] => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => sanitizeSaying(item)).filter((item): item is Saying => item !== null);
  } catch {
    return [];
  }
};

const sanitizeParticipantEntry = (value: unknown): EpisodeParticipant | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const participant = value as Partial<EpisodeParticipant>;
  if (
    (participant.kind !== 'individual' && participant.kind !== 'group') ||
    typeof participant.value !== 'string'
  ) {
    return null;
  }
  const normalized = participant.value.trim();
  if (!normalized) {
    return null;
  }
  return { kind: participant.kind, value: normalized };
};

const isEpisodeParticipant = (value: unknown): value is EpisodeParticipant =>
  sanitizeParticipantEntry(value) !== null;

const isEpisodeVisibilityEntry = (value: unknown): value is EpisodeVisibilityEntry => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as Partial<EpisodeVisibilityEntry>;
  return (
    (entry.kind === 'individual' || entry.kind === 'group') &&
    typeof entry.value === 'string'
  );
};

const uniqueVisibilityEntries = (entries: EpisodeVisibilityEntry[]): EpisodeVisibilityEntry[] => {
  const seen = new Set<string>();
  const normalized: EpisodeVisibilityEntry[] = [];
  entries.forEach((entry) => {
    const v = entry.value.trim();
    if (!v) return;
    const key = `${entry.kind}:${v}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push({ kind: entry.kind, value: v });
    }
  });
  return normalized;
};

const sanitizeVisibilityMode = (value: unknown): EpisodeVisibilityMode =>
  ['public', 'limited', 'private'].includes(value as string) ? (value as EpisodeVisibilityMode) : 'private';

const sanitizeEpisode = (value: unknown): Episode | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<Episode> & {
    mainParticipants?: string[];
    subParticipants?: string[];
  };
  const visibilityEntries = Array.isArray(raw.visibilityEntries)
    ? raw.visibilityEntries.filter(isEpisodeVisibilityEntry)
    : [];
  if (
    typeof raw.id !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.date !== 'string' ||
    typeof raw.description !== 'string'
  ) {
    return null;
  }

  const entryMap = new Map<string, EpisodeParticipant>();
  const addEntry = (entry: EpisodeParticipant | null) => {
    if (!entry) {
      return;
    }
    entryMap.set(`${entry.kind}:${entry.value}`, entry);
  };

  if (Array.isArray(raw.participantEntries)) {
    raw.participantEntries.forEach((item) => addEntry(sanitizeParticipantEntry(item)));
  }

  const legacyMain = Array.isArray(raw.mainParticipants)
    ? Array.from(new Set(raw.mainParticipants.map((id) => id.trim()).filter((id) => id.length > 0)))
    : [];
  const legacySub = Array.isArray(raw.subParticipants)
    ? Array.from(
        new Set(raw.subParticipants.map((id) => id.trim()).filter((id) => id.length > 0 && !legacyMain.includes(id)))
      )
    : [];
  [...legacyMain, ...legacySub].forEach((id) => addEntry({ kind: 'individual', value: id }));

  const rawEventId =
    typeof raw.eventId === 'string'
      ? raw.eventId.trim()
      : typeof (raw as { event_id?: string }).event_id === 'string'
        ? (raw as { event_id: string }).event_id.trim()
        : '';
  const eventId = rawEventId.length > 0 ? rawEventId : null;
  const tag = normalizeEpisodeTag(raw.tag);

  return {
    id: raw.id,
    title: raw.title,
    date: raw.date,
    description: raw.description,
    authorFriendId: typeof raw.authorFriendId === 'string' ? raw.authorFriendId : '',
    visibilityMode: sanitizeVisibilityMode(raw.visibilityMode),
    participantEntries: Array.from(entryMap.values()),
    visibilityEntries: uniqueVisibilityEntries(visibilityEntries),
    ...(eventId ? { eventId } : {}),
    ...(tag ? { tag } : {}),
    isAutoGenerated: raw.isAutoGenerated === true,
    pendingReview: raw.pendingReview === true,
  };
};

const fromEpisodeJson = (value: string): Episode[] => {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => sanitizeEpisode(item))
      .filter((item): item is Episode => item !== null);
  } catch {
    return [];
  }
};

const backfillEpisodeAuthorFriendIds = (myselfId: string): void => {
  const rows = db.getAllSync<{ id: string; friendId: string; episodes: string }>(
    `SELECT id, friendId, episodes FROM ${PROFILES_TABLE} WHERE isDefault = 1;`
  );
  const timestamp = nowIso();

  db.execSync('BEGIN IMMEDIATE;');
  try {
    rows.forEach((row) => {
      const episodes = fromEpisodeJson(row.episodes);
      let changed = false;
      const nextEpisodes = episodes.map((episode) => {
        const author = episode.authorFriendId.trim();
        if (author === myselfId) {
          return episode;
        }
        if (author === '' || author === row.friendId) {
          changed = true;
          return { ...episode, authorFriendId: myselfId };
        }
        return episode;
      });
      if (!changed) {
        return;
      }
      db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
        toEpisodeJson(nextEpisodes),
        timestamp,
        row.id,
      ]);
    });
    db.execSync('COMMIT;');
  } catch {
    db.execSync('ROLLBACK;');
    throw new Error('FriendDex: authorFriendId バックフィルに失敗しました');
  }
};

const rowToProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  friendId: row.friendId,
  name: row.name,
  authorUserId: row.authorUserId,
  source: row.source,
  isDefault: row.isDefault === 1,
  nickname: row.nickname,
  origin: row.origin,
  residence: row.residence ?? '',
  mbti: row.mbti,
  birthday: row.birthday,
  height: row.height,
  weight: row.weight,
  category: row.category,
  description: row.description,
  photoUri: row.photoUri,
  affiliations: fromJson(row.affiliations),
  personalities: fromJson(row.personalities),
  experiences: fromJson(row.experiences),
  traits: fromJson(row.traits),
  likes: fromJson(row.likes),
  dislikes: fromJson(row.dislikes),
  episodes: fromEpisodeJson(row.episodes),
  sayings: fromSayingJson(row.sayings),
  createdAt: row.createdAt,
  userId: row.userId ?? '',
  publicFields: row.publicFields != null ? fromJson(row.publicFields) : [],
  importSource: (row.importSource === 'qr_scan' ? 'qr_scan' : 'manual') as ImportSource,
  scannedUserId: row.scannedUserId ?? '',
  scannedAt: row.scannedAt ?? '',
  updatedAt: row.updatedAt,
});

const rowToCommonItemOption = (row: CommonItemOptionRow): CommonItemOption => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  members: fromJson(row.members ?? '[]'),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const rowToEpisodePhoto = (row: EpisodePhotoRow): EpisodePhoto => ({
  id: row.id,
  episodeId: row.episode_id,
  photoUri: row.photo_uri,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
});

const rowToEvent = (row: EventRow): Event => ({
  id: row.id,
  title: row.title,
  startAt: row.start_at,
  endAt: row.end_at,
  allDay: row.all_day === 1,
  memo: row.memo,
  notifyAt: row.notify_at,
  notifyEnabled: row.notify_enabled === 1,
  notificationId: row.notification_id,
  autoEpisodeCreated: row.auto_episode_created === 1,
  episodeTag: normalizeEpisodeTag(row.episode_tag),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToEventParticipant = (row: EventParticipantRow): EventParticipant => ({
  eventId: row.event_id,
  profileId: row.profile_id,
  createdAt: row.created_at,
});

const normalizeCommonLabel = (value: string): string => value.trim();

const applyDefaultProfileToFriend = (friend: Friend, profile: Profile | null): Friend => {
  if (!profile) {
    return friend;
  }
  if (profile.friendId !== friend.id) {
    return friend;
  }
  return {
    ...friend,
    name: profile.name,
    nickname: profile.nickname,
    origin: profile.origin,
    residence: profile.residence,
    mbti: profile.mbti,
    birthday: profile.birthday,
    height: profile.height,
    weight: profile.weight,
    category: profile.category,
    description: profile.description,
    photoUri: profile.photoUri,
    affiliations: profile.affiliations,
    personalities: profile.personalities,
    experiences: profile.experiences,
    traits: profile.traits,
    likes: profile.likes,
    dislikes: profile.dislikes,
    episodes: profile.episodes,
    sayings: profile.sayings,
    activeProfileId: profile.id,
  };
};

const nowIso = () => new Date().toISOString();

const legacyFriendsTableExists = (): boolean =>
  db.getFirstSync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;`,
    [FRIENDS_TABLE]
  ) != null;

const defaultProfileRowToFriend = (row: ProfileRow): Friend => ({
  id: row.friendId,
  name: row.name,
  nickname: row.nickname,
  origin: row.origin,
  residence: row.residence ?? '',
  mbti: row.mbti,
  birthday: row.birthday,
  height: row.height,
  weight: row.weight,
  category: row.category,
  description: row.description,
  photoUri: row.photoUri,
  affiliations: fromJson(row.affiliations),
  personalities: fromJson(row.personalities),
  experiences: fromJson(row.experiences),
  traits: fromJson(row.traits),
  likes: fromJson(row.likes),
  dislikes: fromJson(row.dislikes),
  episodes: fromEpisodeJson(row.episodes),
  sayings: fromSayingJson(row.sayings),
  importSource: (row.importSource === 'qr_scan' ? 'qr_scan' : 'manual') as ImportSource,
  scannedUserId: row.scannedUserId ?? '',
  scannedAt: row.scannedAt ?? '',
});

export const initializeDatabase = (): void => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${PROFILES_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      friendId TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      authorUserId TEXT,
      source TEXT NOT NULL DEFAULT 'self',
      isDefault INTEGER NOT NULL DEFAULT 0,
      nickname TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT '',
      residence TEXT NOT NULL DEFAULT '',
      mbti TEXT NOT NULL,
      birthday TEXT NOT NULL,
      height REAL,
      weight REAL,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      photoUri TEXT,
      affiliations TEXT NOT NULL DEFAULT '[]',
      personalities TEXT NOT NULL DEFAULT '[]',
      experiences TEXT NOT NULL DEFAULT '[]',
      traits TEXT NOT NULL DEFAULT '[]',
      likes TEXT NOT NULL DEFAULT '[]',
      dislikes TEXT NOT NULL DEFAULT '[]',
      episodes TEXT NOT NULL DEFAULT '[]',
      sayings TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_${PROFILES_TABLE}_friendId ON ${PROFILES_TABLE}(friendId);`);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${COMMON_ITEM_OPTIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      members TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(kind, label)
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${COMMON_ITEM_OPTIONS_TABLE}_kind ON ${COMMON_ITEM_OPTIONS_TABLE}(kind, label);`
  );
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${EPISODE_PHOTOS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id TEXT NOT NULL,
      photo_uri TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      all_day INTEGER NOT NULL DEFAULT 0,
      memo TEXT,
      notify_at TEXT,
      notify_enabled INTEGER NOT NULL DEFAULT 1,
      notification_id TEXT,
      auto_episode_created INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_start_at ON ${EVENTS_TABLE}(start_at);`);

  const eventTableInfo = db.getAllSync<{ name: string }>(`PRAGMA table_info(${EVENTS_TABLE});`);
  const eventColumns = new Set(eventTableInfo.map((column) => column.name));
  const eventAdditiveMigrations: { column: string; sql: string }[] = [
    {
      column: 'notify_enabled',
      sql: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 1;`,
    },
    {
      column: 'notification_id',
      sql: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN notification_id TEXT;`,
    },
    {
      column: 'auto_episode_created',
      sql: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN auto_episode_created INTEGER NOT NULL DEFAULT 0;`,
    },
    {
      column: 'episode_tag',
      sql: `ALTER TABLE ${EVENTS_TABLE} ADD COLUMN episode_tag TEXT;`,
    },
  ];
  db.execSync('BEGIN IMMEDIATE;');
  try {
    for (const { column, sql } of eventAdditiveMigrations) {
      if (!eventColumns.has(column)) {
        db.execSync(sql);
      }
    }
    db.execSync('COMMIT;');
  } catch {
    db.execSync('ROLLBACK;');
    throw new Error('FriendDex: events スキーマ移行に失敗しました');
  }

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${EVENT_PARTICIPANTS_TABLE} (
      event_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (event_id, profile_id)
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${EVENT_PARTICIPANTS_TABLE}_profile_id ON ${EVENT_PARTICIPANTS_TABLE}(profile_id);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${MONEY_LOAN_SESSIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${MONEY_LOAN_SESSIONS_TABLE}_created_at ON ${MONEY_LOAN_SESSIONS_TABLE}(created_at);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${MONEY_LOANS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL DEFAULT '',
      group_id TEXT NOT NULL,
      counterparty_kind TEXT NOT NULL,
      counterparty_value TEXT NOT NULL,
      amount INTEGER NOT NULL,
      direction TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      is_repaid INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${MONEY_LOANS_TABLE}_created_at ON ${MONEY_LOANS_TABLE}(created_at);`
  );
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${MONEY_LOANS_TABLE}_group_id ON ${MONEY_LOANS_TABLE}(group_id);`
  );

  const moneyLoanTableInfo = db.getAllSync<{ name: string }>(`PRAGMA table_info(${MONEY_LOANS_TABLE});`);
  const moneyLoanColumns = new Set(moneyLoanTableInfo.map((column) => column.name));
  if (!moneyLoanColumns.has('session_id')) {
    db.execSync(`ALTER TABLE ${MONEY_LOANS_TABLE} ADD COLUMN session_id TEXT NOT NULL DEFAULT '';`);
  }

  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${MONEY_LOANS_TABLE}_session_id ON ${MONEY_LOANS_TABLE}(session_id);`
  );

  const orphanLoanCount =
    db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${MONEY_LOANS_TABLE} WHERE session_id IS NULL OR session_id = '';`
    )?.count ?? 0;
  if (orphanLoanCount > 0) {
    const legacySession = db.getFirstSync<MoneyLoanSessionRow>(
      `SELECT * FROM ${MONEY_LOAN_SESSIONS_TABLE} WHERE id = ?;`,
      [LEGACY_MONEY_LOAN_SESSION_ID]
    );
    if (!legacySession) {
      db.runSync(
        `INSERT INTO ${MONEY_LOAN_SESSIONS_TABLE} (id, title, created_at) VALUES (?, ?, ?);`,
        [LEGACY_MONEY_LOAN_SESSION_ID, '記録', nowIso()]
      );
    }
    db.runSync(`UPDATE ${MONEY_LOANS_TABLE} SET session_id = ? WHERE session_id IS NULL OR session_id = '';`, [
      LEGACY_MONEY_LOAN_SESSION_ID,
    ]);
  }

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${SHUFFLE_POOLS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      label_is_custom INTEGER NOT NULL DEFAULT 0,
      member_ids TEXT NOT NULL,
      member_set_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${SHUFFLE_POOLS_TABLE}_last_used_at ON ${SHUFFLE_POOLS_TABLE}(last_used_at);`
  );
  db.execSync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_${SHUFFLE_POOLS_TABLE}_member_set_key ON ${SHUFFLE_POOLS_TABLE}(member_set_key);`
  );

  const commonTableInfo = db.getAllSync<{ name: string }>(`PRAGMA table_info(${COMMON_ITEM_OPTIONS_TABLE});`);
  const commonColumns = new Set(commonTableInfo.map((c) => c.name));
  if (!commonColumns.has('members')) {
    db.execSync(`ALTER TABLE ${COMMON_ITEM_OPTIONS_TABLE} ADD COLUMN members TEXT NOT NULL DEFAULT '[]';`);
  }

  const profileTableInfo = db.getAllSync<{ name: string }>(`PRAGMA table_info(${PROFILES_TABLE});`);
  const profileColumns = new Set(profileTableInfo.map((column) => column.name));

  /** 既存DB向けの列追加のみ。新列はここに { column, sql } を追記する。 */
  const profileAdditiveMigrations: { column: string; sql: string }[] = [
    { column: 'name', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN name TEXT NOT NULL DEFAULT '';` },
    { column: 'residence', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN residence TEXT NOT NULL DEFAULT '';` },
    { column: 'userId', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN userId TEXT NOT NULL DEFAULT '';` },
    { column: 'publicFields', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN publicFields TEXT NOT NULL DEFAULT '[]';` },
    { column: 'importSource', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN importSource TEXT NOT NULL DEFAULT 'manual';` },
    { column: 'scannedUserId', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN scannedUserId TEXT NOT NULL DEFAULT '';` },
    { column: 'scannedAt', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN scannedAt TEXT NOT NULL DEFAULT '';` },
  ];

  db.execSync('BEGIN IMMEDIATE;');
  try {
    for (const { column, sql } of profileAdditiveMigrations) {
      if (!profileColumns.has(column)) {
        db.execSync(sql);
      }
    }
    db.execSync('COMMIT;');
  } catch {
    db.execSync('ROLLBACK;');
    throw new Error('FriendDex: friend_profiles スキーマ移行に失敗しました');
  }

  if (legacyFriendsTableExists()) {
    const tableInfo = db.getAllSync<{ name: string }>(`PRAGMA table_info(${FRIENDS_TABLE});`);
    const columns = new Set(tableInfo.map((column) => column.name));
    if (!columns.has('episodes')) {
      db.execSync(`ALTER TABLE ${FRIENDS_TABLE} ADD COLUMN episodes TEXT NOT NULL DEFAULT '[]';`);
    }
    if (!columns.has('sayings')) {
      db.execSync(`ALTER TABLE ${FRIENDS_TABLE} ADD COLUMN sayings TEXT NOT NULL DEFAULT '[]';`);
    }
    if (!columns.has('traits')) {
      db.execSync(`ALTER TABLE ${FRIENDS_TABLE} ADD COLUMN traits TEXT NOT NULL DEFAULT '[]';`);
    }

    const profileCountRows = db.getAllSync<{ friendId: string; count: number }>(
      `SELECT friendId, COUNT(*) as count FROM ${PROFILES_TABLE} GROUP BY friendId;`
    );
    const profileCountByFriendId = new Map(profileCountRows.map((row) => [row.friendId, row.count]));
    const fallbackAuthorId = getMyself();
    const friendRowsForBackfill = db.getAllSync<FriendRow>(`SELECT * FROM ${FRIENDS_TABLE};`);
    friendRowsForBackfill.forEach((friendRow) => {
      if ((profileCountByFriendId.get(friendRow.id) ?? 0) > 0) {
        return;
      }
      const profileId = uuidv4();
      const timestamp = nowIso();
      db.runSync(
        `INSERT INTO ${PROFILES_TABLE} (
        id, friendId, name, authorUserId, source, isDefault, nickname, origin, residence, mbti, birthday, height, weight, category,
        description, photoUri, affiliations, personalities, experiences, traits, likes, dislikes, episodes, sayings, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          profileId,
          friendRow.id,
          friendRow.name,
          fallbackAuthorId,
          'self',
          1,
          friendRow.nickname,
          friendRow.origin,
          friendRow.residence ?? '',
          friendRow.mbti,
          friendRow.birthday,
          friendRow.height,
          friendRow.weight,
          friendRow.category,
          friendRow.description,
          friendRow.photoUri,
          friendRow.affiliations,
          friendRow.personalities,
          friendRow.experiences,
          friendRow.traits,
          friendRow.likes,
          friendRow.dislikes,
          friendRow.episodes,
          friendRow.sayings,
          timestamp,
          timestamp,
        ]
      );
    });

    const migrateTimestamp = nowIso();
    db.execSync('BEGIN IMMEDIATE;');
    try {
      const friendRows = db.getAllSync<FriendRow>(`SELECT id, name, episodes FROM ${FRIENDS_TABLE};`);
      friendRows.forEach((friendRow) => {
        db.runSync(`UPDATE ${PROFILES_TABLE} SET name = ? WHERE friendId = ?;`, [friendRow.name, friendRow.id]);
        db.runSync(
          `UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE friendId = ? AND isDefault = 1;`,
          [friendRow.episodes, migrateTimestamp, friendRow.id]
        );
      });
      db.execSync(`DROP TABLE ${FRIENDS_TABLE};`);
      db.execSync('COMMIT;');
    } catch {
      db.execSync('ROLLBACK;');
      throw new Error('FriendDex: friends → friend_profiles 移行に失敗しました');
    }
  }

  const myselfId = getMyself();
  if (myselfId) {
    backfillEpisodeAuthorFriendIds(myselfId);
  }
};

const upsertDefaultProfileFromFriend = (friendId: string, input: FriendInput, timestamp: string): void => {
  db.runSync(`UPDATE ${PROFILES_TABLE} SET name = ?, updatedAt = ? WHERE friendId = ?;`, [
    input.name,
    timestamp,
    friendId,
  ]);

  const defaultProfile = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${PROFILES_TABLE} WHERE friendId = ? AND isDefault = 1 ORDER BY updatedAt DESC LIMIT 1;`,
    [friendId]
  );

  if (defaultProfile) {
    db.runSync(
      `
        UPDATE ${PROFILES_TABLE}
        SET
          nickname = ?,
          origin = ?,
          residence = ?,
          mbti = ?,
          birthday = ?,
          height = ?,
          weight = ?,
          category = ?,
          description = ?,
          photoUri = ?,
          affiliations = ?,
          personalities = ?,
          experiences = ?,
          traits = ?,
          likes = ?,
          dislikes = ?,
          episodes = ?,
          sayings = ?,
          updatedAt = ?
        WHERE id = ?;
      `,
      [
        input.nickname,
        input.origin,
        input.residence,
        input.mbti,
        input.birthday,
        input.height,
        input.weight,
        input.category,
        input.description,
        input.photoUri,
        toJson(input.affiliations),
        toJson(input.personalities),
        toJson(input.experiences),
        toJson(input.traits),
        toJson(input.likes),
        toJson(input.dislikes),
        toEpisodeJson(input.episodes ?? []),
        toSayingJson(input.sayings ?? []),
        timestamp,
        defaultProfile.id,
      ]
    );
    return;
  }

  db.runSync(
    `
      INSERT INTO ${PROFILES_TABLE} (
        id, friendId, name, authorUserId, source, isDefault, nickname, origin, residence, mbti, birthday, height, weight, category,
        description, photoUri, affiliations, personalities, experiences, traits, likes, dislikes, episodes, sayings, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      uuidv4(),
      friendId,
      input.name,
      getMyself(),
      'self',
      1,
      input.nickname,
      input.origin,
      input.residence,
      input.mbti,
      input.birthday,
      input.height,
      input.weight,
      input.category,
      input.description,
      input.photoUri,
      toJson(input.affiliations),
      toJson(input.personalities),
      toJson(input.experiences),
      toJson(input.traits),
      toJson(input.likes),
      toJson(input.dislikes),
      toEpisodeJson(input.episodes ?? []),
      toSayingJson(input.sayings ?? []),
      timestamp,
      timestamp,
    ]
  );
};

export const createFriend = (input: FriendInput): Friend => {
  const personId = uuidv4();
  const profileId = uuidv4();
  const timestamp = nowIso();

  db.runSync(
    `
      INSERT INTO ${PROFILES_TABLE} (
        id, friendId, name, authorUserId, source, isDefault, nickname, origin, residence, mbti, birthday, height, weight, category,
        description, photoUri, affiliations, personalities, experiences, traits, likes, dislikes, episodes, sayings,
        importSource, scannedUserId, scannedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      profileId,
      personId,
      input.name,
      getMyself(),
      'self',
      1,
      input.nickname,
      input.origin,
      input.residence,
      input.mbti,
      input.birthday,
      input.height,
      input.weight,
      input.category,
      input.description,
      input.photoUri,
      toJson(input.affiliations),
      toJson(input.personalities),
      toJson(input.experiences),
      toJson(input.traits),
      toJson(input.likes),
      toJson(input.dislikes),
      toEpisodeJson(input.episodes ?? []),
      toSayingJson(input.sayings ?? []),
      'manual',
      '',
      '',
      timestamp,
      timestamp,
    ]
  );

  return {
    id: personId,
    ...input,
    episodes: input.episodes ?? [],
    sayings: input.sayings ?? [],
    importSource: 'manual',
    scannedUserId: '',
    scannedAt: '',
  };
};

export const createFriendFromQrScan = (input: FriendInput, scannedUserId: string): Friend => {
  const personId = uuidv4();
  const profileId = uuidv4();
  const timestamp = nowIso();
  const normalizedUserId = scannedUserId.trim();

  db.runSync(
    `
      INSERT INTO ${PROFILES_TABLE} (
        id, friendId, name, authorUserId, source, isDefault, nickname, origin, residence, mbti, birthday, height, weight, category,
        description, photoUri, affiliations, personalities, experiences, traits, likes, dislikes, episodes, sayings,
        importSource, scannedUserId, scannedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      profileId,
      personId,
      input.name,
      null,
      'shared',
      1,
      input.nickname,
      input.origin,
      input.residence,
      input.mbti,
      input.birthday,
      input.height,
      input.weight,
      input.category,
      input.description,
      input.photoUri,
      toJson(input.affiliations),
      toJson(input.personalities),
      toJson(input.experiences),
      toJson(input.traits),
      toJson(input.likes),
      toJson(input.dislikes),
      toEpisodeJson(input.episodes ?? []),
      toSayingJson(input.sayings ?? []),
      'qr_scan',
      normalizedUserId,
      timestamp,
      timestamp,
      timestamp,
    ]
  );

  return {
    id: personId,
    ...input,
    episodes: input.episodes ?? [],
    sayings: input.sayings ?? [],
    importSource: 'qr_scan',
    scannedUserId: normalizedUserId,
    scannedAt: timestamp,
  };
};

export const findFriendByScannedUserId = (scannedUserId: string): Friend | null => {
  const normalized = scannedUserId.trim();
  if (!normalized) return null;
  const row = db.getFirstSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} WHERE isDefault = 1 AND importSource = 'qr_scan' AND scannedUserId = ? LIMIT 1;`,
    [normalized]
  );
  if (!row) return null;
  const baseFriend = defaultProfileRowToFriend(row);
  return applyDefaultProfileToFriend(baseFriend, getEffectiveProfile(baseFriend.id));
};

export const getQrScannedFriends = (): Friend[] => {
  const rows = db.getAllSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} WHERE isDefault = 1 AND importSource = 'qr_scan' ORDER BY scannedAt DESC, name COLLATE NOCASE ASC;`
  );
  return rows.map((row) => {
    const baseFriend = defaultProfileRowToFriend(row);
    return applyDefaultProfileToFriend(baseFriend, getEffectiveProfile(baseFriend.id));
  });
};

export const getQrUserIdOwnerFriendId = (scannedUserId: string): string | null => {
  const linked = findFriendByScannedUserId(scannedUserId);
  return linked?.id ?? null;
};

export const applyQrLinkToFriend = (
  friendId: string,
  input: FriendInput,
  publicFields: string[],
  scannedUserId: string
): boolean => {
  const existing = getFriendById(friendId);
  if (!existing) {
    return false;
  }

  const normalizedUserId = scannedUserId.trim();
  if (!normalizedUserId) {
    return false;
  }

  const ownerId = getQrUserIdOwnerFriendId(normalizedUserId);
  if (ownerId && ownerId !== friendId) {
    return false;
  }

  const merged = mergeFriendInputWithPublicFields(existing, input, publicFields);
  const timestamp = nowIso();
  const defaultProfile = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${PROFILES_TABLE} WHERE friendId = ? AND isDefault = 1 ORDER BY updatedAt DESC LIMIT 1;`,
    [friendId]
  );
  if (!defaultProfile) {
    return false;
  }

  if (publicFields.includes('name')) {
    db.runSync(`UPDATE ${PROFILES_TABLE} SET name = ?, updatedAt = ? WHERE friendId = ?;`, [
      merged.name.trim(),
      timestamp,
      friendId,
    ]);
  }

  const assignments: string[] = [
    `importSource = 'qr_scan'`,
    'scannedUserId = ?',
    'scannedAt = ?',
    'authorUserId = NULL',
    "source = 'shared'",
  ];
  const values: (string | number | null)[] = [normalizedUserId, timestamp];

  const updatableFields: { key: string; value: string | number | null; publicKey: string }[] = [
    { key: 'nickname', value: merged.nickname, publicKey: 'nickname' },
    { key: 'origin', value: merged.origin, publicKey: 'origin' },
    { key: 'residence', value: merged.residence, publicKey: 'residence' },
    { key: 'mbti', value: merged.mbti, publicKey: 'mbti' },
    { key: 'birthday', value: merged.birthday, publicKey: 'birthday' },
    { key: 'height', value: merged.height, publicKey: 'height' },
    { key: 'weight', value: merged.weight, publicKey: 'weight' },
  ];

  updatableFields.forEach(({ key, value, publicKey }) => {
    if (!publicFields.includes(publicKey)) return;
    assignments.push(`${key} = ?`);
    values.push(value);
  });

  assignments.push('updatedAt = ?');
  values.push(timestamp, defaultProfile.id);

  const result = db.runSync(
    `UPDATE ${PROFILES_TABLE} SET ${assignments.join(', ')} WHERE id = ?;`,
    values
  );
  return result.changes > 0;
};

export const updateQrScannedFriend = (
  friendId: string,
  input: FriendInput,
  publicFields: string[],
  scannedUserId?: string
): boolean => {
  const existing = getFriendById(friendId);
  if (!existing) {
    return false;
  }
  const userId = (scannedUserId ?? existing.scannedUserId).trim();
  if (!userId) {
    return false;
  }
  return applyQrLinkToFriend(friendId, input, publicFields, userId);
};

export const getFriendById = (id: string): Friend | null => {
  const row = db.getFirstSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} WHERE friendId = ? AND isDefault = 1 ORDER BY updatedAt DESC LIMIT 1;`,
    [id]
  );
  if (!row) {
    return null;
  }
  const baseFriend = defaultProfileRowToFriend(row);
  const effectiveProfile = getEffectiveProfile(baseFriend.id);
  return applyDefaultProfileToFriend(baseFriend, effectiveProfile);
};

export const getAllFriends = (): Friend[] => {
  const rows = db.getAllSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} WHERE isDefault = 1 ORDER BY name COLLATE NOCASE ASC;`
  );
  if (rows.length === 0) {
    return [];
  }
  return rows.map((row) => {
    const baseFriend = defaultProfileRowToFriend(row);
    return applyDefaultProfileToFriend(baseFriend, getEffectiveProfile(baseFriend.id));
  });
};

export const getAllProfiles = (): Profile[] => {
  const rows = db.getAllSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} ORDER BY name COLLATE NOCASE ASC;`
  );
  return rows.map(rowToProfile);
};

export const getProfilesByFriendId = (friendId: string): Profile[] => {
  const rows = db.getAllSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} WHERE friendId = ? ORDER BY isDefault DESC, updatedAt DESC;`,
    [friendId]
  );
  return rows.map(rowToProfile);
};

export const getDefaultProfile = (friendId: string): Profile | null => {
  const row =
    db.getFirstSync<ProfileRow>(
      `SELECT * FROM ${PROFILES_TABLE} WHERE friendId = ? AND isDefault = 1 ORDER BY updatedAt DESC LIMIT 1;`,
      [friendId]
    ) ??
    db.getFirstSync<ProfileRow>(`SELECT * FROM ${PROFILES_TABLE} WHERE friendId = ? ORDER BY updatedAt DESC LIMIT 1;`, [friendId]);
  return row ? rowToProfile(row) : null;
};

export const getProfileById = (profileId: string): Profile | null => {
  const row = db.getFirstSync<ProfileRow>(`SELECT * FROM ${PROFILES_TABLE} WHERE id = ? LIMIT 1;`, [profileId]);
  return row ? rowToProfile(row) : null;
};

/**
 * 将来的に profile選択ルール（shared/self/user preference等）をここへ集約する。
 * 現在は default profile（isDefault=1）を採用し、なければ null を返す。
 */
export const getEffectiveProfile = (friendId: string): Profile | null => {
  const row = db.getFirstSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} WHERE friendId = ? AND isDefault = 1 ORDER BY updatedAt DESC LIMIT 1;`,
    [friendId]
  );
  return row ? rowToProfile(row) : null;
};

export const setDefaultProfile = (friendId: string, profileId: string): boolean => {
  const target = db.getFirstSync<{ id: string }>(`SELECT id FROM ${PROFILES_TABLE} WHERE id = ? AND friendId = ?;`, [
    profileId,
    friendId,
  ]);
  if (!target) {
    return false;
  }
  const timestamp = nowIso();
  db.runSync(`UPDATE ${PROFILES_TABLE} SET isDefault = 0, updatedAt = ? WHERE friendId = ?;`, [timestamp, friendId]);
  db.runSync(`UPDATE ${PROFILES_TABLE} SET isDefault = 1, updatedAt = ? WHERE id = ?;`, [timestamp, profileId]);
  return true;
};

export const getMyself = (): string | null => {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM ${SETTINGS_TABLE} WHERE key = ?;`, [MYSELF_KEY]);
  return row?.value ?? null;
};

export const DETAIL_DESIGN_VARIANT_KEY = 'detail_design_variant';
export const UI_PREVIEW_VARIANT_KEY = 'ui_preview_variant';
export const UI_CALENDAR_EVENT_TIME_DISPLAY_KEY = 'ui_calendar_event_time_display';

export const getAppSetting = (key: string): string | null => {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM ${SETTINGS_TABLE} WHERE key = ?;`, [key]);
  return row?.value ?? null;
};

export const setAppSetting = (key: string, value: string): void => {
  db.runSync(
    `INSERT INTO ${SETTINGS_TABLE} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value]
  );
};

export const getDetailDesignVariant = (): 'main' | 'light' => {
  const value = getAppSetting(DETAIL_DESIGN_VARIANT_KEY);
  return value === 'light' ? 'light' : 'main';
};

export const setDetailDesignVariant = (variant: 'main' | 'light'): void => {
  setAppSetting(DETAIL_DESIGN_VARIANT_KEY, variant);
};

export const getUiPreviewVariant = (): 'stable' | 'preview' => {
  const value = getAppSetting(UI_PREVIEW_VARIANT_KEY);
  return value === 'preview' ? 'preview' : 'stable';
};

export const setUiPreviewVariant = (variant: 'stable' | 'preview'): void => {
  setAppSetting(UI_PREVIEW_VARIANT_KEY, variant);
};

export const getCalendarEventTimeDisplayOverride = (): 'plain' | 'column' | 'badge' | null => {
  const value = getAppSetting(UI_CALENDAR_EVENT_TIME_DISPLAY_KEY);
  if (value === 'plain' || value === 'column' || value === 'badge') {
    return value;
  }
  return null;
};

export const setCalendarEventTimeDisplayOverride = (display: 'plain' | 'column' | 'badge'): void => {
  setAppSetting(UI_CALENDAR_EVENT_TIME_DISPLAY_KEY, display);
};

export const setMyself = (friendId: string | null): boolean => {
  if (friendId === null) {
    db.runSync(`DELETE FROM ${SETTINGS_TABLE} WHERE key = ?;`, [MYSELF_KEY]);
    return true;
  }
  const normalized = friendId.trim();
  if (!normalized) {
    return false;
  }
  const exists = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${PROFILES_TABLE} WHERE friendId = ? AND isDefault = 1 LIMIT 1;`,
    [normalized]
  );
  if (!exists) {
    return false;
  }
  db.runSync(
    `INSERT INTO ${SETTINGS_TABLE} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [MYSELF_KEY, normalized]
  );
  return true;
};

export const searchFriends = (filters: FriendSearchFilters): Friend[] => {
  const conditions: string[] = ['isDefault = 1'];
  const params: (string | number)[] = [];

  if (filters.name?.trim()) {
    conditions.push('name LIKE ?');
    params.push(`%${filters.name.trim()}%`);
  }

  if (filters.affiliation1?.trim()) {
    conditions.push('affiliations LIKE ?');
    params.push(`%"${filters.affiliation1.trim()}"%`);
  }

  if (filters.affiliation2?.trim()) {
    conditions.push('affiliations LIKE ?');
    params.push(`%"${filters.affiliation2.trim()}"%`);
  }

  if (filters.birthMonth && filters.birthMonth >= 1 && filters.birthMonth <= 12) {
    const month = String(filters.birthMonth).padStart(2, '0');
    conditions.push('substr(birthday, 6, 2) = ?');
    params.push(month);
  }

  if (filters.mbti) {
    conditions.push('mbti = ?');
    params.push(filters.mbti);
  }

  if (filters.experience?.trim()) {
    conditions.push('experiences LIKE ?');
    params.push(`%"${filters.experience.trim()}"%`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const orderBy =
    filters.birthMonth && filters.birthMonth >= 1 && filters.birthMonth <= 12
      ? 'CAST(substr(birthday, 9, 2) AS INTEGER) ASC'
      : 'name COLLATE NOCASE ASC';
  const rows = db.getAllSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} ${whereClause} ORDER BY ${orderBy};`,
    params
  );

  return rows.map((row) => defaultProfileRowToFriend(row));
};

export const updateFriend = (id: string, input: FriendInput): boolean => {
  const exists = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${PROFILES_TABLE} WHERE friendId = ? AND isDefault = 1 LIMIT 1;`,
    [id]
  );
  if (!exists) {
    return false;
  }
  const timestamp = nowIso();
  upsertDefaultProfileFromFriend(id, input, timestamp);
  return true;
};

export type ProfileSelfUpdateInput = {
  name: string;
  nickname: string;
  birthday: string;
  height: number | null;
  weight: number | null;
  origin: string;
  residence: string;
  mbti: Friend['mbti'];
  publicFields: string[];
};

export const ensureProfileUserId = (profileId: string): string | null => {
  const row = db.getFirstSync<Pick<ProfileRow, 'id' | 'userId'>>(`SELECT id, userId FROM ${PROFILES_TABLE} WHERE id = ?;`, [
    profileId,
  ]);
  if (!row) {
    return null;
  }
  const existing = (row.userId ?? '').trim();
  if (existing) {
    return existing;
  }
  const userId = uuidv4();
  const timestamp = nowIso();
  db.runSync(`UPDATE ${PROFILES_TABLE} SET userId = ?, updatedAt = ? WHERE id = ?;`, [userId, timestamp, profileId]);
  return userId;
};

export const updateProfile = (profileId: string, input: ProfileSelfUpdateInput): boolean => {
  const row = db.getFirstSync<ProfileRow>(`SELECT * FROM ${PROFILES_TABLE} WHERE id = ?;`, [profileId]);
  if (!row) {
    return false;
  }
  ensureProfileUserId(profileId);
  const timestamp = nowIso();
  db.runSync(`UPDATE ${PROFILES_TABLE} SET name = ?, updatedAt = ? WHERE friendId = ?;`, [
    input.name,
    timestamp,
    row.friendId,
  ]);
  const result = db.runSync(
    `
      UPDATE ${PROFILES_TABLE}
      SET
        nickname = ?,
        origin = ?,
        residence = ?,
        mbti = ?,
        birthday = ?,
        height = ?,
        weight = ?,
        publicFields = ?,
        updatedAt = ?
      WHERE id = ?;
    `,
    [
      input.nickname,
      input.origin,
      input.residence,
      input.mbti,
      input.birthday,
      input.height,
      input.weight,
      toJson(input.publicFields),
      timestamp,
      profileId,
    ]
  );
  return result.changes > 0;
};

export const deleteFriend = (id: string): boolean => {
  const result = db.runSync(`DELETE FROM ${PROFILES_TABLE} WHERE friendId = ?;`, [id]);
  return result.changes > 0;
};

export const deleteProfileById = (profileId: string): boolean => {
  const row = db.getFirstSync<ProfileRow>(`SELECT * FROM ${PROFILES_TABLE} WHERE id = ?;`, [profileId]);
  if (!row) {
    return false;
  }
  if (row.isDefault === 1) {
    const myselfFriendId = getMyself();
    if (myselfFriendId === row.friendId) {
      setMyself(null);
    }
  }
  const result = db.runSync(`DELETE FROM ${PROFILES_TABLE} WHERE id = ?;`, [profileId]);
  return result.changes > 0;
};

export type EpisodeInput = Omit<Episode, 'id' | 'authorFriendId'>;

const getDefaultProfileRowsByPersonIds = (personIds: string[]): ProfileRow[] => {
  if (personIds.length === 0) {
    return [];
  }
  const placeholders = personIds.map(() => '?').join(', ');
  return db.getAllSync<ProfileRow>(
    `SELECT * FROM ${PROFILES_TABLE} WHERE friendId IN (${placeholders}) AND isDefault = 1;`,
    personIds
  );
};

const uniqueParticipantEntries = (entries: EpisodeParticipant[]): EpisodeParticipant[] => {
  const seen = new Set<string>();
  const normalized: EpisodeParticipant[] = [];
  entries.forEach((entry) => {
    const sanitized = sanitizeParticipantEntry(entry);
    if (!sanitized) {
      return;
    }
    const key = `${sanitized.kind}:${sanitized.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(sanitized);
    }
  });
  return normalized;
};

const collectAffiliationMemberIds = (rows: { friendId: string; affiliations: string }[], affiliation: string): string[] => {
  if (!affiliation.trim()) {
    return [];
  }
  return rows
    .filter((row) => fromJson(row.affiliations).includes(affiliation))
    .map((row) => row.friendId);
};

const expandParticipantEntriesToFriendIds = (entries: EpisodeParticipant[]): string[] => {
  const rows = db.getAllSync<{ friendId: string; affiliations: string }>(
    `SELECT friendId, affiliations FROM ${PROFILES_TABLE} WHERE isDefault = 1;`
  );
  const ids = new Set<string>();
  entries.forEach((entry) => {
    const targetIds =
      entry.kind === 'individual' ? [entry.value] : collectAffiliationMemberIds(rows, entry.value);
    targetIds.forEach((id) => {
      if (id.trim().length > 0) {
        ids.add(id);
      }
    });
  });
  return Array.from(ids);
};

export const getEpisodeParticipantFriendIds = (episode: Pick<Episode, 'participantEntries'>): string[] =>
  expandParticipantEntriesToFriendIds(episode.participantEntries ?? []);

const ensureRequiredParticipants = (
  entries: EpisodeParticipant[],
  myselfId: string | null
): EpisodeParticipant[] => {
  const next = uniqueParticipantEntries(entries);
  const requiredId = myselfId?.trim() ?? '';
  if (requiredId && !next.some((entry) => entry.kind === 'individual' && entry.value === requiredId)) {
    next.push({ kind: 'individual', value: requiredId });
  }
  return next;
};

const resolveEpisodeTagForInput = (input: EpisodeInput, previousEpisode?: Episode | null): string | null => {
  if (input.tag !== undefined) {
    return normalizeEpisodeTag(input.tag);
  }
  const linkedEventId =
    input.eventId?.trim() || previousEpisode?.eventId?.trim() || '';
  if (linkedEventId) {
    return normalizeEpisodeTag(getEvent(linkedEventId)?.episodeTag);
  }
  return normalizeEpisodeTag(previousEpisode?.tag);
};

export const createEpisode = (input: EpisodeInput): Episode | null => {
  const myselfId = getMyself();
  if (!myselfId || !getFriendById(myselfId)) {
    return null;
  }

  const participantEntries = ensureRequiredParticipants(input.participantEntries ?? [], myselfId);
  const visibilityMode = sanitizeVisibilityMode(input.visibilityMode);
  const visibilityEntries =
    visibilityMode === 'limited' ? uniqueVisibilityEntries(input.visibilityEntries ?? []) : [];
  const tag = resolveEpisodeTagForInput(input);
  const episode: Episode = {
    id: uuidv4(),
    title: input.title,
    date: input.date,
    description: input.description,
    authorFriendId: myselfId,
    visibilityMode,
    participantEntries,
    visibilityEntries,
    ...(input.eventId?.trim() ? { eventId: input.eventId.trim() } : {}),
    ...(tag ? { tag } : {}),
    isAutoGenerated: input.isAutoGenerated === true,
    pendingReview: input.pendingReview === true,
  };

  const targetIds = Array.from(new Set([myselfId, ...expandParticipantEntriesToFriendIds(participantEntries)]));
  const rows = getDefaultProfileRowsByPersonIds(targetIds);
  const timestamp = nowIso();

  rows.forEach((row) => {
    const episodes = fromEpisodeJson(row.episodes);
    episodes.push(episode);
    db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
      toEpisodeJson(episodes),
      timestamp,
      row.id,
    ]);
  });

  return episode;
};

export const getEpisodes = (friendId: string): Episode[] => {
  const friend = getFriendById(friendId);
  return friend?.episodes ?? [];
};

const findEpisodeAcrossProfiles = (episodeId: string): Episode | null => {
  const normalizedId = episodeId.trim();
  if (!normalizedId) {
    return null;
  }
  const rows = db.getAllSync<{ episodes: string }>(`SELECT episodes FROM ${PROFILES_TABLE};`);
  for (const row of rows) {
    const found = fromEpisodeJson(row.episodes).find((episode) => episode.id === normalizedId);
    if (found) {
      return found;
    }
  }
  return null;
};

export const getEpisodeById = (friendId: string, episodeId: string): Episode | null => {
  const normalizedId = episodeId.trim();
  if (!normalizedId) {
    return null;
  }
  const local = getEpisodes(friendId).find((episode) => episode.id === normalizedId);
  if (local) {
    return local;
  }
  return findEpisodeAcrossProfiles(normalizedId);
};

export const updateEpisode = (authorFriendId: string, episodeId: string, input: EpisodeInput): boolean => {
  const normalizedId = episodeId.trim();
  if (!normalizedId) {
    return false;
  }

  const previousEpisode = findEpisodeAcrossProfiles(normalizedId);
  if (!previousEpisode) {
    return false;
  }

  const participantEntries = ensureRequiredParticipants(input.participantEntries ?? [], getMyself());
  const visibilityMode = sanitizeVisibilityMode(input.visibilityMode);
  const visibilityEntries =
    visibilityMode === 'limited' ? uniqueVisibilityEntries(input.visibilityEntries ?? []) : [];
  const tag = resolveEpisodeTagForInput(input, previousEpisode);
  const updatedEpisode: Episode = {
    id: normalizedId,
    title: input.title,
    date: input.date,
    description: input.description,
    authorFriendId: previousEpisode.authorFriendId,
    visibilityMode,
    participantEntries,
    visibilityEntries,
    ...(input.eventId?.trim()
      ? { eventId: input.eventId.trim() }
      : previousEpisode.eventId
        ? { eventId: previousEpisode.eventId }
        : {}),
    ...(tag ? { tag } : {}),
    isAutoGenerated: input.isAutoGenerated ?? previousEpisode.isAutoGenerated ?? false,
    pendingReview: input.pendingReview ?? previousEpisode.pendingReview ?? false,
  };

  const authorId = previousEpisode.authorFriendId.trim() || authorFriendId;
  const previousTargets = new Set([
    authorId,
    ...expandParticipantEntriesToFriendIds(previousEpisode.participantEntries),
  ]);
  const nextTargets = new Set([authorId, ...expandParticipantEntriesToFriendIds(participantEntries)]);
  const unionTargetIds = Array.from(new Set([...previousTargets, ...nextTargets]));
  const timestamp = nowIso();
  let changed = false;

  const allRows = db.getAllSync<{ id: string; friendId: string; episodes: string }>(
    `SELECT id, friendId, episodes FROM ${PROFILES_TABLE};`
  );
  allRows.forEach((row) => {
    const existingEpisodes = fromEpisodeJson(row.episodes);
    const index = existingEpisodes.findIndex((episode) => episode.id === normalizedId);
    if (index < 0) {
      return;
    }
    existingEpisodes[index] = updatedEpisode;
    changed = true;
    db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
      toEpisodeJson(existingEpisodes),
      timestamp,
      row.id,
    ]);
  });

  const rows = getDefaultProfileRowsByPersonIds(unionTargetIds);
  rows.forEach((row) => {
    const shouldHaveEpisode = nextTargets.has(row.friendId);
    const existingEpisodes = fromEpisodeJson(row.episodes);
    const hasEpisode = existingEpisodes.some((episode) => episode.id === normalizedId);
    if (shouldHaveEpisode && !hasEpisode) {
      changed = true;
      db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
        toEpisodeJson([...existingEpisodes, updatedEpisode]),
        timestamp,
        row.id,
      ]);
    } else if (!shouldHaveEpisode && hasEpisode) {
      changed = true;
      db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
        toEpisodeJson(existingEpisodes.filter((episode) => episode.id !== normalizedId)),
        timestamp,
        row.id,
      ]);
    }
  });

  if (changed) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isEventEpisodeSyncInProgress, syncLinkedEventFromEpisode } =
      require('./utils/eventEpisodeBidirectionalSync') as typeof import('./utils/eventEpisodeBidirectionalSync');
    if (!isEventEpisodeSyncInProgress() && updatedEpisode.eventId) {
      syncLinkedEventFromEpisode(updatedEpisode, authorId);
    }
  }

  return changed;
};

export const deleteEpisode = (authorFriendId: string, episodeId: string): boolean => {
  void authorFriendId;
  const normalizedId = episodeId.trim();
  if (!normalizedId) {
    return false;
  }

  if (!findEpisodeAcrossProfiles(normalizedId)) {
    return false;
  }

  const timestamp = nowIso();
  let changed = false;
  const rows = db.getAllSync<{ id: string; episodes: string }>(
    `SELECT id, episodes FROM ${PROFILES_TABLE};`
  );

  rows.forEach((row) => {
    const existingEpisodes = fromEpisodeJson(row.episodes);
    const nextEpisodes = existingEpisodes.filter((episode) => episode.id !== normalizedId);
    if (nextEpisodes.length === existingEpisodes.length) {
      return;
    }
    changed = true;
    db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
      toEpisodeJson(nextEpisodes),
      timestamp,
      row.id,
    ]);
  });

  if (changed) {
    deleteEpisodePhotosByEpisodeId(normalizedId);
  }

  return changed;
};

export const getEpisodeByEventId = (eventId: string): Episode | null => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return null;
  }
  const rows = db.getAllSync<{ episodes: string }>(`SELECT episodes FROM ${PROFILES_TABLE};`);
  for (const row of rows) {
    const found = fromEpisodeJson(row.episodes).find(
      (episode) => episode.eventId === normalizedEventId
    );
    if (found) {
      return found;
    }
  }
  return null;
};

export const hasAutoGeneratedEpisodeForEvent = (eventId: string): boolean => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return false;
  }
  const rows = db.getAllSync<{ episodes: string }>(`SELECT episodes FROM ${PROFILES_TABLE};`);
  return rows.some((row) =>
    fromEpisodeJson(row.episodes).some(
      (episode) => episode.eventId === normalizedEventId && episode.isAutoGenerated === true
    )
  );
};

export const markEventAutoEpisodeCreated = (eventId: string): void => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return;
  }
  db.runSync(`UPDATE ${EVENTS_TABLE} SET auto_episode_created = 1, updated_at = ? WHERE id = ?;`, [
    nowIso(),
    normalizedEventId,
  ]);
};

export const getPendingReviewEpisodes = (): PendingReviewEpisodeRef[] => {
  const rows = db.getAllSync<{ id: string; friendId: string; name: string; episodes: string }>(
    `SELECT id, friendId, name, episodes FROM ${PROFILES_TABLE};`
  );
  const pending: PendingReviewEpisodeRef[] = [];
  const seenEpisodeIds = new Set<string>();
  rows.forEach((row) => {
    fromEpisodeJson(row.episodes).forEach((episode) => {
      if (episode.pendingReview !== true || seenEpisodeIds.has(episode.id)) {
        return;
      }
      seenEpisodeIds.add(episode.id);
      pending.push({
        profileId: row.id,
        friendId: row.friendId,
        friendName: row.name,
        episode,
      });
    });
  });
  pending.sort((left, right) => right.episode.date.localeCompare(left.episode.date));
  return pending;
};

export const insertEpisodePhoto = (
  episodeId: string,
  photoUri: string,
  sortOrder: number
): EpisodePhoto | null => {
  const normalizedEpisodeId = episodeId.trim();
  const normalizedUri = photoUri.trim();
  if (!normalizedEpisodeId || !normalizedUri) {
    return null;
  }

  const timestamp = nowIso();
  const result = db.runSync(
    `INSERT INTO ${EPISODE_PHOTOS_TABLE} (episode_id, photo_uri, sort_order, created_at) VALUES (?, ?, ?, ?);`,
    [normalizedEpisodeId, normalizedUri, sortOrder, timestamp]
  );

  const row = db.getFirstSync<EpisodePhotoRow>(`SELECT * FROM ${EPISODE_PHOTOS_TABLE} WHERE id = ?;`, [
    result.lastInsertRowId,
  ]);
  return row ? rowToEpisodePhoto(row) : null;
};

export const getEpisodePhotos = (episodeId: string): EpisodePhoto[] => {
  const normalizedEpisodeId = episodeId.trim();
  if (!normalizedEpisodeId) {
    return [];
  }
  const rows = db.getAllSync<EpisodePhotoRow>(
    `SELECT * FROM ${EPISODE_PHOTOS_TABLE} WHERE episode_id = ? ORDER BY sort_order ASC, id ASC;`,
    [normalizedEpisodeId]
  );
  return rows.map(rowToEpisodePhoto);
};

export const getEpisodeCoverPhotoUriMap = (episodeIds: string[]): Map<string, string> => {
  const normalizedIds = [...new Set(episodeIds.map((id) => id.trim()).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return new Map();
  }
  const placeholders = normalizedIds.map(() => '?').join(', ');
  const rows = db.getAllSync<{ episode_id: string; photo_uri: string }>(
    `SELECT episode_id, photo_uri FROM ${EPISODE_PHOTOS_TABLE} WHERE episode_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC;`,
    normalizedIds
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.episode_id)) {
      map.set(row.episode_id, row.photo_uri);
    }
  }
  return map;
};

export const deleteEpisodePhoto = (id: number): boolean => {
  const result = db.runSync(`DELETE FROM ${EPISODE_PHOTOS_TABLE} WHERE id = ?;`, [id]);
  return result.changes > 0;
};

export const deleteEpisodePhotosByEpisodeId = (episodeId: string): boolean => {
  const normalizedEpisodeId = episodeId.trim();
  if (!normalizedEpisodeId) {
    return false;
  }
  const result = db.runSync(`DELETE FROM ${EPISODE_PHOTOS_TABLE} WHERE episode_id = ?;`, [normalizedEpisodeId]);
  return result.changes > 0;
};

export const createSayings = (friendId: string, items: Array<{ text: string; date?: string }>): Saying[] => {
  const friend = getFriendById(friendId);
  if (!friend) {
    return [];
  }
  const additions = items
    .map((item) => ({ text: item.text.trim(), date: (item.date ?? '').trim() }))
    .filter((item) => item.text.length > 0)
    .map((item) => ({ id: uuidv4(), text: item.text, date: item.date }));

  if (additions.length === 0) {
    return [];
  }

  const next = [...friend.sayings, ...additions];
  db.runSync(
    `UPDATE ${PROFILES_TABLE} SET sayings = ?, updatedAt = ? WHERE friendId = ? AND isDefault = 1;`,
    [toSayingJson(next), nowIso(), friendId]
  );
  return additions;
};

export const updateSaying = (friendId: string, sayingId: string, input: { text: string; date?: string }): boolean => {
  const friend = getFriendById(friendId);
  if (!friend) {
    return false;
  }
  const targetText = input.text.trim();
  const targetDate = (input.date ?? '').trim();
  if (!targetText) {
    return false;
  }

  let changed = false;
  const next = friend.sayings.map((saying) => {
    if (saying.id !== sayingId) {
      return saying;
    }
    changed = true;
    return {
      ...saying,
      text: targetText,
      date: targetDate,
    };
  });
  if (!changed) {
    return false;
  }

  db.runSync(
    `UPDATE ${PROFILES_TABLE} SET sayings = ?, updatedAt = ? WHERE friendId = ? AND isDefault = 1;`,
    [toSayingJson(next), nowIso(), friendId]
  );
  return true;
};

export const deleteSaying = (friendId: string, sayingId: string): boolean => {
  const friend = getFriendById(friendId);
  if (!friend) {
    return false;
  }
  const next = friend.sayings.filter((saying) => saying.id !== sayingId);
  if (next.length === friend.sayings.length) {
    return false;
  }
  db.runSync(
    `UPDATE ${PROFILES_TABLE} SET sayings = ?, updatedAt = ? WHERE friendId = ? AND isDefault = 1;`,
    [toSayingJson(next), nowIso(), friendId]
  );
  return true;
};

export const resyncEpisodesForFriendAffiliationChange = (friendId: string): boolean => {
  const targetFriend = getFriendById(friendId);
  if (!targetFriend) {
    return false;
  }

  const targetAffiliations = new Set(targetFriend.affiliations.map((item) => item.trim()).filter((item) => item.length > 0));
  if (targetAffiliations.size === 0) {
    return false;
  }

  const allFriends = getAllFriends();
  const relatedEpisodeMap = new Map<string, Episode>();

  allFriends.forEach((friend) => {
    friend.episodes.forEach((episode) => {
      const entries = episode.participantEntries ?? [];
      const matchedEntries = entries.filter(
        (entry) => entry.kind === 'group' && targetAffiliations.has(entry.value.trim())
      );
      if (matchedEntries.length === 0) {
        return;
      }
      if (!relatedEpisodeMap.has(episode.id)) {
        relatedEpisodeMap.set(episode.id, episode);
      }
    });
  });

  if (relatedEpisodeMap.size === 0) {
    return false;
  }

  const episodeById = new Map(targetFriend.episodes.map((episode) => [episode.id, episode]));
  let changed = false;

  relatedEpisodeMap.forEach((episode, episodeId) => {
    const existing = episodeById.get(episodeId);
    const source = existing ?? episode;
    const entries = uniqueParticipantEntries(source.participantEntries ?? []);
    const hadFriend = entries.some((entry) => entry.kind === 'individual' && entry.value === friendId);
    if (!hadFriend) {
      entries.push({ kind: 'individual', value: friendId });
    }

    if (!existing) {
      changed = true;
    } else if (!hadFriend) {
      changed = true;
    }

    episodeById.set(episodeId, {
      ...source,
      participantEntries: entries,
    });
  });

  if (!changed) {
    return false;
  }

  db.runSync(
    `UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE friendId = ? AND isDefault = 1;`,
    [toEpisodeJson(Array.from(episodeById.values())), nowIso(), friendId]
  );
  return true;
};

const extractDistinctFromProfilesJsonArrayColumn = (
  columnName: 'affiliations' | 'experiences' | 'personalities' | 'likes' | 'dislikes'
): string[] => {
  const rows = db.getAllSync<{ value: string }>(`SELECT ${columnName} as value FROM ${PROFILES_TABLE};`);
  const uniqueValues = new Set<string>();

  rows.forEach((row) => {
    fromJson(row.value).forEach((item) => {
      const normalized = item.trim();
      if (normalized) {
        uniqueValues.add(normalized);
      }
    });
  });

  return Array.from(uniqueValues).sort((a, b) => a.localeCompare(b, 'ja'));
};

const extractDistinctVisibilityGroupsFromProfiles = (): string[] => {
  const rows = db.getAllSync<{ episodes: string }>(`SELECT episodes FROM ${PROFILES_TABLE};`);
  const uniqueValues = new Set<string>();

  rows.forEach((row) => {
    const episodes = fromEpisodeJson(row.episodes);
    episodes.forEach((episode) => {
      (episode.visibilityEntries ?? []).forEach((entry) => {
        if (entry.kind !== 'group') {
          return;
        }
        const normalized = entry.value.trim();
        if (normalized) {
          uniqueValues.add(normalized);
        }
      });
    });
  });

  return Array.from(uniqueValues).sort((a, b) => a.localeCompare(b, 'ja'));
};

const mergeUniqueLabels = (...groups: string[][]): string[] => {
  const set = new Set<string>();
  groups.forEach((items) => {
    items.forEach((item) => {
      const normalized = item.trim();
      if (normalized.length > 0) {
        set.add(normalized);
      }
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
};

type ProfileArrayColumn = 'affiliations' | 'experiences' | 'personalities' | 'likes' | 'dislikes';

const getProfileColumnByKind = (kind: CommonItemKind): ProfileArrayColumn | null => {
  if (kind === 'affiliation') return 'affiliations';
  if (kind === 'experience') return 'experiences';
  if (kind === 'personality') return 'personalities';
  if (kind === 'like') return 'likes';
  if (kind === 'dislike') return 'dislikes';
  return null;
};

const rewriteProfileArrayColumnValue = (
  columnName: ProfileArrayColumn,
  fromLabel: string,
  toLabel: string | null
): void => {
  const rows = db.getAllSync<{ id: string; value: string }>(
    `SELECT id, ${columnName} as value FROM ${PROFILES_TABLE};`
  );
  const timestamp = nowIso();
  rows.forEach((row) => {
    const current = fromJson(row.value);
    const next: string[] = [];
    let changed = false;
    current.forEach((item) => {
      if (item === fromLabel) {
        changed = true;
        if (toLabel && toLabel.length > 0) {
          next.push(toLabel);
        }
      } else {
        next.push(item);
      }
    });
    const uniqueNext = Array.from(new Set(next.map((item) => item.trim()).filter((item) => item.length > 0)));
    if (!changed) {
      return;
    }
    db.runSync(`UPDATE ${PROFILES_TABLE} SET ${columnName} = ?, updatedAt = ? WHERE id = ?;`, [
      toJson(uniqueNext),
      timestamp,
      row.id,
    ]);
  });
};

const rewriteEpisodeTagsInEventsAndEpisodes = (fromLabel: string, toLabel: string | null): void => {
  const from = normalizeCommonLabel(fromLabel);
  const to = toLabel ? normalizeCommonLabel(toLabel) : null;
  if (!from) {
    return;
  }

  const timestamp = nowIso();
  if (to && to.length > 0) {
    db.runSync(`UPDATE ${EVENTS_TABLE} SET episode_tag = ?, updated_at = ? WHERE episode_tag = ?;`, [
      to,
      timestamp,
      from,
    ]);
  } else {
    db.runSync(`UPDATE ${EVENTS_TABLE} SET episode_tag = NULL, updated_at = ? WHERE episode_tag = ?;`, [
      timestamp,
      from,
    ]);
  }

  const rows = db.getAllSync<{ id: string; episodes: string }>(`SELECT id, episodes FROM ${PROFILES_TABLE};`);
  rows.forEach((row) => {
    const episodes = fromEpisodeJson(row.episodes);
    let changed = false;
    const nextEpisodes = episodes.map((episode) => {
      const currentTag = normalizeEpisodeTag(episode.tag);
      if (currentTag !== from) {
        return episode;
      }
      changed = true;
      if (to && to.length > 0) {
        return { ...episode, tag: to };
      }
      const { tag: _removed, ...rest } = episode;
      return rest;
    });
    if (!changed) {
      return;
    }
    db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
      toEpisodeJson(nextEpisodes),
      timestamp,
      row.id,
    ]);
  });
};

const applyCommonItemLabelRewrite = (kind: CommonItemKind, fromLabel: string, toLabel: string | null): void => {
  const column = getProfileColumnByKind(kind);
  if (column) {
    rewriteProfileArrayColumnValue(column, fromLabel, toLabel);
    return;
  }
  if (kind === 'episode_tag') {
    rewriteEpisodeTagsInEventsAndEpisodes(fromLabel, toLabel);
    return;
  }
  rewriteVisibilityGroupsInProfiles(fromLabel, toLabel);
};

const extractDistinctEpisodeTags = (): string[] => {
  const set = new Set<string>();
  const eventRows = db.getAllSync<{ episode_tag: string | null }>(
    `SELECT episode_tag FROM ${EVENTS_TABLE} WHERE episode_tag IS NOT NULL AND TRIM(episode_tag) != '';`
  );
  eventRows.forEach((row) => {
    const tag = normalizeEpisodeTag(row.episode_tag);
    if (tag) {
      set.add(tag);
    }
  });
  const profileRows = db.getAllSync<{ episodes: string }>(`SELECT episodes FROM ${PROFILES_TABLE};`);
  profileRows.forEach((row) => {
    fromEpisodeJson(row.episodes).forEach((episode) => {
      const tag = normalizeEpisodeTag(episode.tag);
      if (tag) {
        set.add(tag);
      }
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
};

const rewriteVisibilityGroupsInProfiles = (fromLabel: string, toLabel: string | null): void => {
  const rows = db.getAllSync<{ id: string; episodes: string }>(`SELECT id, episodes FROM ${PROFILES_TABLE};`);
  const timestamp = nowIso();
  rows.forEach((row) => {
    const episodes = fromEpisodeJson(row.episodes);
    let changed = false;
    const nextEpisodes = episodes.map((episode) => {
      let episodeChanged = false;
      const nextVisibilityEntries = (episode.visibilityEntries ?? [])
        .map((entry) => {
          if (entry.kind !== 'group' || entry.value !== fromLabel) {
            return entry;
          }
          episodeChanged = true;
          if (toLabel && toLabel.length > 0) {
            return { kind: 'group' as const, value: toLabel };
          }
          return null;
        })
        .filter((entry): entry is EpisodeVisibilityEntry => entry !== null);
      if (!episodeChanged) {
        return episode;
      }
      changed = true;
      return {
        ...episode,
        visibilityEntries: uniqueVisibilityEntries(nextVisibilityEntries),
      };
    });
    if (!changed) {
      return;
    }
    db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
      toEpisodeJson(nextEpisodes),
      timestamp,
      row.id,
    ]);
  });
};

const getUsedCommonItemLabels = (kind: CommonItemKind): string[] => {
  if (kind === 'affiliation') return extractDistinctFromProfilesJsonArrayColumn('affiliations');
  if (kind === 'experience') return extractDistinctFromProfilesJsonArrayColumn('experiences');
  if (kind === 'personality') return extractDistinctFromProfilesJsonArrayColumn('personalities');
  if (kind === 'like') return extractDistinctFromProfilesJsonArrayColumn('likes');
  if (kind === 'dislike') return extractDistinctFromProfilesJsonArrayColumn('dislikes');
  if (kind === 'episode_tag') return extractDistinctEpisodeTags();
  return extractDistinctVisibilityGroupsFromProfiles();
};

export const getDistinctAffiliations = (): string[] => extractDistinctFromProfilesJsonArrayColumn('affiliations');

export const getDistinctExperiences = (): string[] => extractDistinctFromProfilesJsonArrayColumn('experiences');

export const getDistinctPersonalities = (): string[] => extractDistinctFromProfilesJsonArrayColumn('personalities');

export const getDistinctVisibilityGroups = (): string[] => extractDistinctVisibilityGroupsFromProfiles();

export const getMergedEpisodeTagLabels = (): string[] => getMergedCommonItemLabels('episode_tag');

export const getCommonItemOptions = (kind: CommonItemKind): CommonItemOption[] => {
  const rows = db.getAllSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? ORDER BY label COLLATE NOCASE ASC;`,
    [kind]
  );
  return rows.map(rowToCommonItemOption);
};

export const getMergedCommonItemLabels = (kind: CommonItemKind): string[] => {
  const options = getCommonItemOptions(kind).map((item) => item.label);
  const used = getUsedCommonItemLabels(kind);
  return mergeUniqueLabels(options, used);
};

export const addCommonItemOption = (kind: CommonItemKind, label: string): CommonItemOption | null => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized) {
    return null;
  }
  const existing = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, normalized]
  );
  if (existing) {
    return rowToCommonItemOption(existing);
  }
  const now = nowIso();
  const id = uuidv4();
  db.runSync(
    `INSERT INTO ${COMMON_ITEM_OPTIONS_TABLE} (id, kind, label, members, createdAt, updatedAt) VALUES (?, ?, ?, '[]', ?, ?);`,
    [id, kind, normalized, now, now]
  );
  return { id, kind, label: normalized, members: [], createdAt: now, updatedAt: now };
};

export const updateCommonItemOption = (id: string, label: string): boolean => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized) {
    return false;
  }
  const target = db.getFirstSync<CommonItemOptionRow>(`SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE id = ? LIMIT 1;`, [id]);
  if (!target) {
    return false;
  }
  if (target.label === normalized) {
    return true;
  }
  const duplicate = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? AND id != ? LIMIT 1;`,
    [target.kind, normalized, id]
  );
  if (duplicate) {
    return false;
  }

  const column = getProfileColumnByKind(target.kind);
  if (column) {
    rewriteProfileArrayColumnValue(column, target.label, normalized);
  } else {
    applyCommonItemLabelRewrite(target.kind, target.label, normalized);
  }

  db.runSync(`UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET label = ?, updatedAt = ? WHERE id = ?;`, [normalized, nowIso(), id]);
  return true;
};

export const deleteCommonItemOption = (id: string): boolean => {
  const target = db.getFirstSync<CommonItemOptionRow>(`SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE id = ? LIMIT 1;`, [id]);
  if (!target) {
    return false;
  }

  applyCommonItemLabelRewrite(target.kind, target.label, null);

  const result = db.runSync(`DELETE FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE id = ?;`, [id]);
  return result.changes > 0;
};

export const renameCommonItemLabel = (kind: CommonItemKind, fromLabel: string, toLabel: string): boolean => {
  const from = normalizeCommonLabel(fromLabel);
  const to = normalizeCommonLabel(toLabel);
  if (!from || !to) {
    return false;
  }
  if (from === to) {
    return true;
  }

  applyCommonItemLabelRewrite(kind, from, to);

  const existingOption = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, from]
  );
  if (existingOption) {
    const duplicated = db.getFirstSync<{ id: string }>(
      `SELECT id FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? AND id != ? LIMIT 1;`,
      [kind, to, existingOption.id]
    );
    if (!duplicated) {
      db.runSync(`UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET label = ?, updatedAt = ? WHERE id = ?;`, [to, nowIso(), existingOption.id]);
    }
  }
  return true;
};

export const removeCommonItemLabel = (kind: CommonItemKind, label: string): boolean => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized) {
    return false;
  }

  applyCommonItemLabelRewrite(kind, normalized, null);

  db.runSync(`DELETE FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ?;`, [kind, normalized]);
  return true;
};

const addLabelToProfilesByFriendIds = (
  columnName: ProfileArrayColumn,
  label: string,
  friendIds: string[]
): void => {
  if (friendIds.length === 0) return;
  const placeholders = friendIds.map(() => '?').join(',');
  const rows = db.getAllSync<{ id: string; value: string }>(
    `SELECT id, ${columnName} as value FROM ${PROFILES_TABLE} WHERE friendId IN (${placeholders}) AND isDefault = 1;`,
    friendIds
  );
  const timestamp = nowIso();
  rows.forEach((row) => {
    const current = fromJson(row.value);
    if (current.includes(label)) return;
    current.push(label);
    db.runSync(`UPDATE ${PROFILES_TABLE} SET ${columnName} = ?, updatedAt = ? WHERE id = ?;`, [
      toJson(current),
      timestamp,
      row.id,
    ]);
  });
};

const removeLabelFromProfilesByFriendIds = (
  columnName: ProfileArrayColumn,
  label: string,
  friendIds: string[]
): void => {
  if (friendIds.length === 0) return;
  const placeholders = friendIds.map(() => '?').join(',');
  const rows = db.getAllSync<{ id: string; value: string }>(
    `SELECT id, ${columnName} as value FROM ${PROFILES_TABLE} WHERE friendId IN (${placeholders}) AND isDefault = 1;`,
    friendIds
  );
  const timestamp = nowIso();
  rows.forEach((row) => {
    const current = fromJson(row.value);
    const next = current.filter((v) => v !== label);
    if (next.length === current.length) return;
    db.runSync(`UPDATE ${PROFILES_TABLE} SET ${columnName} = ?, updatedAt = ? WHERE id = ?;`, [
      toJson(next),
      timestamp,
      row.id,
    ]);
  });
};

export const getCommonItemOptionByKindAndLabel = (kind: CommonItemKind, label: string): CommonItemOption | null => {
  const row = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, label]
  );
  return row ? rowToCommonItemOption(row) : null;
};

export const createGroupOption = (
  kind: CommonItemKind,
  label: string,
  memberIds: string[]
): CommonItemOption | null => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized) return null;
  const existing = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, normalized]
  );
  if (existing) return null;

  const now = nowIso();
  const id = uuidv4();
  const uniqueMembers = Array.from(new Set(memberIds));
  db.runSync(
    `INSERT INTO ${COMMON_ITEM_OPTIONS_TABLE} (id, kind, label, members, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?);`,
    [id, kind, normalized, toJson(uniqueMembers), now, now]
  );

  const column = getProfileColumnByKind(kind);
  if (column && uniqueMembers.length > 0) {
    addLabelToProfilesByFriendIds(column, normalized, uniqueMembers);
  }

  return { id, kind, label: normalized, members: uniqueMembers, createdAt: now, updatedAt: now };
};

export const updateGroupOption = (
  id: string,
  label: string,
  memberIds: string[]
): boolean => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized) return false;

  const target = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE id = ? LIMIT 1;`,
    [id]
  );
  if (!target) return false;

  const duplicate = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? AND id != ? LIMIT 1;`,
    [target.kind, normalized, id]
  );
  if (duplicate) return false;

  const oldLabel = target.label;
  const oldMembers = fromJson(target.members ?? '[]');
  const newMembers = Array.from(new Set(memberIds));
  const labelChanged = oldLabel !== normalized;

  const column = getProfileColumnByKind(target.kind);
  if (column) {
    if (labelChanged) {
      removeLabelFromProfilesByFriendIds(column, oldLabel, oldMembers);
      if (newMembers.length > 0) {
        addLabelToProfilesByFriendIds(column, normalized, newMembers);
      }
      rewriteVisibilityGroupsInProfiles(oldLabel, normalized);
    } else {
      const oldSet = new Set(oldMembers);
      const newSet = new Set(newMembers);
      const added = newMembers.filter((id) => !oldSet.has(id));
      const removed = oldMembers.filter((id) => !newSet.has(id));
      if (added.length > 0) addLabelToProfilesByFriendIds(column, normalized, added);
      if (removed.length > 0) removeLabelFromProfilesByFriendIds(column, normalized, removed);
    }
  } else if (labelChanged) {
    rewriteVisibilityGroupsInProfiles(oldLabel, normalized);
  }

  db.runSync(
    `UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET label = ?, members = ?, updatedAt = ? WHERE id = ?;`,
    [normalized, toJson(newMembers), nowIso(), id]
  );
  return true;
};

const normalizeEventInput = (input: EventInput): Omit<Event, 'id' | 'createdAt' | 'updatedAt'> => ({
  title: input.title.trim(),
  startAt: input.startAt.trim(),
  endAt: input.endAt?.trim() ? input.endAt.trim() : null,
  allDay: Boolean(input.allDay),
  memo: input.memo?.trim() ? input.memo.trim() : null,
  notifyAt: input.notifyAt?.trim() ? input.notifyAt.trim() : null,
  notifyEnabled: Boolean(input.notifyEnabled),
  notificationId: null,
  autoEpisodeCreated: input.autoEpisodeCreated === true,
  episodeTag: normalizeEpisodeTag(input.episodeTag),
});

export const createEvent = (input: EventInput): Event | null => {
  const normalized = normalizeEventInput(input);
  if (!normalized.title || !normalized.startAt) {
    return null;
  }

  const id = uuidv4();
  const timestamp = nowIso();
  db.runSync(
    `INSERT INTO ${EVENTS_TABLE} (
      id, title, start_at, end_at, all_day, memo, notify_at, notify_enabled, notification_id, auto_episode_created, episode_tag, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      normalized.title,
      normalized.startAt,
      normalized.endAt,
      normalized.allDay ? 1 : 0,
      normalized.memo,
      normalized.notifyAt,
      normalized.notifyEnabled ? 1 : 0,
      null,
      normalized.autoEpisodeCreated ? 1 : 0,
      normalized.episodeTag,
      timestamp,
      timestamp,
    ]
  );

  return {
    id,
    ...normalized,
    notificationId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const getEvent = (eventId: string): Event | null => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return null;
  }
  const row = db.getFirstSync<EventRow>(`SELECT * FROM ${EVENTS_TABLE} WHERE id = ? LIMIT 1;`, [
    normalizedEventId,
  ]);
  return row ? rowToEvent(row) : null;
};

export const getEventsByDateRange = (rangeStartAt: string, rangeEndAt: string): Event[] => {
  const start = rangeStartAt.trim();
  const end = rangeEndAt.trim();
  if (!start || !end) {
    return [];
  }
  const rows = db.getAllSync<EventRow>(
    `SELECT * FROM ${EVENTS_TABLE}
     WHERE start_at < ?
       AND COALESCE(end_at, start_at) >= ?
     ORDER BY start_at ASC, title COLLATE NOCASE ASC;`,
    [end, start]
  );
  return rows.map(rowToEvent);
};

export const getPastEvents = (nowIso: string): Event[] => {
  const now = nowIso.trim();
  if (!now) {
    return [];
  }
  const rows = db.getAllSync<EventRow>(
    `SELECT * FROM ${EVENTS_TABLE} WHERE start_at < ? ORDER BY start_at DESC, title COLLATE NOCASE ASC;`,
    [now]
  );
  return rows.map(rowToEvent);
};

export const getPastEventsPendingEpisodeConversion = (nowIso: string): Event[] => {
  const now = nowIso.trim();
  if (!now) {
    return [];
  }
  const rows = db.getAllSync<EventRow>(
    `SELECT e.* FROM ${EVENTS_TABLE} e
     WHERE e.start_at < ?
       AND e.auto_episode_created = 0
       AND EXISTS (
         SELECT 1 FROM ${EVENT_PARTICIPANTS_TABLE} p WHERE p.event_id = e.id
       )
     ORDER BY e.start_at ASC;`,
    [now]
  );
  return rows.map(rowToEvent);
};

export const updateEvent = (eventId: string, input: EventInput): boolean => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return false;
  }
  const existing = getEvent(normalizedEventId);
  if (!existing) {
    return false;
  }

  const normalized = normalizeEventInput(input);
  if (!normalized.title || !normalized.startAt) {
    return false;
  }

  const timestamp = nowIso();
  const result = db.runSync(
    `UPDATE ${EVENTS_TABLE}
     SET title = ?, start_at = ?, end_at = ?, all_day = ?, memo = ?, notify_at = ?, notify_enabled = ?, episode_tag = ?, updated_at = ?
     WHERE id = ?;`,
    [
      normalized.title,
      normalized.startAt,
      normalized.endAt,
      normalized.allDay ? 1 : 0,
      normalized.memo,
      normalized.notifyAt,
      normalized.notifyEnabled ? 1 : 0,
      normalized.episodeTag,
      timestamp,
      normalizedEventId,
    ]
  );
  return result.changes > 0;
};

export const updateEventNotificationId = (eventId: string, notificationId: string | null): boolean => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return false;
  }
  const result = db.runSync(
    `UPDATE ${EVENTS_TABLE} SET notification_id = ?, updated_at = ? WHERE id = ?;`,
    [notificationId, nowIso(), normalizedEventId]
  );
  return result.changes > 0;
};

export const deleteEvent = (eventId: string): boolean => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return false;
  }

  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(`DELETE FROM ${EVENT_PARTICIPANTS_TABLE} WHERE event_id = ?;`, [normalizedEventId]);
    const result = db.runSync(`DELETE FROM ${EVENTS_TABLE} WHERE id = ?;`, [normalizedEventId]);
    db.execSync('COMMIT;');
    return result.changes > 0;
  } catch {
    db.execSync('ROLLBACK;');
    throw new Error('FriendDex: 予定の削除に失敗しました');
  }
};

export const addEventParticipant = (eventId: string, profileId: string): EventParticipant | null => {
  const normalizedEventId = eventId.trim();
  const normalizedProfileId = profileId.trim();
  if (!normalizedEventId || !normalizedProfileId) {
    return null;
  }
  if (!getEvent(normalizedEventId)) {
    return null;
  }
  const profile = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${PROFILES_TABLE} WHERE id = ? LIMIT 1;`,
    [normalizedProfileId]
  );
  if (!profile) {
    return null;
  }

  const timestamp = nowIso();
  db.runSync(
    `INSERT OR IGNORE INTO ${EVENT_PARTICIPANTS_TABLE} (event_id, profile_id, created_at) VALUES (?, ?, ?);`,
    [normalizedEventId, normalizedProfileId, timestamp]
  );
  const row = db.getFirstSync<EventParticipantRow>(
    `SELECT * FROM ${EVENT_PARTICIPANTS_TABLE} WHERE event_id = ? AND profile_id = ? LIMIT 1;`,
    [normalizedEventId, normalizedProfileId]
  );
  return row ? rowToEventParticipant(row) : null;
};

export const removeEventParticipant = (eventId: string, profileId: string): boolean => {
  const normalizedEventId = eventId.trim();
  const normalizedProfileId = profileId.trim();
  if (!normalizedEventId || !normalizedProfileId) {
    return false;
  }
  const result = db.runSync(
    `DELETE FROM ${EVENT_PARTICIPANTS_TABLE} WHERE event_id = ? AND profile_id = ?;`,
    [normalizedEventId, normalizedProfileId]
  );
  return result.changes > 0;
};

export const getEventParticipants = (eventId: string): EventParticipant[] => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return [];
  }
  const rows = db.getAllSync<EventParticipantRow>(
    `SELECT * FROM ${EVENT_PARTICIPANTS_TABLE} WHERE event_id = ? ORDER BY created_at ASC;`,
    [normalizedEventId]
  );
  return rows.map(rowToEventParticipant);
};

export const getEventParticipantsForEvents = (eventIds: string[]): Map<string, EventParticipant[]> => {
  const normalizedEventIds = Array.from(new Set(eventIds.map((eventId) => eventId.trim()).filter(Boolean)));
  const map = new Map<string, EventParticipant[]>();
  if (normalizedEventIds.length === 0) {
    return map;
  }

  const placeholders = normalizedEventIds.map(() => '?').join(', ');
  const rows = db.getAllSync<EventParticipantRow>(
    `SELECT * FROM ${EVENT_PARTICIPANTS_TABLE} WHERE event_id IN (${placeholders}) ORDER BY created_at ASC;`,
    normalizedEventIds
  );

  rows.forEach((row) => {
    const participant = rowToEventParticipant(row);
    const current = map.get(participant.eventId) ?? [];
    current.push(participant);
    map.set(participant.eventId, current);
  });

  return map;
};

const rowToMoneyLoanSession = (row: MoneyLoanSessionRow): MoneyLoanSession => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
});

const rowToMoneyLoan = (row: MoneyLoanRow): MoneyLoan => ({
  id: row.id,
  sessionId: row.session_id,
  groupId: row.group_id,
  counterpartyKind: row.counterparty_kind,
  counterpartyValue: row.counterparty_value,
  amount: row.amount,
  direction: row.direction,
  memo: row.memo,
  isRepaid: row.is_repaid === 1,
  createdAt: row.created_at,
});

const sanitizeMoneyLoanDirection = (value: string): MoneyLoanDirection | null =>
  value === 'lent' || value === 'borrowed' ? value : null;

export const getMoneyLoanSessions = (): MoneyLoanSession[] => {
  const rows = db.getAllSync<MoneyLoanSessionRow>(
    `SELECT * FROM ${MONEY_LOAN_SESSIONS_TABLE} ORDER BY created_at DESC;`
  );
  return rows.map(rowToMoneyLoanSession);
};

export const getMoneyLoanSession = (sessionId: string): MoneyLoanSession | null => {
  const normalizedId = sessionId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<MoneyLoanSessionRow>(
    `SELECT * FROM ${MONEY_LOAN_SESSIONS_TABLE} WHERE id = ?;`,
    [normalizedId]
  );
  return row ? rowToMoneyLoanSession(row) : null;
};

export const createMoneyLoanSession = (title: string): MoneyLoanSession | null => {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return null;
  }
  const session: MoneyLoanSession = {
    id: uuidv4(),
    title: normalizedTitle,
    createdAt: nowIso(),
  };
  db.runSync(`INSERT INTO ${MONEY_LOAN_SESSIONS_TABLE} (id, title, created_at) VALUES (?, ?, ?);`, [
    session.id,
    session.title,
    session.createdAt,
  ]);
  return session;
};

export const updateMoneyLoanSessionTitle = (sessionId: string, title: string): boolean => {
  const normalizedId = sessionId.trim();
  const normalizedTitle = title.trim();
  if (!normalizedId || !normalizedTitle) {
    return false;
  }
  const result = db.runSync(`UPDATE ${MONEY_LOAN_SESSIONS_TABLE} SET title = ? WHERE id = ?;`, [
    normalizedTitle,
    normalizedId,
  ]);
  return result.changes > 0;
};

export const deleteMoneyLoanSession = (sessionId: string): boolean => {
  const normalizedId = sessionId.trim();
  if (!normalizedId) {
    return false;
  }
  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(`DELETE FROM ${MONEY_LOANS_TABLE} WHERE session_id = ?;`, [normalizedId]);
    const result = db.runSync(`DELETE FROM ${MONEY_LOAN_SESSIONS_TABLE} WHERE id = ?;`, [normalizedId]);
    db.execSync('COMMIT;');
    return result.changes > 0;
  } catch {
    db.execSync('ROLLBACK;');
    return false;
  }
};

export const getMoneyLoans = (): MoneyLoan[] => {
  const rows = db.getAllSync<MoneyLoanRow>(
    `SELECT * FROM ${MONEY_LOANS_TABLE} ORDER BY is_repaid ASC, created_at DESC;`
  );
  return rows.map(rowToMoneyLoan);
};

export const getMoneyLoansBySessionId = (sessionId: string): MoneyLoan[] => {
  const normalizedId = sessionId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<MoneyLoanRow>(
    `SELECT * FROM ${MONEY_LOANS_TABLE} WHERE session_id = ? ORDER BY created_at DESC, is_repaid ASC;`,
    [normalizedId]
  );
  return rows.map(rowToMoneyLoan);
};

export const getOrCreateMoneyLoanSessionByTitle = (title: string): MoneyLoanSession | null => {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return null;
  }
  const existing = db.getFirstSync<MoneyLoanSessionRow>(
    `SELECT * FROM ${MONEY_LOAN_SESSIONS_TABLE} WHERE title = ? COLLATE NOCASE ORDER BY created_at ASC LIMIT 1;`,
    [normalizedTitle]
  );
  if (existing) {
    return rowToMoneyLoanSession(existing);
  }
  return createMoneyLoanSession(normalizedTitle);
};

export const createMoneyLoans = (input: CreateMoneyLoansInput): MoneyLoan[] => {
  const sessionId = input.sessionId.trim();
  const lines = input.lines
    .map((line) => ({
      kind: line.kind,
      value: line.value.trim(),
      amount: Math.floor(line.amount),
      direction: sanitizeMoneyLoanDirection(line.direction),
    }))
    .filter(
      (line): line is CreateMoneyLoanLineInput & { direction: MoneyLoanDirection } =>
        line.value.length > 0 && line.amount > 0 && line.direction !== null
    );
  if (!sessionId || !getMoneyLoanSession(sessionId) || lines.length === 0) {
    return [];
  }

  const groupId = uuidv4();
  const timestamp = nowIso();
  const memo = input.memo?.trim() ?? '';
  const created: MoneyLoan[] = [];

  db.execSync('BEGIN IMMEDIATE;');
  try {
    lines.forEach((line) => {
      const id = uuidv4();
      db.runSync(
        `INSERT INTO ${MONEY_LOANS_TABLE} (
          id, session_id, group_id, counterparty_kind, counterparty_value, amount, direction, memo, is_repaid, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?);`,
        [
          id,
          sessionId,
          groupId,
          line.kind,
          line.value,
          line.amount,
          line.direction,
          memo,
          timestamp,
        ]
      );
      created.push({
        id,
        sessionId,
        groupId,
        counterpartyKind: line.kind,
        counterpartyValue: line.value,
        amount: line.amount,
        direction: line.direction,
        memo,
        isRepaid: false,
        createdAt: timestamp,
      });
    });
    db.execSync('COMMIT;');
  } catch {
    db.execSync('ROLLBACK;');
    throw new Error('FriendDex: 貸し借りの登録に失敗しました');
  }

  return created;
};

export const replaceMoneyLoanGroup = (
  groupId: string,
  sessionId: string,
  lines: CreateMoneyLoanLineInput[],
  memo?: string
): boolean => {
  const normalizedGroupId = groupId.trim();
  const normalizedSessionId = sessionId.trim();
  const normalizedLines = lines
    .map((line) => ({
      kind: line.kind,
      value: line.value.trim(),
      amount: Math.floor(line.amount),
      direction: sanitizeMoneyLoanDirection(line.direction),
    }))
    .filter(
      (line): line is CreateMoneyLoanLineInput & { direction: MoneyLoanDirection } =>
        line.value.length > 0 && line.amount > 0 && line.direction !== null
    );

  if (!normalizedGroupId || !normalizedSessionId || normalizedLines.length === 0) {
    return false;
  }

  const existingRows = db.getAllSync<MoneyLoanRow>(
    `SELECT * FROM ${MONEY_LOANS_TABLE} WHERE group_id = ?;`,
    [normalizedGroupId]
  );
  if (
    existingRows.length === 0 ||
    existingRows.some((row) => row.is_repaid === 1) ||
    existingRows[0].session_id !== normalizedSessionId
  ) {
    return false;
  }

  const createdAt = existingRows[0].created_at;
  const memoValue = memo?.trim() ?? existingRows[0].memo;

  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(`DELETE FROM ${MONEY_LOANS_TABLE} WHERE group_id = ?;`, [normalizedGroupId]);
    normalizedLines.forEach((line) => {
      db.runSync(
        `INSERT INTO ${MONEY_LOANS_TABLE} (
          id, session_id, group_id, counterparty_kind, counterparty_value, amount, direction, memo, is_repaid, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?);`,
        [
          uuidv4(),
          normalizedSessionId,
          normalizedGroupId,
          line.kind,
          line.value,
          line.amount,
          line.direction,
          memoValue,
          createdAt,
        ]
      );
    });
    db.execSync('COMMIT;');
    return true;
  } catch {
    db.execSync('ROLLBACK;');
    return false;
  }
};

export const setMoneyLoanRepaid = (loanId: string, isRepaid: boolean): boolean => {
  const normalizedId = loanId.trim();
  if (!normalizedId) {
    return false;
  }
  const result = db.runSync(`UPDATE ${MONEY_LOANS_TABLE} SET is_repaid = ? WHERE id = ?;`, [
    isRepaid ? 1 : 0,
    normalizedId,
  ]);
  return result.changes > 0;
};

export const deleteMoneyLoan = (loanId: string): boolean => {
  const normalizedId = loanId.trim();
  if (!normalizedId) {
    return false;
  }
  const result = db.runSync(`DELETE FROM ${MONEY_LOANS_TABLE} WHERE id = ?;`, [normalizedId]);
  return result.changes > 0;
};

export const deleteMoneyLoansByGroupId = (groupId: string): boolean => {
  const normalizedGroupId = groupId.trim();
  if (!normalizedGroupId) {
    return false;
  }
  const result = db.runSync(`DELETE FROM ${MONEY_LOANS_TABLE} WHERE group_id = ?;`, [normalizedGroupId]);
  return result.changes > 0;
};

const rowToShufflePool = (row: ShufflePoolRow): ShufflePool => ({
  id: row.id,
  label: row.label,
  labelIsCustom: row.label_is_custom === 1,
  memberIds: fromJson(row.member_ids),
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

export const getShufflePools = (): ShufflePool[] => {
  const rows = db.getAllSync<ShufflePoolRow>(
    `SELECT * FROM ${SHUFFLE_POOLS_TABLE} ORDER BY last_used_at DESC;`
  );
  return rows.map(rowToShufflePool);
};

export const getShufflePool = (poolId: string): ShufflePool | null => {
  const normalizedId = poolId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<ShufflePoolRow>(`SELECT * FROM ${SHUFFLE_POOLS_TABLE} WHERE id = ?;`, [
    normalizedId,
  ]);
  return row ? rowToShufflePool(row) : null;
};

export const upsertShufflePoolByMembers = (memberIds: string[]): ShufflePool | null => {
  const normalizedMemberIds = normalizeShuffleMemberIds(memberIds);
  if (normalizedMemberIds.length === 0) {
    return null;
  }
  const memberSetKey = buildShuffleMemberSetKey(normalizedMemberIds);
  const timestamp = nowIso();
  const nameById = new Map(getAllFriends().map((friend) => [friend.id, friend.name]));

  const existing = db.getFirstSync<ShufflePoolRow>(
    `SELECT * FROM ${SHUFFLE_POOLS_TABLE} WHERE member_set_key = ?;`,
    [memberSetKey]
  );
  if (existing) {
    db.runSync(`UPDATE ${SHUFFLE_POOLS_TABLE} SET last_used_at = ? WHERE id = ?;`, [timestamp, existing.id]);
    return { ...rowToShufflePool(existing), lastUsedAt: timestamp };
  }

  const pool: ShufflePool = {
    id: uuidv4(),
    label: buildDefaultShufflePoolLabel(normalizedMemberIds, nameById),
    labelIsCustom: false,
    memberIds: normalizedMemberIds,
    createdAt: timestamp,
    lastUsedAt: timestamp,
  };
  db.runSync(
    `INSERT INTO ${SHUFFLE_POOLS_TABLE} (
      id, label, label_is_custom, member_ids, member_set_key, created_at, last_used_at
    ) VALUES (?, ?, 0, ?, ?, ?, ?);`,
    [
      pool.id,
      pool.label,
      toJson(pool.memberIds),
      memberSetKey,
      pool.createdAt,
      pool.lastUsedAt,
    ]
  );
  return pool;
};

export const touchShufflePool = (poolId: string): boolean => {
  const normalizedId = poolId.trim();
  if (!normalizedId) {
    return false;
  }
  const result = db.runSync(`UPDATE ${SHUFFLE_POOLS_TABLE} SET last_used_at = ? WHERE id = ?;`, [
    nowIso(),
    normalizedId,
  ]);
  return result.changes > 0;
};

export const updateShufflePoolLabel = (poolId: string, label: string): boolean => {
  const normalizedId = poolId.trim();
  const normalizedLabel = label.trim();
  if (!normalizedId || !normalizedLabel) {
    return false;
  }
  const result = db.runSync(
    `UPDATE ${SHUFFLE_POOLS_TABLE} SET label = ?, label_is_custom = 1 WHERE id = ?;`,
    [normalizedLabel, normalizedId]
  );
  return result.changes > 0;
};

export const updateShufflePoolMembers = (poolId: string, memberIds: string[]): ShufflePool | null => {
  const normalizedId = poolId.trim();
  const normalizedMemberIds = normalizeShuffleMemberIds(memberIds);
  if (!normalizedId || normalizedMemberIds.length === 0) {
    return null;
  }
  const existing = db.getFirstSync<ShufflePoolRow>(`SELECT * FROM ${SHUFFLE_POOLS_TABLE} WHERE id = ?;`, [
    normalizedId,
  ]);
  if (!existing) {
    return null;
  }

  const memberSetKey = buildShuffleMemberSetKey(normalizedMemberIds);
  const duplicate = db.getFirstSync<ShufflePoolRow>(
    `SELECT * FROM ${SHUFFLE_POOLS_TABLE} WHERE member_set_key = ? AND id != ?;`,
    [memberSetKey, normalizedId]
  );
  if (duplicate) {
    return null;
  }

  const nameById = new Map(getAllFriends().map((friend) => [friend.id, friend.name]));
  const label = existing.label_is_custom === 1
    ? existing.label
    : buildDefaultShufflePoolLabel(normalizedMemberIds, nameById);
  const timestamp = nowIso();

  db.runSync(
    `UPDATE ${SHUFFLE_POOLS_TABLE}
     SET member_ids = ?, member_set_key = ?, label = ?, last_used_at = ?
     WHERE id = ?;`,
    [toJson(normalizedMemberIds), memberSetKey, label, timestamp, normalizedId]
  );
  return getShufflePool(normalizedId);
};

export const deleteShufflePool = (poolId: string): boolean => {
  const normalizedId = poolId.trim();
  if (!normalizedId) {
    return false;
  }
  const result = db.runSync(`DELETE FROM ${SHUFFLE_POOLS_TABLE} WHERE id = ?;`, [normalizedId]);
  return result.changes > 0;
};

const BACKUP_TABLE_SQL: Record<FriendDexBackupTableName, string> = {
  friend_profiles: PROFILES_TABLE,
  app_settings: SETTINGS_TABLE,
  common_item_options: COMMON_ITEM_OPTIONS_TABLE,
  episode_photos: EPISODE_PHOTOS_TABLE,
  events: EVENTS_TABLE,
  event_participants: EVENT_PARTICIPANTS_TABLE,
};

const toBackupRow = (row: Record<string, unknown>): FriendDexBackupRow => {
  const backupRow: FriendDexBackupRow = {};
  Object.entries(row).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || value === null) {
      backupRow[key] = value;
    }
  });
  return backupRow;
};

export const createBackupPayload = (): FriendDexBackup => {
  return {
    version: 4,
    exportedAt: nowIso(),
    tables: {
      friend_profiles: db
        .getAllSync<Record<string, unknown>>(`SELECT * FROM ${PROFILES_TABLE};`)
        .map(toBackupRow),
      app_settings: db
        .getAllSync<Record<string, unknown>>(`SELECT * FROM ${SETTINGS_TABLE};`)
        .map(toBackupRow),
      common_item_options: db
        .getAllSync<Record<string, unknown>>(`SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE};`)
        .map(toBackupRow),
      episode_photos: db
        .getAllSync<Record<string, unknown>>(`SELECT * FROM ${EPISODE_PHOTOS_TABLE};`)
        .map(toBackupRow),
      events: db.getAllSync<Record<string, unknown>>(`SELECT * FROM ${EVENTS_TABLE};`).map(toBackupRow),
      event_participants: db
        .getAllSync<Record<string, unknown>>(`SELECT * FROM ${EVENT_PARTICIPANTS_TABLE};`)
        .map(toBackupRow),
    },
  };
};

const insertOrReplaceBackupRow = (tableName: FriendDexBackupTableName, row: FriendDexBackupRow): void => {
  const sqlTable = BACKUP_TABLE_SQL[tableName];
  const columns = Object.keys(row);
  if (columns.length === 0) {
    return;
  }
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((column) => row[column]);
  db.runSync(
    `INSERT OR REPLACE INTO ${sqlTable} (${columns.join(', ')}) VALUES (${placeholders});`,
    values
  );
};

export const importBackupPayload = (payload: FriendDexBackup): void => {
  db.execSync('BEGIN IMMEDIATE;');
  try {
    FRIENDDEX_BACKUP_TABLE_NAMES.forEach((tableName) => {
      db.execSync(`DELETE FROM ${BACKUP_TABLE_SQL[tableName]};`);
      const rows = payload.tables[tableName];
      if (rows) {
        rows.forEach((row) => {
          insertOrReplaceBackupRow(tableName, row);
        });
      }
    });
    db.execSync('COMMIT;');
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
};

