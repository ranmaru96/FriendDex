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
  Task,
  TaskCompletion,
  TaskGroup,
  TaskGroupInput,
  TaskInput,
  TaskKind,
  TaskPace,
  TASK_GROUP_MEMBER_LIMIT,
  CompletedTaskRetention,
  Relationship,
  RelationshipArrowStyle,
  RelationshipEndpointType,
  RelationshipGroup,
  RelationshipGroupInput,
  RelationshipGroupMember,
  RelationshipInput,
  RelationshipMap,
  RelationshipMapInput,
  RelationshipMapMember,
  RelationshipMapMemberInput,
  YourQuestion,
  YourQuestionAnswer,
  YourQuestionAnswerInput,
  YourQuestionInput,
  WishlistItem,
  WishlistItemInput,
  WishlistKind,
} from './types';
import { deletePersistedImages } from './utils/persistImageFile';
import { normalizeEpisodeTag, normalizeEpisodeTime, compareEpisodesByEventDateTime } from './utils/episodeHelpers';
import { buildDefaultShufflePoolLabel, buildShuffleMemberSetKey, normalizeShuffleMemberIds } from './utils/shuffleHelpers';
import { retentionToCutoffIso } from './utils/taskHelpers';
import { mergeFriendInputWithPublicFields } from './utils/qrScanHelpers';
import { resolvePersonNameParts } from './utils/personName';
import { normalizeDesignPatternId, type DesignPatternId } from '@/constants/designPatterns';
import type {
  MockSettlementExpense,
  MockSettlementRoom,
} from './types/settlementMock';

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
  familyName?: string | null;
  givenName?: string | null;
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
  color: string | null;
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
const SETTLEMENT_ROOMS_TABLE = 'settlement_rooms';
const SETTLEMENT_MEMBERS_TABLE = 'settlement_members';
const SETTLEMENT_EXPENSES_TABLE = 'settlement_expenses';
const SETTLEMENT_TRANSFER_COMPLETIONS_TABLE = 'settlement_transfer_completions';
const SHUFFLE_POOLS_TABLE = 'shuffle_pools';
const TASKS_TABLE = 'tasks';
const TASK_COMPLETIONS_TABLE = 'task_completions';
const TASK_SOFT_DONES_TABLE = 'task_soft_dones';
const TASK_GROUPS_TABLE = 'task_groups';
const RELATIONSHIP_MAPS_TABLE = 'relationship_maps';
const RELATIONSHIP_MAP_MEMBERS_TABLE = 'relationship_map_members';
const RELATIONSHIP_GROUPS_TABLE = 'relationship_groups';
const RELATIONSHIP_GROUP_MEMBERS_TABLE = 'relationship_group_members';
const RELATIONSHIPS_TABLE = 'relationships';
const YOUR_QUESTIONS_TABLE = 'your_questions';
const YOUR_QUESTION_ANSWERS_TABLE = 'your_question_answers';
const WISHLIST_ITEMS_TABLE = 'wishlist_items';
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
  const time = normalizeEpisodeTime(typeof raw.time === 'string' ? raw.time : null);

  return {
    id: raw.id,
    title: raw.title,
    date: raw.date,
    ...(time ? { time } : {}),
    description: raw.description,
    authorFriendId: typeof raw.authorFriendId === 'string' ? raw.authorFriendId : '',
    visibilityMode: sanitizeVisibilityMode(raw.visibilityMode),
    participantEntries: Array.from(entryMap.values()),
    visibilityEntries: uniqueVisibilityEntries(visibilityEntries),
    ...(eventId ? { eventId } : {}),
    ...(tag ? { tag } : {}),
    isAutoGenerated: raw.isAutoGenerated === true,
    pendingReview: raw.pendingReview === true,
    pendingReviewDismissed: raw.pendingReviewDismissed === true,
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

const namePartsFromRow = (row: Pick<ProfileRow, 'name' | 'familyName' | 'givenName'>) =>
  resolvePersonNameParts({
    familyName: row.familyName,
    givenName: row.givenName,
    name: row.name,
  });

const syncPersonNameForFriend = (
  friendId: string,
  parts: { name: string; familyName: string; givenName: string },
  timestamp: string
): void => {
  db.runSync(
    `UPDATE ${PROFILES_TABLE} SET name = ?, familyName = ?, givenName = ?, updatedAt = ? WHERE friendId = ?;`,
    [parts.name, parts.familyName, parts.givenName, timestamp, friendId]
  );
};

const backfillPersonNameParts = (): void => {
  const rows = db.getAllSync<Pick<ProfileRow, 'id' | 'name' | 'familyName' | 'givenName'>>(
    `SELECT id, name, familyName, givenName FROM ${PROFILES_TABLE}
     WHERE IFNULL(familyName, '') = '' AND IFNULL(givenName, '') = '' AND IFNULL(name, '') != '';`
  );
  rows.forEach((row) => {
    const parts = resolvePersonNameParts({ name: row.name });
    db.runSync(`UPDATE ${PROFILES_TABLE} SET familyName = ?, givenName = ?, name = ? WHERE id = ?;`, [
      parts.familyName,
      parts.givenName,
      parts.name,
      row.id,
    ]);
  });
};

const rowToProfile = (row: ProfileRow): Profile => {
  const nameParts = namePartsFromRow(row);
  return {
    id: row.id,
    friendId: row.friendId,
    name: nameParts.name,
    familyName: nameParts.familyName,
    givenName: nameParts.givenName,
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
  };
};

const rowToCommonItemOption = (row: CommonItemOptionRow): CommonItemOption => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  members: fromJson(row.members ?? '[]'),
  color:
    typeof row.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(row.color.trim())
      ? row.color.trim().toUpperCase()
      : null,
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
    familyName: profile.familyName,
    givenName: profile.givenName,
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

const defaultProfileRowToFriend = (row: ProfileRow): Friend => {
  const nameParts = namePartsFromRow(row);
  return {
    id: row.friendId,
    name: nameParts.name,
    familyName: nameParts.familyName,
    givenName: nameParts.givenName,
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
  };
};

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
      familyName TEXT NOT NULL DEFAULT '',
      givenName TEXT NOT NULL DEFAULT '',
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
      color TEXT,
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

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${SETTLEMENT_ROOMS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${SETTLEMENT_ROOMS_TABLE}_created_at ON ${SETTLEMENT_ROOMS_TABLE}(created_at);`
  );
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${SETTLEMENT_MEMBERS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      ledger_synced INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${SETTLEMENT_MEMBERS_TABLE}_room_id ON ${SETTLEMENT_MEMBERS_TABLE}(room_id);`
  );
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${SETTLEMENT_EXPENSES_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      payer_member_id TEXT NOT NULL,
      title TEXT NOT NULL,
      amount INTEGER NOT NULL,
      split_member_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${SETTLEMENT_EXPENSES_TABLE}_room_id ON ${SETTLEMENT_EXPENSES_TABLE}(room_id);`
  );
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${SETTLEMENT_TRANSFER_COMPLETIONS_TABLE} (
      transfer_key TEXT PRIMARY KEY NOT NULL,
      completed_at TEXT NOT NULL
    );
  `);

  
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${TASKS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      pace TEXT,
      recurrence_unit TEXT,
      recurrence_config TEXT,
      due_date TEXT,
      event_id TEXT,
      group_id TEXT,
      track_completions INTEGER NOT NULL DEFAULT 1,
      remind_enabled INTEGER NOT NULL DEFAULT 0,
      remind_days_before INTEGER,
      remind_time TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_${TASKS_TABLE}_kind ON ${TASKS_TABLE}(kind);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_${TASKS_TABLE}_event_id ON ${TASKS_TABLE}(event_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_${TASKS_TABLE}_completed_at ON ${TASKS_TABLE}(completed_at);`);

  const taskTableInfo = db.getAllSync<{ name: string }>(`PRAGMA table_info(${TASKS_TABLE});`);
  const taskColumns = new Set(taskTableInfo.map((column) => column.name));
  if (!taskColumns.has('memo')) {
    db.execSync(`ALTER TABLE ${TASKS_TABLE} ADD COLUMN memo TEXT NOT NULL DEFAULT '';`);
  }
  if (!taskColumns.has('group_id')) {
    db.execSync(`ALTER TABLE ${TASKS_TABLE} ADD COLUMN group_id TEXT;`);
  }
  if (!taskColumns.has('track_completions')) {
    db.execSync(
      `ALTER TABLE ${TASKS_TABLE} ADD COLUMN track_completions INTEGER NOT NULL DEFAULT 1;`
    );
  }
  if (!taskColumns.has('remind_enabled')) {
    db.execSync(`ALTER TABLE ${TASKS_TABLE} ADD COLUMN remind_enabled INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!taskColumns.has('remind_days_before')) {
    db.execSync(`ALTER TABLE ${TASKS_TABLE} ADD COLUMN remind_days_before INTEGER;`);
  }
  if (!taskColumns.has('remind_time')) {
    db.execSync(`ALTER TABLE ${TASKS_TABLE} ADD COLUMN remind_time TEXT;`);
  }
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_${TASKS_TABLE}_group_id ON ${TASKS_TABLE}(group_id);`);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${TASK_GROUPS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'recurring',
      pace TEXT,
      recurrence_unit TEXT,
      recurrence_config TEXT,
      remind_enabled INTEGER NOT NULL DEFAULT 0,
      remind_time TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const taskGroupTableInfo = db.getAllSync<{ name: string }>(
    `PRAGMA table_info(${TASK_GROUPS_TABLE});`
  );
  const taskGroupColumns = new Set(taskGroupTableInfo.map((column) => column.name));
  if (!taskGroupColumns.has('kind')) {
    db.execSync(
      `ALTER TABLE ${TASK_GROUPS_TABLE} ADD COLUMN kind TEXT NOT NULL DEFAULT 'recurring';`
    );
  }
  if (!taskGroupColumns.has('pace')) {
    db.execSync(`ALTER TABLE ${TASK_GROUPS_TABLE} ADD COLUMN pace TEXT;`);
  }
  if (!taskGroupColumns.has('recurrence_unit')) {
    db.execSync(`ALTER TABLE ${TASK_GROUPS_TABLE} ADD COLUMN recurrence_unit TEXT;`);
  }
  if (!taskGroupColumns.has('recurrence_config')) {
    db.execSync(`ALTER TABLE ${TASK_GROUPS_TABLE} ADD COLUMN recurrence_config TEXT;`);
  }
  if (!taskGroupColumns.has('remind_enabled')) {
    db.execSync(
      `ALTER TABLE ${TASK_GROUPS_TABLE} ADD COLUMN remind_enabled INTEGER NOT NULL DEFAULT 0;`
    );
  }
  if (!taskGroupColumns.has('remind_time')) {
    db.execSync(`ALTER TABLE ${TASK_GROUPS_TABLE} ADD COLUMN remind_time TEXT;`);
  }
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${TASK_GROUPS_TABLE}_kind ON ${TASK_GROUPS_TABLE}(kind);`
  );
  backfillTaskGroupKindsIfNeeded();

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${TASK_COMPLETIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT NOT NULL,
      completed_on TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_${TASK_COMPLETIONS_TABLE}_task_day ON ${TASK_COMPLETIONS_TABLE}(task_id, completed_on);`
  );
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${TASK_COMPLETIONS_TABLE}_task_id ON ${TASK_COMPLETIONS_TABLE}(task_id);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${TASK_SOFT_DONES_TABLE} (
      task_id TEXT NOT NULL,
      done_on TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (task_id, done_on)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${RELATIONSHIP_MAPS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${RELATIONSHIP_MAPS_TABLE}_updated_at ON ${RELATIONSHIP_MAPS_TABLE}(updated_at);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${RELATIONSHIP_MAP_MEMBERS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      map_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      row INTEGER NOT NULL,
      col INTEGER NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${RELATIONSHIP_MAP_MEMBERS_TABLE}_map_id ON ${RELATIONSHIP_MAP_MEMBERS_TABLE}(map_id);`
  );
  db.execSync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_${RELATIONSHIP_MAP_MEMBERS_TABLE}_map_friend ON ${RELATIONSHIP_MAP_MEMBERS_TABLE}(map_id, friend_id);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${RELATIONSHIP_GROUPS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      map_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      parent_group_id TEXT
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${RELATIONSHIP_GROUPS_TABLE}_map_id ON ${RELATIONSHIP_GROUPS_TABLE}(map_id);`
  );
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${RELATIONSHIP_GROUPS_TABLE}_parent ON ${RELATIONSHIP_GROUPS_TABLE}(parent_group_id);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${RELATIONSHIP_GROUP_MEMBERS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      map_member_id TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${RELATIONSHIP_GROUP_MEMBERS_TABLE}_group_id ON ${RELATIONSHIP_GROUP_MEMBERS_TABLE}(group_id);`
  );
  db.execSync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_${RELATIONSHIP_GROUP_MEMBERS_TABLE}_member ON ${RELATIONSHIP_GROUP_MEMBERS_TABLE}(map_member_id);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${RELATIONSHIPS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      map_id TEXT NOT NULL,
      from_type TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_type TEXT NOT NULL,
      to_id TEXT NOT NULL,
      label TEXT,
      style TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${RELATIONSHIPS_TABLE}_map_id ON ${RELATIONSHIPS_TABLE}(map_id);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${YOUR_QUESTIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${YOUR_QUESTIONS_TABLE}_updated_at ON ${YOUR_QUESTIONS_TABLE}(updated_at);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${YOUR_QUESTION_ANSWERS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      question_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${YOUR_QUESTION_ANSWERS_TABLE}_question_id ON ${YOUR_QUESTION_ANSWERS_TABLE}(question_id);`
  );
  db.execSync(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_${YOUR_QUESTION_ANSWERS_TABLE}_question_friend ON ${YOUR_QUESTION_ANSWERS_TABLE}(question_id, friend_id);`
  );

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ${WISHLIST_ITEMS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      purpose_tags TEXT NOT NULL DEFAULT '[]',
      location TEXT,
      cuisine TEXT,
      memo TEXT,
      link TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${WISHLIST_ITEMS_TABLE}_kind ON ${WISHLIST_ITEMS_TABLE}(kind);`
  );
  db.execSync(
    `CREATE INDEX IF NOT EXISTS idx_${WISHLIST_ITEMS_TABLE}_location ON ${WISHLIST_ITEMS_TABLE}(location);`
  );

  const wishlistTableInfo = db.getAllSync<{ name: string }>(
    `PRAGMA table_info(${WISHLIST_ITEMS_TABLE});`
  );
  const wishlistColumns = new Set(wishlistTableInfo.map((column) => column.name));
  if (!wishlistColumns.has('memo')) {
    db.execSync(`ALTER TABLE ${WISHLIST_ITEMS_TABLE} ADD COLUMN memo TEXT;`);
  }
  if (!wishlistColumns.has('link')) {
    db.execSync(`ALTER TABLE ${WISHLIST_ITEMS_TABLE} ADD COLUMN link TEXT;`);
  }

const commonTableInfo = db.getAllSync<{ name: string }>(`PRAGMA table_info(${COMMON_ITEM_OPTIONS_TABLE});`);
  const commonColumns = new Set(commonTableInfo.map((c) => c.name));
  if (!commonColumns.has('members')) {
    db.execSync(`ALTER TABLE ${COMMON_ITEM_OPTIONS_TABLE} ADD COLUMN members TEXT NOT NULL DEFAULT '[]';`);
  }
  if (!commonColumns.has('color')) {
    db.execSync(`ALTER TABLE ${COMMON_ITEM_OPTIONS_TABLE} ADD COLUMN color TEXT;`);
  }

  const profileTableInfo = db.getAllSync<{ name: string }>(`PRAGMA table_info(${PROFILES_TABLE});`);
  const profileColumns = new Set(profileTableInfo.map((column) => column.name));

  /** 既存DB向けの列追加のみ。新列はここに { column, sql } を追記する。 */
  const profileAdditiveMigrations: { column: string; sql: string }[] = [
    { column: 'name', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN name TEXT NOT NULL DEFAULT '';` },
    { column: 'familyName', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN familyName TEXT NOT NULL DEFAULT '';` },
    { column: 'givenName', sql: `ALTER TABLE ${PROFILES_TABLE} ADD COLUMN givenName TEXT NOT NULL DEFAULT '';` },
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

  if (getAppSetting(COMMON_ITEM_MEMBERS_RECONCILED_KEY) !== '1') {
    reconcileAllGroupOptionMembers();
    setAppSetting(COMMON_ITEM_MEMBERS_RECONCILED_KEY, '1');
  }

  backfillPersonNameParts();

  purgeExpiredCompletedTemporaryTasks();
};

const upsertDefaultProfileFromFriend = (friendId: string, input: FriendInput, timestamp: string): void => {
  const nameParts = resolvePersonNameParts(input);
  syncPersonNameForFriend(friendId, nameParts, timestamp);

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
        id, friendId, name, familyName, givenName, authorUserId, source, isDefault, nickname, origin, residence, mbti, birthday, height, weight, category,
        description, photoUri, affiliations, personalities, experiences, traits, likes, dislikes, episodes, sayings, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      uuidv4(),
      friendId,
      nameParts.name,
      nameParts.familyName,
      nameParts.givenName,
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
  const nameParts = resolvePersonNameParts(input);

  db.runSync(
    `
      INSERT INTO ${PROFILES_TABLE} (
        id, friendId, name, familyName, givenName, authorUserId, source, isDefault, nickname, origin, residence, mbti, birthday, height, weight, category,
        description, photoUri, affiliations, personalities, experiences, traits, likes, dislikes, episodes, sayings,
        importSource, scannedUserId, scannedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      profileId,
      personId,
      nameParts.name,
      nameParts.familyName,
      nameParts.givenName,
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

  const created: Friend = {
    id: personId,
    ...input,
    name: nameParts.name,
    familyName: nameParts.familyName,
    givenName: nameParts.givenName,
    episodes: input.episodes ?? [],
    sayings: input.sayings ?? [],
    importSource: 'manual',
    scannedUserId: '',
    scannedAt: '',
  };
  syncFriendGroupLabelsToOptions(personId, null, input);
  return created;
};

export const createFriendFromQrScan = (input: FriendInput, scannedUserId: string): Friend => {
  const personId = uuidv4();
  const profileId = uuidv4();
  const timestamp = nowIso();
  const normalizedUserId = scannedUserId.trim();
  const nameParts = resolvePersonNameParts(input);

  db.runSync(
    `
      INSERT INTO ${PROFILES_TABLE} (
        id, friendId, name, familyName, givenName, authorUserId, source, isDefault, nickname, origin, residence, mbti, birthday, height, weight, category,
        description, photoUri, affiliations, personalities, experiences, traits, likes, dislikes, episodes, sayings,
        importSource, scannedUserId, scannedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      profileId,
      personId,
      nameParts.name,
      nameParts.familyName,
      nameParts.givenName,
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

  const created: Friend = {
    id: personId,
    ...input,
    name: nameParts.name,
    familyName: nameParts.familyName,
    givenName: nameParts.givenName,
    episodes: input.episodes ?? [],
    sayings: input.sayings ?? [],
    importSource: 'qr_scan',
    scannedUserId: normalizedUserId,
    scannedAt: timestamp,
  };
  syncFriendGroupLabelsToOptions(personId, null, input);
  return created;
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
    syncPersonNameForFriend(friendId, resolvePersonNameParts(merged), timestamp);
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
export const APP_THEME_VARIANT_KEY = 'app_theme_variant';
export const DESIGN_PATTERN_KEY = 'design_pattern_id';
export const UI_CALENDAR_EVENT_TIME_DISPLAY_KEY = 'ui_calendar_event_time_display';
export const UI_CALENDAR_EVENT_CARD_STYLE_KEY = 'ui_calendar_event_card_style';
export const UI_EPISODE_LIST_PHOTO_LAYOUT_KEY = 'ui_episode_list_photo_layout';
export const UI_DETAIL_PROFILE_CARD_STYLE_KEY = 'ui_detail_profile_card_style';
export const COMPLETED_TASK_RETENTION_KEY = 'completed_task_retention';

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

export const getDetailDesignVariant = (): 'main' => {
  return 'main';
};

export const setDetailDesignVariant = (_variant: 'main'): void => {
  setAppSetting(DETAIL_DESIGN_VARIANT_KEY, 'main');
};

export const getUiPreviewVariant = (): 'stable' | 'preview' => {
  const value = getAppSetting(UI_PREVIEW_VARIANT_KEY);
  return value === 'preview' ? 'preview' : 'stable';
};

export const setUiPreviewVariant = (variant: 'stable' | 'preview'): void => {
  setAppSetting(UI_PREVIEW_VARIANT_KEY, variant);
};

export const getAppThemeVariant = (): 'default' | 'white' | 'black' => {
  const value = getAppSetting(APP_THEME_VARIANT_KEY);
  if (value === 'white' || value === 'black') {
    return value;
  }
  /** 旧 default / 未設定 → ホワイト（default テーマ実装は残置） */
  if (value === 'default') {
    setAppSetting(APP_THEME_VARIANT_KEY, 'white');
  }
  return 'white';
};

export const setAppThemeVariant = (variant: 'default' | 'white' | 'black'): void => {
  setAppSetting(APP_THEME_VARIANT_KEY, variant);
};

export const getDesignPatternId = (): DesignPatternId => {
  return normalizeDesignPatternId(getAppSetting(DESIGN_PATTERN_KEY));
};

export const setDesignPatternId = (patternId: DesignPatternId): void => {
  setAppSetting(DESIGN_PATTERN_KEY, patternId);
};

export const getCalendarEventTimeDisplayOverride = (): 'column' => {
  return 'column';
};

export const setCalendarEventTimeDisplayOverride = (_display: 'column'): void => {
  setAppSetting(UI_CALENDAR_EVENT_TIME_DISPLAY_KEY, 'column');
};

export const getCalendarEventCardStyleOverride = (): 'roundedCards' => {
  return 'roundedCards';
};

export const setCalendarEventCardStyleOverride = (_style: 'roundedCards'): void => {
  setAppSetting(UI_CALENDAR_EVENT_CARD_STYLE_KEY, 'roundedCards');
};

export const getEpisodeListPhotoLayoutOverride = ():
  | 'compactTwoSideBySide'
  | 'tallOne'
  | null => {
  const value = getAppSetting(UI_EPISODE_LIST_PHOTO_LAYOUT_KEY);
  if (value === 'compactOne') {
    return 'tallOne';
  }
  if (value === 'compactTwoSideBySide' || value === 'tallOne') {
    return value;
  }
  return null;
};

export const setEpisodeListPhotoLayoutOverride = (
  layout: 'compactTwoSideBySide' | 'tallOne'
): void => {
  setAppSetting(UI_EPISODE_LIST_PHOTO_LAYOUT_KEY, layout);
};

export const getDetailProfileCardStyleOverride = (): 'flat' => {
  return 'flat';
};

export const setDetailProfileCardStyleOverride = (_style: 'flat'): void => {
  setAppSetting(UI_DETAIL_PROFILE_CARD_STYLE_KEY, 'flat');
};

const COMPLETED_TASK_RETENTION_VALUES: CompletedTaskRetention[] = ['1w', '1m', '3m', '1y', 'forever'];

export const getCompletedTaskRetention = (): CompletedTaskRetention => {
  const value = getAppSetting(COMPLETED_TASK_RETENTION_KEY);
  if (value && (COMPLETED_TASK_RETENTION_VALUES as string[]).includes(value)) {
    return value as CompletedTaskRetention;
  }
  return '1m';
};

export const setCompletedTaskRetention = (retention: CompletedTaskRetention): void => {
  setAppSetting(COMPLETED_TASK_RETENTION_KEY, retention);
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
  const previous = getFriendById(id);
  const timestamp = nowIso();
  upsertDefaultProfileFromFriend(id, input, timestamp);
  syncFriendGroupLabelsToOptions(id, previous, input);
  const nextName = resolvePersonNameParts(input).name;
  if (!previous || previous.name !== nextName) {
    syncSettlementMemberDisplayName(id, nextName);
  }
  return true;
};

export type ProfileSelfUpdateInput = {
  name: string;
  familyName: string;
  givenName: string;
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
  const nameParts = resolvePersonNameParts(input);
  syncPersonNameForFriend(row.friendId, nameParts, timestamp);
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
  if (result.changes > 0 && row.name !== nameParts.name) {
    syncSettlementMemberDisplayName(row.friendId, nameParts.name);
  }
  return result.changes > 0;
};

export const deleteFriend = (id: string): boolean => {
  const uris = db
    .getAllSync<{ photoUri: string | null }>(
      `SELECT photoUri FROM ${PROFILES_TABLE} WHERE friendId = ?;`,
      [id]
    )
    .map((row) => row.photoUri);
  const result = db.runSync(`DELETE FROM ${PROFILES_TABLE} WHERE friendId = ?;`, [id]);
  if (result.changes > 0) {
    deletePersistedImages(uris);
    db.runSync(`DELETE FROM ${YOUR_QUESTION_ANSWERS_TABLE} WHERE friend_id = ?;`, [id]);
  }
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
  if (result.changes > 0) {
    deletePersistedImages([row.photoUri]);
  }
  return result.changes > 0;
};

export type EpisodeInput = Omit<Episode, 'id' | 'authorFriendId'>;

/** undefined = keep previous; null/'' = clear; string = set */
const resolveEpisodeEventIdForUpdate = (
  input: EpisodeInput,
  previousEpisode: Episode
): { eventId?: string } => {
  if (input.eventId === undefined) {
    const previous = previousEpisode.eventId?.trim();
    return previous ? { eventId: previous } : {};
  }
  const next = input.eventId?.trim();
  return next ? { eventId: next } : {};
};

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

/**
 * エピソード一覧などの参加者フィルタ。
 * グループはエントリ名の直接一致、または所属メンバー展開後の friendId 交差で判定する。
 */
export const episodeMatchesParticipantFilter = (
  episode: Pick<Episode, 'participantEntries'>,
  filterEntries: EpisodeParticipant[]
): boolean => {
  if (filterEntries.length === 0) {
    return true;
  }
  const episodeEntries = episode.participantEntries ?? [];
  const filterGroups = new Set(
    filterEntries
      .filter((entry) => entry.kind === 'group')
      .map((entry) => entry.value.trim())
      .filter((value) => value.length > 0)
  );
  if (filterGroups.size > 0) {
    const hasDirectGroupMatch = episodeEntries.some(
      (entry) => entry.kind === 'group' && filterGroups.has(entry.value.trim())
    );
    if (hasDirectGroupMatch) {
      return true;
    }
  }
  const filterIds = expandParticipantEntriesToFriendIds(filterEntries);
  if (filterIds.length === 0) {
    return false;
  }
  const episodeIds = expandParticipantEntriesToFriendIds(episodeEntries);
  return filterIds.some((id) => episodeIds.includes(id));
};

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
  const time = normalizeEpisodeTime(input.time);
  const episode: Episode = {
    id: uuidv4(),
    title: input.title,
    date: input.date,
    ...(time ? { time } : {}),
    description: input.description,
    authorFriendId: myselfId,
    visibilityMode,
    participantEntries,
    visibilityEntries,
    ...(input.eventId?.trim() ? { eventId: input.eventId.trim() } : {}),
    ...(tag ? { tag } : {}),
    isAutoGenerated: input.isAutoGenerated === true,
    pendingReview: input.pendingReview === true,
    pendingReviewDismissed: input.pendingReviewDismissed === true,
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
  const time = normalizeEpisodeTime(input.time);
  const updatedEpisode: Episode = {
    id: normalizedId,
    title: input.title,
    date: input.date,
    ...(time ? { time } : {}),
    description: input.description,
    authorFriendId: previousEpisode.authorFriendId,
    visibilityMode,
    participantEntries,
    visibilityEntries,
    ...(resolveEpisodeEventIdForUpdate(input, previousEpisode)),
    ...(tag ? { tag } : {}),
    isAutoGenerated: input.isAutoGenerated ?? previousEpisode.isAutoGenerated ?? false,
    pendingReview: input.pendingReview ?? previousEpisode.pendingReview ?? false,
    pendingReviewDismissed:
      (input.pendingReview ?? previousEpisode.pendingReview ?? false)
        ? input.pendingReviewDismissed ?? previousEpisode.pendingReviewDismissed ?? false
        : false,
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

export const getEpisodesByEventId = (eventId: string): Episode[] => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    return [];
  }
  const rows = db.getAllSync<{ episodes: string }>(`SELECT episodes FROM ${PROFILES_TABLE};`);
  const byId = new Map<string, Episode>();
  for (const row of rows) {
    fromEpisodeJson(row.episodes).forEach((episode) => {
      if (episode.eventId === normalizedEventId && !byId.has(episode.id)) {
        byId.set(episode.id, episode);
      }
    });
  }
  return Array.from(byId.values()).sort(compareEpisodesByEventDateTime);
};

export const getEpisodesByEventIds = (eventIds: string[]): Map<string, Episode[]> => {
  const normalizedIds = [
    ...new Set(eventIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  const map = new Map<string, Episode[]>();
  normalizedIds.forEach((id) => map.set(id, []));
  if (normalizedIds.length === 0) {
    return map;
  }
  const idSet = new Set(normalizedIds);
  const rows = db.getAllSync<{ episodes: string }>(`SELECT episodes FROM ${PROFILES_TABLE};`);
  const seen = new Set<string>();
  for (const row of rows) {
    fromEpisodeJson(row.episodes).forEach((episode) => {
      const eventId = episode.eventId?.trim();
      if (!eventId || !idSet.has(eventId) || seen.has(episode.id)) {
        return;
      }
      seen.add(episode.id);
      const list = map.get(eventId) ?? [];
      list.push(episode);
      map.set(eventId, list);
    });
  }
  map.forEach((list, eventId) => {
    map.set(eventId, [...list].sort(compareEpisodesByEventDateTime));
  });
  return map;
};

/** @deprecated 互換用。複数ある場合は先頭のみ */
export const getEpisodeByEventId = (eventId: string): Episode | null => {
  return getEpisodesByEventId(eventId)[0] ?? null;
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
      if (
        episode.pendingReview !== true ||
        episode.pendingReviewDismissed === true ||
        seenEpisodeIds.has(episode.id)
      ) {
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
  pending.sort((left, right) => compareEpisodesByEventDateTime(left.episode, right.episode));
  return pending;
};

export const dismissPendingReviewPrompt = (episodeId: string): boolean => {
  const normalizedId = episodeId.trim();
  if (!normalizedId) {
    return false;
  }

  const timestamp = nowIso();
  let changed = false;
  const rows = db.getAllSync<{ id: string; episodes: string }>(
    `SELECT id, episodes FROM ${PROFILES_TABLE};`
  );

  rows.forEach((row) => {
    const existingEpisodes = fromEpisodeJson(row.episodes);
    let rowChanged = false;
    const nextEpisodes = existingEpisodes.map((episode) => {
      if (episode.id !== normalizedId || episode.pendingReviewDismissed === true) {
        return episode;
      }
      rowChanged = true;
      return { ...episode, pendingReview: true, pendingReviewDismissed: true };
    });
    if (!rowChanged) {
      return;
    }
    changed = true;
    db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
      toEpisodeJson(nextEpisodes),
      timestamp,
      row.id,
    ]);
  });

  return changed;
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
  const multi = getEpisodeListPhotoUrisMap(episodeIds, 1);
  const map = new Map<string, string>();
  for (const [episodeId, uris] of multi) {
    const first = uris[0];
    if (first) {
      map.set(episodeId, first);
    }
  }
  return map;
};

/** 一覧カード用。各エピソード最大 maxPhotos 枚（sort_order 順） */
export const getEpisodeListPhotoUrisMap = (
  episodeIds: string[],
  maxPhotos = 2
): Map<string, string[]> => {
  const normalizedIds = [...new Set(episodeIds.map((id) => id.trim()).filter(Boolean))];
  const limit = Math.max(1, Math.floor(maxPhotos));
  if (normalizedIds.length === 0) {
    return new Map();
  }
  const placeholders = normalizedIds.map(() => '?').join(', ');
  const rows = db.getAllSync<{ episode_id: string; photo_uri: string }>(
    `SELECT episode_id, photo_uri FROM ${EPISODE_PHOTOS_TABLE} WHERE episode_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC;`,
    normalizedIds
  );
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.episode_id) ?? [];
    if (list.length < limit) {
      list.push(row.photo_uri);
      map.set(row.episode_id, list);
    }
  }
  return map;
};

export const deleteEpisodePhoto = (id: number): boolean => {
  const row = db.getFirstSync<{ photo_uri: string }>(
    `SELECT photo_uri FROM ${EPISODE_PHOTOS_TABLE} WHERE id = ?;`,
    [id]
  );
  const result = db.runSync(`DELETE FROM ${EPISODE_PHOTOS_TABLE} WHERE id = ?;`, [id]);
  if (result.changes > 0) {
    deletePersistedImages([row?.photo_uri]);
  }
  return result.changes > 0;
};

export const deleteEpisodePhotosByEpisodeId = (episodeId: string): boolean => {
  const normalizedEpisodeId = episodeId.trim();
  if (!normalizedEpisodeId) {
    return false;
  }
  const uris = db
    .getAllSync<{ photo_uri: string }>(
      `SELECT photo_uri FROM ${EPISODE_PHOTOS_TABLE} WHERE episode_id = ?;`,
      [normalizedEpisodeId]
    )
    .map((row) => row.photo_uri);
  const result = db.runSync(`DELETE FROM ${EPISODE_PHOTOS_TABLE} WHERE episode_id = ?;`, [normalizedEpisodeId]);
  if (result.changes > 0) {
    deletePersistedImages(uris);
  }
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

const COMMON_ITEM_MEMBERS_RECONCILED_KEY = 'common_item_members_reconciled_v1';

const GROUP_MEMBER_SYNC_KINDS: CommonItemKind[] = [
  'affiliation',
  'experience',
  'personality',
  'like',
  'dislike',
];

type GroupLabelFriendData = Pick<
  FriendInput,
  'affiliations' | 'experiences' | 'personalities' | 'likes' | 'dislikes'
>;

const extractNormalizedLabels = (values: string[] | undefined): string[] =>
  Array.from(new Set((values ?? []).map((value) => normalizeCommonLabel(value)).filter((value) => value.length > 0)));

const getGroupLabelsFromFriendData = (
  data: GroupLabelFriendData | Friend | null,
  kind: CommonItemKind
): string[] => {
  const column = getProfileColumnByKind(kind);
  if (!column || !data) {
    return [];
  }
  return extractNormalizedLabels(data[column]);
};

const collectProfileMemberIdsByColumn = (columnName: ProfileArrayColumn, label: string): string[] => {
  if (!label.trim()) {
    return [];
  }
  const rows = db.getAllSync<{ friendId: string; value: string }>(
    `SELECT friendId, ${columnName} as value FROM ${PROFILES_TABLE} WHERE isDefault = 1;`
  );
  return rows
    .filter((row) => fromJson(row.value).includes(label))
    .map((row) => row.friendId)
    .filter((id) => id.trim().length > 0);
};

const addFriendToGroupOptionMembers = (kind: CommonItemKind, label: string, friendId: string): void => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized || !friendId.trim() || !getProfileColumnByKind(kind)) {
    return;
  }
  const existing = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, normalized]
  );
  const now = nowIso();
  if (existing) {
    const members = fromJson(existing.members ?? '[]');
    if (members.includes(friendId)) {
      return;
    }
    const nextMembers = Array.from(new Set([...members, friendId]));
    db.runSync(`UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET members = ?, updatedAt = ? WHERE id = ?;`, [
      toJson(nextMembers),
      now,
      existing.id,
    ]);
    return;
  }
  const id = uuidv4();
  db.runSync(
    `INSERT INTO ${COMMON_ITEM_OPTIONS_TABLE} (id, kind, label, members, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [id, kind, normalized, toJson([friendId]), null, now, now]
  );
};

const removeFriendFromGroupOptionMembers = (kind: CommonItemKind, label: string, friendId: string): void => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized || !friendId.trim() || !getProfileColumnByKind(kind)) {
    return;
  }
  const existing = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, normalized]
  );
  if (!existing) {
    return;
  }
  const members = fromJson(existing.members ?? '[]');
  if (!members.includes(friendId)) {
    return;
  }
  const nextMembers = members.filter((memberId) => memberId !== friendId);
  db.runSync(`UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET members = ?, updatedAt = ? WHERE id = ?;`, [
    toJson(nextMembers),
    nowIso(),
    existing.id,
  ]);
};

const syncFriendGroupLabelsToOptions = (
  friendId: string,
  previous: Friend | null,
  next: FriendInput
): void => {
  GROUP_MEMBER_SYNC_KINDS.forEach((kind) => {
    const prevLabels = new Set(getGroupLabelsFromFriendData(previous, kind));
    const nextLabels = getGroupLabelsFromFriendData(next, kind);
    const nextLabelSet = new Set(nextLabels);
    nextLabels.forEach((label) => {
      if (!prevLabels.has(label)) {
        addFriendToGroupOptionMembers(kind, label, friendId);
      }
    });
    prevLabels.forEach((label) => {
      if (!nextLabelSet.has(label)) {
        removeFriendFromGroupOptionMembers(kind, label, friendId);
      }
    });
  });
};

/** プロフィール実データと common_item_options.members を突き合わせ、和集合で DB を揃える */
export const reconcileGroupOptionMembers = (kind: CommonItemKind, label: string): string[] => {
  const normalized = normalizeCommonLabel(label);
  const column = getProfileColumnByKind(kind);
  if (!normalized || !column) {
    return [];
  }

  const profileMemberIds = collectProfileMemberIdsByColumn(column, normalized);
  const existing = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, normalized]
  );
  const storedMembers = existing ? fromJson(existing.members ?? '[]') : [];
  const mergedMembers = Array.from(new Set([...storedMembers, ...profileMemberIds]));
  const now = nowIso();

  if (existing) {
    const storedSet = new Set(storedMembers);
    const changed =
      mergedMembers.length !== storedMembers.length ||
      mergedMembers.some((memberId) => !storedSet.has(memberId));
    if (changed) {
      db.runSync(`UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET members = ?, updatedAt = ? WHERE id = ?;`, [
        toJson(mergedMembers),
        now,
        existing.id,
      ]);
    }
    return mergedMembers;
  }

  if (mergedMembers.length === 0) {
    return [];
  }

  const id = uuidv4();
  db.runSync(
    `INSERT INTO ${COMMON_ITEM_OPTIONS_TABLE} (id, kind, label, members, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [id, kind, normalized, toJson(mergedMembers), null, now, now]
  );
  return mergedMembers;
};

const reconcileAllGroupOptionMembers = (): void => {
  GROUP_MEMBER_SYNC_KINDS.forEach((kind) => {
    getMergedCommonItemLabels(kind).forEach((label) => {
      reconcileGroupOptionMembers(kind, label);
    });
  });
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

const normalizeCommonItemColor = (color: string | null | undefined): string | null => {
  if (typeof color !== 'string') return null;
  const trimmed = color.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return null;
  return trimmed.toUpperCase();
};

export const addCommonItemOption = (
  kind: CommonItemKind,
  label: string,
  color?: string | null
): CommonItemOption | null => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized) {
    return null;
  }
  const colorValue = kind === 'episode_tag' ? normalizeCommonItemColor(color) : null;
  const existing = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, normalized]
  );
  if (existing) {
    if (kind === 'episode_tag' && colorValue && existing.color !== colorValue) {
      db.runSync(`UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET color = ?, updatedAt = ? WHERE id = ?;`, [
        colorValue,
        nowIso(),
        existing.id,
      ]);
      return rowToCommonItemOption({ ...existing, color: colorValue, updatedAt: nowIso() });
    }
    return rowToCommonItemOption(existing);
  }
  const now = nowIso();
  const id = uuidv4();
  db.runSync(
    `INSERT INTO ${COMMON_ITEM_OPTIONS_TABLE} (id, kind, label, members, color, createdAt, updatedAt) VALUES (?, ?, ?, '[]', ?, ?, ?);`,
    [id, kind, normalized, colorValue, now, now]
  );
  return { id, kind, label: normalized, members: [], color: colorValue, createdAt: now, updatedAt: now };
};

/** 予定タグ等の色を設定。未登録ラベルならオプションを新規作成する */
export const setCommonItemOptionColor = (
  kind: CommonItemKind,
  label: string,
  color: string | null
): boolean => {
  const normalized = normalizeCommonLabel(label);
  if (!normalized) {
    return false;
  }
  const colorValue = kind === 'episode_tag' ? normalizeCommonItemColor(color) : null;
  const existing = db.getFirstSync<CommonItemOptionRow>(
    `SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ? LIMIT 1;`,
    [kind, normalized]
  );
  if (existing) {
    db.runSync(`UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET color = ?, updatedAt = ? WHERE id = ?;`, [
      colorValue,
      nowIso(),
      existing.id,
    ]);
    return true;
  }
  return addCommonItemOption(kind, normalized, colorValue) != null;
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

  return {
    id,
    kind,
    label: normalized,
    members: uniqueMembers,
    color: null,
    createdAt: now,
    updatedAt: now,
  };
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

export const getAllEvents = (): Event[] => {
  const rows = db.getAllSync<EventRow>(
    `SELECT * FROM ${EVENTS_TABLE} ORDER BY start_at DESC, title COLLATE NOCASE ASC;`
  );
  return rows.map(rowToEvent);
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

export const getMoneyLoan = (loanId: string): MoneyLoan | null => {
  const normalizedId = loanId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<MoneyLoanRow>(
    `SELECT * FROM ${MONEY_LOANS_TABLE} WHERE id = ? LIMIT 1;`,
    [normalizedId]
  );
  return row ? rowToMoneyLoan(row) : null;
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

export const updateMoneyLoan = (
  loanId: string,
  input: {
    counterpartyKind?: MoneyLoanCounterpartyKind;
    counterpartyValue: string;
    amount: number;
    direction: MoneyLoanDirection;
  }
): boolean => {
  const normalizedId = loanId.trim();
  const value = input.counterpartyValue.trim();
  const amount = Math.floor(input.amount);
  const direction = sanitizeMoneyLoanDirection(input.direction);
  if (!normalizedId || !value || amount <= 0 || direction == null) {
    return false;
  }
  const existing = getMoneyLoan(normalizedId);
  if (!existing) {
    return false;
  }
  const kind = input.counterpartyKind ?? existing.counterpartyKind;
  const result = db.runSync(
    `UPDATE ${MONEY_LOANS_TABLE}
     SET counterparty_kind = ?, counterparty_value = ?, amount = ?, direction = ?
     WHERE id = ?;`,
    [kind, value, amount, direction, normalizedId]
  );
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

type SettlementRoomRow = {
  id: string;
  title: string;
  created_at: string;
};

type SettlementMemberRow = {
  id: string;
  room_id: string;
  friend_id: string;
  display_name: string;
  ledger_synced: number;
};

type SettlementExpenseRow = {
  id: string;
  room_id: string;
  payer_member_id: string;
  title: string;
  amount: number;
  split_member_ids: string;
  created_at: string;
};

const rowToMockSettlementExpense = (row: SettlementExpenseRow): MockSettlementExpense => ({
  id: row.id,
  payerMemberId: row.payer_member_id,
  title: row.title,
  amount: row.amount,
  splitMemberIds: fromJson(row.split_member_ids),
  createdAt: row.created_at,
});

/** 精算ルーム一覧（メンバー・支出込み） */
export const getAllMockSettlementRooms = (): MockSettlementRoom[] => {
  const roomRows = db.getAllSync<SettlementRoomRow>(
    `SELECT * FROM ${SETTLEMENT_ROOMS_TABLE} ORDER BY created_at DESC;`
  );
  if (roomRows.length === 0) {
    return [];
  }
  return roomRows.map((roomRow) => {
    const memberRows = db.getAllSync<SettlementMemberRow>(
      `SELECT * FROM ${SETTLEMENT_MEMBERS_TABLE} WHERE room_id = ? ORDER BY rowid ASC;`,
      [roomRow.id]
    );
    const expenseRows = db.getAllSync<SettlementExpenseRow>(
      `SELECT * FROM ${SETTLEMENT_EXPENSES_TABLE} WHERE room_id = ? ORDER BY created_at DESC;`,
      [roomRow.id]
    );
    return {
      id: roomRow.id,
      title: roomRow.title,
      createdAt: roomRow.created_at,
      members: memberRows.map((row) => ({
        id: row.id,
        friendId: row.friend_id,
        displayName: row.display_name,
        ledgerSynced: row.ledger_synced === 1,
      })),
      expenses: expenseRows.map(rowToMockSettlementExpense),
    };
  });
};

export const insertMockSettlementRoom = (room: MockSettlementRoom): void => {
  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(
      `INSERT INTO ${SETTLEMENT_ROOMS_TABLE} (id, title, created_at) VALUES (?, ?, ?);`,
      [room.id, room.title.trim(), room.createdAt]
    );
    room.members.forEach((member) => {
      db.runSync(
        `INSERT INTO ${SETTLEMENT_MEMBERS_TABLE} (id, room_id, friend_id, display_name, ledger_synced) VALUES (?, ?, ?, ?, ?);`,
        [
          member.id,
          room.id,
          member.friendId,
          member.displayName,
          member.ledgerSynced ? 1 : 0,
        ]
      );
    });
    room.expenses.forEach((expense) => {
      db.runSync(
        `INSERT INTO ${SETTLEMENT_EXPENSES_TABLE} (id, room_id, payer_member_id, title, amount, split_member_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          expense.id,
          room.id,
          expense.payerMemberId,
          expense.title,
          expense.amount,
          toJson(expense.splitMemberIds),
          expense.createdAt,
        ]
      );
    });
    db.execSync('COMMIT;');
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
};

export const updateMockSettlementRoomTitle = (roomId: string, title: string): boolean => {
  const normalizedRoomId = roomId.trim();
  const normalizedTitle = title.trim();
  if (!normalizedRoomId || !normalizedTitle) {
    return false;
  }
  const result = db.runSync(`UPDATE ${SETTLEMENT_ROOMS_TABLE} SET title = ? WHERE id = ?;`, [
    normalizedTitle,
    normalizedRoomId,
  ]);
  return result.changes > 0;
};

export const insertMockSettlementExpense = (
  roomId: string,
  expense: MockSettlementExpense
): MockSettlementExpense | null => {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) {
    return null;
  }
  const exists = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${SETTLEMENT_ROOMS_TABLE} WHERE id = ? LIMIT 1;`,
    [normalizedRoomId]
  );
  if (!exists) {
    return null;
  }
  db.runSync(
    `INSERT INTO ${SETTLEMENT_EXPENSES_TABLE} (id, room_id, payer_member_id, title, amount, split_member_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      expense.id,
      normalizedRoomId,
      expense.payerMemberId,
      expense.title,
      expense.amount,
      toJson(expense.splitMemberIds),
      expense.createdAt,
    ]
  );
  return expense;
};

export const setMockSettlementMemberLedgerSynced = (
  roomId: string,
  friendId: string,
  ledgerSynced: boolean
): boolean => {
  const normalizedRoomId = roomId.trim();
  const normalizedFriendId = friendId.trim();
  if (!normalizedRoomId || !normalizedFriendId) {
    return false;
  }
  const result = db.runSync(
    `UPDATE ${SETTLEMENT_MEMBERS_TABLE} SET ledger_synced = ? WHERE room_id = ? AND friend_id = ?;`,
    [ledgerSynced ? 1 : 0, normalizedRoomId, normalizedFriendId]
  );
  return result.changes > 0;
};

/** 友達名変更時に精算メンバーの表示名を同期。myself の場合は friend_id='myself' も更新 */
export const syncSettlementMemberDisplayName = (friendId: string, displayName: string): void => {
  const normalizedFriendId = friendId.trim();
  const normalizedName = displayName.trim();
  if (!normalizedFriendId || !normalizedName) {
    return;
  }
  db.runSync(`UPDATE ${SETTLEMENT_MEMBERS_TABLE} SET display_name = ? WHERE friend_id = ?;`, [
    normalizedName,
    normalizedFriendId,
  ]);
  const myselfId = getMyself();
  if (myselfId && myselfId === normalizedFriendId) {
    db.runSync(`UPDATE ${SETTLEMENT_MEMBERS_TABLE} SET display_name = ? WHERE friend_id = 'myself';`, [
      normalizedName,
    ]);
  }
};

export const getSettlementCompletedTransferKeys = (): string[] => {
  const rows = db.getAllSync<{ transfer_key: string }>(
    `SELECT transfer_key FROM ${SETTLEMENT_TRANSFER_COMPLETIONS_TABLE};`
  );
  return rows.map((row) => row.transfer_key);
};

export const setSettlementTransferCompleted = (transferKey: string, completed: boolean): void => {
  const normalizedKey = transferKey.trim();
  if (!normalizedKey) {
    return;
  }
  if (completed) {
    db.runSync(
      `INSERT OR REPLACE INTO ${SETTLEMENT_TRANSFER_COMPLETIONS_TABLE} (transfer_key, completed_at) VALUES (?, ?);`,
      [normalizedKey, nowIso()]
    );
    return;
  }
  db.runSync(`DELETE FROM ${SETTLEMENT_TRANSFER_COMPLETIONS_TABLE} WHERE transfer_key = ?;`, [normalizedKey]);
};

const BACKUP_TABLE_SQL: Record<FriendDexBackupTableName, string> = {
  friend_profiles: PROFILES_TABLE,
  app_settings: SETTINGS_TABLE,
  common_item_options: COMMON_ITEM_OPTIONS_TABLE,
  episode_photos: EPISODE_PHOTOS_TABLE,
  events: EVENTS_TABLE,
  event_participants: EVENT_PARTICIPANTS_TABLE,
  task_groups: TASK_GROUPS_TABLE,
  tasks: TASKS_TABLE,
  task_completions: TASK_COMPLETIONS_TABLE,
  task_soft_dones: TASK_SOFT_DONES_TABLE,
  money_loan_sessions: MONEY_LOAN_SESSIONS_TABLE,
  money_loans: MONEY_LOANS_TABLE,
  settlement_rooms: SETTLEMENT_ROOMS_TABLE,
  settlement_members: SETTLEMENT_MEMBERS_TABLE,
  settlement_expenses: SETTLEMENT_EXPENSES_TABLE,
  settlement_transfer_completions: SETTLEMENT_TRANSFER_COMPLETIONS_TABLE,
  shuffle_pools: SHUFFLE_POOLS_TABLE,
  relationship_maps: RELATIONSHIP_MAPS_TABLE,
  relationship_map_members: RELATIONSHIP_MAP_MEMBERS_TABLE,
  relationship_groups: RELATIONSHIP_GROUPS_TABLE,
  relationship_group_members: RELATIONSHIP_GROUP_MEMBERS_TABLE,
  relationships: RELATIONSHIPS_TABLE,
  your_questions: YOUR_QUESTIONS_TABLE,
  your_question_answers: YOUR_QUESTION_ANSWERS_TABLE,
  wishlist_items: WISHLIST_ITEMS_TABLE,
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

const dumpBackupTable = (sqlTable: string): FriendDexBackupRow[] =>
  db.getAllSync<Record<string, unknown>>(`SELECT * FROM ${sqlTable};`).map(toBackupRow);

export const createBackupPayload = (): FriendDexBackup => {
  return {
    version: 8,
    exportedAt: nowIso(),
    tables: {
      friend_profiles: dumpBackupTable(PROFILES_TABLE),
      app_settings: dumpBackupTable(SETTINGS_TABLE),
      common_item_options: dumpBackupTable(COMMON_ITEM_OPTIONS_TABLE),
      episode_photos: dumpBackupTable(EPISODE_PHOTOS_TABLE),
      events: dumpBackupTable(EVENTS_TABLE),
      event_participants: dumpBackupTable(EVENT_PARTICIPANTS_TABLE),
      task_groups: dumpBackupTable(TASK_GROUPS_TABLE),
      tasks: dumpBackupTable(TASKS_TABLE),
      task_completions: dumpBackupTable(TASK_COMPLETIONS_TABLE),
      task_soft_dones: dumpBackupTable(TASK_SOFT_DONES_TABLE),
      money_loan_sessions: dumpBackupTable(MONEY_LOAN_SESSIONS_TABLE),
      money_loans: dumpBackupTable(MONEY_LOANS_TABLE),
      settlement_rooms: dumpBackupTable(SETTLEMENT_ROOMS_TABLE),
      settlement_members: dumpBackupTable(SETTLEMENT_MEMBERS_TABLE),
      settlement_expenses: dumpBackupTable(SETTLEMENT_EXPENSES_TABLE),
      settlement_transfer_completions: dumpBackupTable(SETTLEMENT_TRANSFER_COMPLETIONS_TABLE),
      shuffle_pools: dumpBackupTable(SHUFFLE_POOLS_TABLE),
      relationship_maps: dumpBackupTable(RELATIONSHIP_MAPS_TABLE),
      relationship_map_members: dumpBackupTable(RELATIONSHIP_MAP_MEMBERS_TABLE),
      relationship_groups: dumpBackupTable(RELATIONSHIP_GROUPS_TABLE),
      relationship_group_members: dumpBackupTable(RELATIONSHIP_GROUP_MEMBERS_TABLE),
      relationships: dumpBackupTable(RELATIONSHIPS_TABLE),
      your_questions: dumpBackupTable(YOUR_QUESTIONS_TABLE),
      your_question_answers: dumpBackupTable(YOUR_QUESTION_ANSWERS_TABLE),
      wishlist_items: dumpBackupTable(WISHLIST_ITEMS_TABLE),
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
      const rows = payload.tables[tableName];
      // 旧バージョンに無いテーブルは触らない（ローカルのタスク等を消さない）
      if (rows === undefined) {
        return;
      }
      db.execSync(`DELETE FROM ${BACKUP_TABLE_SQL[tableName]};`);
      rows.forEach((row) => {
        insertOrReplaceBackupRow(tableName, row);
      });
    });
    db.execSync('COMMIT;');
    reconcileAllGroupOptionMembers();
    backfillPersonNameParts();
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
};


type TaskRow = {
  id: string;
  kind: string;
  title: string;
  memo: string | null;
  pace: string | null;
  recurrence_unit: string | null;
  recurrence_config: string | null;
  due_date: string | null;
  event_id: string | null;
  group_id: string | null;
  track_completions: number | null;
  remind_enabled: number | null;
  remind_days_before: number | null;
  remind_time: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type TaskGroupRow = {
  id: string;
  title: string;
  kind: string | null;
  pace: string | null;
  recurrence_unit: string | null;
  recurrence_config: string | null;
  remind_enabled: number | null;
  remind_time: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type TaskCompletionRow = {
  id: string;
  task_id: string;
  completed_on: string;
  created_at: string;
};

const parseTaskRecurrenceConfig = (raw: string | null): Task['recurrenceConfig'] => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const rowToTask = (row: TaskRow): Task => ({
  id: row.id,
  kind: row.kind === 'temporary' ? 'temporary' : 'recurring',
  title: row.title,
  memo: row.memo ?? '',
  pace: row.pace === 'scheduled' || row.pace === 'unpaced' ? row.pace : null,
  recurrenceUnit:
    row.recurrence_unit === 'day' ||
    row.recurrence_unit === 'week' ||
    row.recurrence_unit === 'month' ||
    row.recurrence_unit === 'year'
      ? row.recurrence_unit
      : null,
  recurrenceConfig: parseTaskRecurrenceConfig(row.recurrence_config),
  dueDate: row.due_date,
  eventId: row.event_id,
  groupId: row.group_id?.trim() || null,
  trackCompletions: row.track_completions == null ? true : Boolean(row.track_completions),
  completedAt: row.completed_at,
  remindEnabled: row.remind_enabled === 1,
  remindDaysBefore:
    row.remind_days_before == null
      ? null
      : Math.min(30, Math.max(0, Math.floor(Number(row.remind_days_before)))),
  remindTime: row.remind_time?.trim() || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToTaskGroup = (row: TaskGroupRow): TaskGroup => {
  const kind: Task['kind'] = row.kind === 'temporary' ? 'temporary' : 'recurring';
  const pace =
    kind === 'recurring' && (row.pace === 'scheduled' || row.pace === 'unpaced')
      ? row.pace
      : kind === 'recurring'
        ? 'unpaced'
        : null;
  const recurrenceUnit =
    pace === 'scheduled' &&
    (row.recurrence_unit === 'day' ||
      row.recurrence_unit === 'week' ||
      row.recurrence_unit === 'month' ||
      row.recurrence_unit === 'year')
      ? row.recurrence_unit
      : null;
  return {
    id: row.id,
    kind,
    title: row.title,
    pace,
    recurrenceUnit,
    recurrenceConfig: pace === 'scheduled' ? parseTaskRecurrenceConfig(row.recurrence_config) : null,
    sortOrder: row.sort_order ?? 0,
    remindEnabled: row.remind_enabled === 1,
    remindTime: row.remind_time?.trim() || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const rowToTaskCompletion = (row: TaskCompletionRow): TaskCompletion => ({
  id: row.id,
  taskId: row.task_id,
  completedOn: row.completed_on,
  createdAt: row.created_at,
});

export const getAllTasks = (): Task[] => {
  const rows = db.getAllSync<TaskRow>(`SELECT * FROM ${TASKS_TABLE} ORDER BY updated_at DESC;`);
  return rows.map(rowToTask);
};

export const getTask = (taskId: string): Task | null => {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<TaskRow>(`SELECT * FROM ${TASKS_TABLE} WHERE id = ?;`, [normalizedId]);
  return row ? rowToTask(row) : null;
};

export const getTasksByEventId = (eventId: string): Task[] => {
  const normalizedId = eventId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<TaskRow>(
    `SELECT * FROM ${TASKS_TABLE} WHERE event_id = ? ORDER BY created_at ASC;`,
    [normalizedId]
  );
  return rows.map(rowToTask);
};

export const getOpenTemporaryTasks = (): Task[] => {
  const rows = db.getAllSync<TaskRow>(
    `SELECT * FROM ${TASKS_TABLE}
     WHERE kind = 'temporary' AND completed_at IS NULL
     ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, created_at DESC;`
  );
  return rows.map(rowToTask);
};

export const getCompletedTemporaryTasks = (): Task[] => {
  const rows = db.getAllSync<TaskRow>(
    `SELECT * FROM ${TASKS_TABLE}
     WHERE kind = 'temporary' AND completed_at IS NOT NULL
     ORDER BY completed_at DESC;`
  );
  return rows.map(rowToTask);
};

export const getRecurringTasks = (): Task[] => {
  const rows = db.getAllSync<TaskRow>(
    `SELECT * FROM ${TASKS_TABLE} WHERE kind = 'recurring' ORDER BY created_at DESC;`
  );
  return rows.map(rowToTask);
};

export const getTasksByGroupId = (
  groupId: string,
  kind?: 'recurring' | 'temporary'
): Task[] => {
  const normalizedId = groupId.trim();
  if (!normalizedId) {
    return [];
  }
  if (kind) {
    const rows = db.getAllSync<TaskRow>(
      `SELECT * FROM ${TASKS_TABLE}
       WHERE group_id = ? AND kind = ?
       ORDER BY created_at ASC;`,
      [normalizedId, kind]
    );
    return rows.map(rowToTask);
  }
  const rows = db.getAllSync<TaskRow>(
    `SELECT * FROM ${TASKS_TABLE}
     WHERE group_id = ?
     ORDER BY kind ASC, created_at ASC;`,
    [normalizedId]
  );
  return rows.map(rowToTask);
};

export const getRecurringTasksByGroupId = (groupId: string): Task[] =>
  getTasksByGroupId(groupId, 'recurring');

export const getTemporaryTasksByGroupId = (groupId: string): Task[] =>
  getTasksByGroupId(groupId, 'temporary');

const TASK_GROUP_KIND_BACKFILLED_KEY = 'task_group_kind_backfilled_v1';

/** 既存グループに kind を付け、混在メンバーはグループ種別と不一致なら外す */
const backfillTaskGroupKindsIfNeeded = (): void => {
  if (getAppSetting(TASK_GROUP_KIND_BACKFILLED_KEY) === '1') {
    return;
  }
  const groups = db.getAllSync<TaskGroupRow>(`SELECT * FROM ${TASK_GROUPS_TABLE};`);
  const timestamp = nowIso();
  groups.forEach((groupRow) => {
    const members = db.getAllSync<{ id: string; kind: string }>(
      `SELECT id, kind FROM ${TASKS_TABLE} WHERE group_id = ?;`,
      [groupRow.id]
    );
    let recurringCount = 0;
    let temporaryCount = 0;
    members.forEach((member) => {
      if (member.kind === 'temporary') {
        temporaryCount += 1;
      } else {
        recurringCount += 1;
      }
    });
    const kind: TaskKind = temporaryCount > recurringCount ? 'temporary' : 'recurring';
    db.runSync(`UPDATE ${TASK_GROUPS_TABLE} SET kind = ?, updated_at = ? WHERE id = ?;`, [
      kind,
      timestamp,
      groupRow.id,
    ]);
    members.forEach((member) => {
      const memberKind: TaskKind = member.kind === 'temporary' ? 'temporary' : 'recurring';
      if (memberKind !== kind) {
        db.runSync(`UPDATE ${TASKS_TABLE} SET group_id = NULL, updated_at = ? WHERE id = ?;`, [
          timestamp,
          member.id,
        ]);
      }
    });
  });
  setAppSetting(TASK_GROUP_KIND_BACKFILLED_KEY, '1');
};

export const getAllTaskGroups = (): TaskGroup[] => {
  const rows = db.getAllSync<TaskGroupRow>(
    `SELECT * FROM ${TASK_GROUPS_TABLE} ORDER BY sort_order ASC, created_at ASC;`
  );
  return rows.map(rowToTaskGroup);
};

export const getTaskGroupsByKind = (kind: TaskKind): TaskGroup[] =>
  getAllTaskGroups().filter((group) => group.kind === kind);

export const getTaskGroup = (groupId: string): TaskGroup | null => {
  const normalizedId = groupId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<TaskGroupRow>(
    `SELECT * FROM ${TASK_GROUPS_TABLE} WHERE id = ?;`,
    [normalizedId]
  );
  return row ? rowToTaskGroup(row) : null;
};

const assertTaskCanJoinGroup = (taskKind: TaskKind, groupId: string): boolean => {
  const group = getTaskGroup(groupId);
  return Boolean(group && group.kind === taskKind);
};

export const createTaskGroup = (input: TaskGroupInput): TaskGroup | null => {
  const title = input.title.trim();
  const kind: TaskKind = input.kind === 'temporary' ? 'temporary' : 'recurring';
  if (!title) {
    return null;
  }
  const timestamp = nowIso();
  const maxRow = db.getFirstSync<{ max_sort: number | null }>(
    `SELECT MAX(sort_order) as max_sort FROM ${TASK_GROUPS_TABLE};`
  );
  const sortOrder =
    input.sortOrder != null ? input.sortOrder : (maxRow?.max_sort ?? -1) + 1;
  const pace: TaskPace | null =
    kind === 'temporary'
      ? null
      : input.pace === 'scheduled' || input.pace === 'unpaced'
        ? input.pace
        : 'unpaced';
  const recurrenceUnit =
    pace === 'scheduled' ? input.recurrenceUnit ?? 'day' : null;
  const recurrenceConfig =
    pace === 'scheduled' ? input.recurrenceConfig ?? {} : null;
  const group: TaskGroup = {
    id: uuidv4(),
    kind,
    title,
    pace,
    recurrenceUnit,
    recurrenceConfig,
    sortOrder,
    remindEnabled: false,
    remindTime: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.runSync(
    `INSERT INTO ${TASK_GROUPS_TABLE} (
      id, title, kind, pace, recurrence_unit, recurrence_config, remind_enabled, remind_time, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      group.id,
      group.title,
      group.kind,
      group.pace,
      group.recurrenceUnit,
      group.recurrenceConfig ? JSON.stringify(group.recurrenceConfig) : null,
      group.remindEnabled ? 1 : 0,
      group.remindTime,
      group.sortOrder,
      group.createdAt,
      group.updatedAt,
    ]
  );
  return group;
};

export const updateTaskGroup = (groupId: string, input: TaskGroupInput): boolean => {
  const normalizedId = groupId.trim();
  const title = input.title.trim();
  if (!normalizedId || !title) {
    return false;
  }
  const existing = getTaskGroup(normalizedId);
  if (!existing) {
    return false;
  }
  const kind = existing.kind;
  const pace: TaskPace | null =
    kind === 'temporary'
      ? null
      : input.pace === 'scheduled' || input.pace === 'unpaced'
        ? input.pace
        : existing.pace ?? 'unpaced';
  const recurrenceUnit =
    pace === 'scheduled'
      ? input.recurrenceUnit !== undefined
        ? input.recurrenceUnit
        : existing.recurrenceUnit ?? 'day'
      : null;
  const recurrenceConfig =
    pace === 'scheduled'
      ? input.recurrenceConfig !== undefined
        ? input.recurrenceConfig
        : existing.recurrenceConfig ?? {}
      : null;
  const remindEnabled =
    kind === 'recurring'
      ? input.remindEnabled !== undefined
        ? Boolean(input.remindEnabled)
        : existing.remindEnabled
      : false;
  const remindTime =
    kind === 'recurring' && remindEnabled
      ? input.remindTime !== undefined
        ? input.remindTime?.trim() || '08:00'
        : existing.remindTime || '08:00'
      : null;
  const result = db.runSync(
    `UPDATE ${TASK_GROUPS_TABLE}
     SET title = ?, pace = ?, recurrence_unit = ?, recurrence_config = ?,
         remind_enabled = ?, remind_time = ?,
         sort_order = COALESCE(?, sort_order), updated_at = ?
     WHERE id = ?;`,
    [
      title,
      pace,
      recurrenceUnit,
      recurrenceConfig ? JSON.stringify(recurrenceConfig) : null,
      remindEnabled ? 1 : 0,
      remindTime,
      input.sortOrder ?? null,
      nowIso(),
      normalizedId,
    ]
  );
  // 同一内容の再保存でも changes=0 になり得るので、行が残っていれば成功扱い
  return result.changes > 0 || getTaskGroup(normalizedId) != null;
};

/** グループ削除。所属タスクはグループなしに戻す（タスク自体は残す） */
export const deleteTaskGroup = (groupId: string): boolean => {
  const normalizedId = groupId.trim();
  if (!normalizedId) {
    return false;
  }
  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(
      `UPDATE ${TASKS_TABLE} SET group_id = NULL, updated_at = ? WHERE group_id = ?;`,
      [nowIso(), normalizedId]
    );
    const result = db.runSync(`DELETE FROM ${TASK_GROUPS_TABLE} WHERE id = ?;`, [normalizedId]);
    db.execSync('COMMIT;');
    return result.changes > 0;
  } catch {
    db.execSync('ROLLBACK;');
    return false;
  }
};

export const createTask = (input: TaskInput): Task | null => {
  const title = input.title.trim();
  if (!title) {
    return null;
  }
  const timestamp = nowIso();
  const memo = input.memo?.trim() ?? '';
  const groupId = input.groupId?.trim() || null;
  if (groupId) {
    if (!assertTaskCanJoinGroup(input.kind, groupId)) {
      return null;
    }
    const existing = getTasksByGroupId(groupId, input.kind);
    if (existing.length >= TASK_GROUP_MEMBER_LIMIT) {
      return null;
    }
  }
  const joiningRecurringGroup = Boolean(groupId) && input.kind === 'recurring';
  const remindEnabled = joiningRecurringGroup ? false : Boolean(input.remindEnabled);
  const remindDaysBefore =
    input.kind === 'temporary' && remindEnabled && input.dueDate?.trim()
      ? Math.min(30, Math.max(0, Math.floor(input.remindDaysBefore ?? 0)))
      : null;
  const remindTime = remindEnabled ? input.remindTime?.trim() || '08:00' : null;
  const trackCompletions = input.kind === 'recurring' ? input.trackCompletions !== false : true;
  const task: Task = {
    id: uuidv4(),
    kind: input.kind,
    title,
    memo,
    pace: input.kind === 'recurring' ? input.pace ?? 'unpaced' : null,
    recurrenceUnit: input.kind === 'recurring' && input.pace === 'scheduled' ? input.recurrenceUnit ?? 'day' : null,
    recurrenceConfig:
      input.kind === 'recurring' && input.pace === 'scheduled' ? input.recurrenceConfig ?? {} : null,
    dueDate: input.kind === 'temporary' ? input.dueDate?.trim() || null : null,
    eventId: input.kind === 'temporary' ? input.eventId?.trim() || null : null,
    groupId,
    trackCompletions,
    completedAt: null,
    remindEnabled,
    remindDaysBefore,
    remindTime,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.runSync(
    `INSERT INTO ${TASKS_TABLE} (
      id, kind, title, memo, pace, recurrence_unit, recurrence_config, due_date, event_id, group_id,
      track_completions, remind_enabled, remind_days_before, remind_time, completed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?);`,
    [
      task.id,
      task.kind,
      task.title,
      task.memo,
      task.pace,
      task.recurrenceUnit,
      task.recurrenceConfig ? JSON.stringify(task.recurrenceConfig) : null,
      task.dueDate,
      task.eventId,
      task.groupId,
      task.trackCompletions ? 1 : 0,
      task.remindEnabled ? 1 : 0,
      task.remindDaysBefore,
      task.remindTime,
      task.createdAt,
      task.updatedAt,
    ]
  );
  return task;
};

export const updateTask = (taskId: string, input: TaskInput): boolean => {
  const normalizedId = taskId.trim();
  const title = input.title.trim();
  if (!normalizedId || !title) {
    return false;
  }
  const current = getTask(normalizedId);
  if (!current) {
    return false;
  }
  const memo = input.memo?.trim() ?? '';
  const pace = input.kind === 'recurring' ? input.pace ?? 'unpaced' : null;
  const recurrenceUnit =
    input.kind === 'recurring' && pace === 'scheduled' ? input.recurrenceUnit ?? 'day' : null;
  const recurrenceConfig =
    input.kind === 'recurring' && pace === 'scheduled' ? input.recurrenceConfig ?? {} : null;
  const dueDate = input.kind === 'temporary' ? input.dueDate?.trim() || null : null;
  const eventId = input.kind === 'temporary' ? input.eventId?.trim() || null : null;
  const groupId = input.groupId?.trim() || null;
  if (groupId) {
    if (!assertTaskCanJoinGroup(input.kind, groupId)) {
      return false;
    }
    const existing = getTasksByGroupId(groupId, input.kind);
    const others = existing.filter((item) => item.id !== normalizedId);
    if (others.length >= TASK_GROUP_MEMBER_LIMIT) {
      return false;
    }
  }
  const trackCompletions = input.kind === 'recurring' ? input.trackCompletions !== false : true;
  const joiningRecurringGroup = Boolean(groupId) && input.kind === 'recurring';
  const remindEnabled = joiningRecurringGroup
    ? false
    : input.remindEnabled !== undefined
      ? Boolean(input.remindEnabled)
      : current.remindEnabled;
  const remindDaysBefore =
    input.kind === 'temporary' && remindEnabled && dueDate
      ? Math.min(30, Math.max(0, Math.floor(input.remindDaysBefore ?? current.remindDaysBefore ?? 0)))
      : null;
  const remindTime = remindEnabled
    ? input.remindTime?.trim() || current.remindTime || '08:00'
    : null;
  const result = db.runSync(
    `UPDATE ${TASKS_TABLE}
     SET kind = ?, title = ?, memo = ?, pace = ?, recurrence_unit = ?, recurrence_config = ?,
         due_date = ?, event_id = ?, group_id = ?, track_completions = ?,
         remind_enabled = ?, remind_days_before = ?, remind_time = ?, updated_at = ?
     WHERE id = ?;`,
    [
      input.kind,
      title,
      memo,
      pace,
      recurrenceUnit,
      recurrenceConfig ? JSON.stringify(recurrenceConfig) : null,
      dueDate,
      eventId,
      groupId,
      trackCompletions ? 1 : 0,
      remindEnabled ? 1 : 0,
      remindDaysBefore,
      remindTime,
      nowIso(),
      normalizedId,
    ]
  );
  return result.changes > 0;
};

/** タスクのグループ所属を更新（定期・臨時とも可） */
export const setTaskGroupId = (taskId: string, groupId: string | null): boolean => {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return false;
  }
  const task = getTask(normalizedId);
  if (!task) {
    return false;
  }
  const nextGroupId = groupId?.trim() || null;
  if ((task.groupId ?? null) === nextGroupId) {
    return true;
  }
  if (nextGroupId) {
    if (!assertTaskCanJoinGroup(task.kind, nextGroupId)) {
      return false;
    }
    const existing = getTasksByGroupId(nextGroupId, task.kind);
    if (existing.length >= TASK_GROUP_MEMBER_LIMIT) {
      return false;
    }
  }
  const joiningRecurringGroup = Boolean(nextGroupId) && task.kind === 'recurring';
  const result = db.runSync(
    `UPDATE ${TASKS_TABLE} SET group_id = ?, remind_enabled = ?, remind_days_before = ?, remind_time = ?, updated_at = ? WHERE id = ?;`,
    joiningRecurringGroup
      ? [nextGroupId, 0, null, null, nowIso(), normalizedId]
      : [nextGroupId, task.remindEnabled ? 1 : 0, task.remindDaysBefore, task.remindTime, nowIso(), normalizedId]
  );
  return result.changes > 0;
};

export const deleteTask = (taskId: string): boolean => {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return false;
  }
  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(`DELETE FROM ${TASK_COMPLETIONS_TABLE} WHERE task_id = ?;`, [normalizedId]);
    const result = db.runSync(`DELETE FROM ${TASKS_TABLE} WHERE id = ?;`, [normalizedId]);
    db.execSync('COMMIT;');
    return result.changes > 0;
  } catch {
    db.execSync('ROLLBACK;');
    return false;
  }
};

export const deleteTasksByIds = (taskIds: string[]): number => {
  const ids = taskIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return 0;
  }
  let deleted = 0;
  db.execSync('BEGIN IMMEDIATE;');
  try {
    ids.forEach((id) => {
      db.runSync(`DELETE FROM ${TASK_COMPLETIONS_TABLE} WHERE task_id = ?;`, [id]);
      const result = db.runSync(`DELETE FROM ${TASKS_TABLE} WHERE id = ?;`, [id]);
      deleted += result.changes;
    });
    db.execSync('COMMIT;');
    return deleted;
  } catch {
    db.execSync('ROLLBACK;');
    return 0;
  }
};

export const unlinkTasksFromEvent = (taskIds: string[]): number => {
  const ids = taskIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return 0;
  }
  const timestamp = nowIso();
  let updated = 0;
  db.execSync('BEGIN IMMEDIATE;');
  try {
    ids.forEach((id) => {
      const result = db.runSync(
        `UPDATE ${TASKS_TABLE} SET event_id = NULL, updated_at = ? WHERE id = ? AND kind = 'temporary';`,
        [timestamp, id]
      );
      updated += result.changes;
    });
    db.execSync('COMMIT;');
    return updated;
  } catch {
    db.execSync('ROLLBACK;');
    return 0;
  }
};

export const completeTemporaryTask = (taskId: string): boolean => {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return false;
  }
  const timestamp = nowIso();
  const result = db.runSync(
    `UPDATE ${TASKS_TABLE}
     SET completed_at = ?, updated_at = ?
     WHERE id = ? AND kind = 'temporary' AND completed_at IS NULL;`,
    [timestamp, timestamp, normalizedId]
  );
  return result.changes > 0;
};

export const reopenTemporaryTask = (taskId: string): boolean => {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return false;
  }
  const result = db.runSync(
    `UPDATE ${TASKS_TABLE}
     SET completed_at = NULL, updated_at = ?
     WHERE id = ? AND kind = 'temporary';`,
    [nowIso(), normalizedId]
  );
  return result.changes > 0;
};

export const getTaskCompletions = (taskId: string): TaskCompletion[] => {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<TaskCompletionRow>(
    `SELECT * FROM ${TASK_COMPLETIONS_TABLE} WHERE task_id = ? ORDER BY completed_on DESC;`,
    [normalizedId]
  );
  return rows.map(rowToTaskCompletion);
};

export const getTaskCompletionDatesSet = (taskId: string): Set<string> => {
  return new Set(getTaskCompletions(taskId).map((item) => item.completedOn));
};

/** OR 集約: いずれかのタスクが完了した日付の和集合 */
export const getTasksCompletionDatesUnion = (taskIds: string[]): Set<string> => {
  const ids = taskIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return new Set();
  }
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.getAllSync<{ completed_on: string }>(
    `SELECT DISTINCT completed_on FROM ${TASK_COMPLETIONS_TABLE}
     WHERE task_id IN (${placeholders});`,
    ids
  );
  return new Set(rows.map((row) => row.completed_on));
};

export const getTaskCompletionCount = (taskId: string): number => {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return 0;
  }
  const row = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TASK_COMPLETIONS_TABLE} WHERE task_id = ?;`,
    [normalizedId]
  );
  return row?.count ?? 0;
};

export const isTaskCompletedOn = (taskId: string, ymd: string): boolean => {
  const row = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${TASK_COMPLETIONS_TABLE} WHERE task_id = ? AND completed_on = ? LIMIT 1;`,
    [taskId.trim(), ymd]
  );
  return Boolean(row);
};

export const setRecurringTaskCompletion = (taskId: string, ymd: string, completed: boolean): boolean => {
  const normalizedId = taskId.trim();
  const day = ymd.trim();
  if (!normalizedId || !day) {
    return false;
  }
  if (completed) {
    try {
      db.runSync(
        `INSERT OR IGNORE INTO ${TASK_COMPLETIONS_TABLE} (id, task_id, completed_on, created_at) VALUES (?, ?, ?, ?);`,
        [uuidv4(), normalizedId, day, nowIso()]
      );
      db.runSync(`UPDATE ${TASKS_TABLE} SET updated_at = ? WHERE id = ?;`, [nowIso(), normalizedId]);
      return true;
    } catch {
      return false;
    }
  }
  const result = db.runSync(
    `DELETE FROM ${TASK_COMPLETIONS_TABLE} WHERE task_id = ? AND completed_on = ?;`,
    [normalizedId, day]
  );
  return result.changes > 0;
};

export const deleteAllTaskCompletions = (taskId: string): number => {
  const normalizedId = taskId.trim();
  if (!normalizedId) {
    return 0;
  }
  const result = db.runSync(`DELETE FROM ${TASK_COMPLETIONS_TABLE} WHERE task_id = ?;`, [normalizedId]);
  db.runSync(`DELETE FROM ${TASK_SOFT_DONES_TABLE} WHERE task_id = ?;`, [normalizedId]);
  return result.changes;
};

export const isTaskSoftDoneOn = (taskId: string, ymd: string): boolean => {
  const row = db.getFirstSync<{ task_id: string }>(
    `SELECT task_id FROM ${TASK_SOFT_DONES_TABLE} WHERE task_id = ? AND done_on = ? LIMIT 1;`,
    [taskId.trim(), ymd]
  );
  return Boolean(row);
};

export const setTaskSoftDoneOn = (taskId: string, ymd: string, done: boolean): boolean => {
  const normalizedId = taskId.trim();
  const day = ymd.trim();
  if (!normalizedId || !day) {
    return false;
  }
  if (done) {
    try {
      db.runSync(
        `INSERT OR IGNORE INTO ${TASK_SOFT_DONES_TABLE} (task_id, done_on, created_at) VALUES (?, ?, ?);`,
        [normalizedId, day, nowIso()]
      );
      return true;
    } catch {
      return false;
    }
  }
  const result = db.runSync(
    `DELETE FROM ${TASK_SOFT_DONES_TABLE} WHERE task_id = ? AND done_on = ?;`,
    [normalizedId, day]
  );
  return result.changes > 0;
};

/** 記録ONなら履歴、OFFならソフト完了で「今日やった」を判定 */
export const isRecurringDoneOn = (task: Task, ymd: string): boolean => {
  if (task.kind !== 'recurring') {
    return false;
  }
  if (task.trackCompletions) {
    return isTaskCompletedOn(task.id, ymd);
  }
  return isTaskSoftDoneOn(task.id, ymd);
};

export const setRecurringDoneOn = (task: Task, ymd: string, done: boolean): boolean => {
  if (task.kind !== 'recurring') {
    return false;
  }
  if (task.trackCompletions) {
    return setRecurringTaskCompletion(task.id, ymd, done);
  }
  return setTaskSoftDoneOn(task.id, ymd, done);
};

export const purgeExpiredCompletedTemporaryTasks = (): number => {
  const retention = getCompletedTaskRetention();
  const cutoff = retentionToCutoffIso(retention);
  if (!cutoff) {
    return 0;
  }
  const rows = db.getAllSync<{ id: string }>(
    `SELECT id FROM ${TASKS_TABLE}
     WHERE kind = 'temporary' AND completed_at IS NOT NULL AND completed_at < ?;`,
    [cutoff]
  );
  if (rows.length === 0) {
    return 0;
  }
  return deleteTasksByIds(rows.map((row) => row.id));
};

// --- Relationship maps (相関図) ---

type RelationshipMapRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type RelationshipMapMemberRow = {
  id: string;
  map_id: string;
  friend_id: string;
  row: number;
  col: number;
};

type RelationshipGroupRow = {
  id: string;
  map_id: string;
  name: string;
  color: string;
  parent_group_id: string | null;
};

type RelationshipGroupMemberRow = {
  id: string;
  group_id: string;
  map_member_id: string;
};

type RelationshipRow = {
  id: string;
  map_id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  label: string | null;
  style: string;
};

const rowToRelationshipMap = (row: RelationshipMapRow): RelationshipMap => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToRelationshipMapMember = (row: RelationshipMapMemberRow): RelationshipMapMember => ({
  id: row.id,
  mapId: row.map_id,
  friendId: row.friend_id,
  row: row.row,
  col: row.col,
});

const rowToRelationshipGroup = (row: RelationshipGroupRow): RelationshipGroup => ({
  id: row.id,
  mapId: row.map_id,
  name: row.name,
  color: row.color,
  parentGroupId: row.parent_group_id,
});

const rowToRelationshipGroupMember = (row: RelationshipGroupMemberRow): RelationshipGroupMember => ({
  id: row.id,
  groupId: row.group_id,
  mapMemberId: row.map_member_id,
});

const parseRelationshipEndpointType = (value: string): RelationshipEndpointType | null => {
  if (value === 'person' || value === 'group') {
    return value;
  }
  return null;
};

const parseRelationshipArrowStyle = (value: string): RelationshipArrowStyle | null => {
  if (value === 'oneway' || value === 'both' || value === 'none') {
    return value;
  }
  return null;
};

const rowToRelationship = (row: RelationshipRow): Relationship | null => {
  const fromType = parseRelationshipEndpointType(row.from_type);
  const toType = parseRelationshipEndpointType(row.to_type);
  const style = parseRelationshipArrowStyle(row.style);
  if (!fromType || !toType || !style) {
    return null;
  }
  return {
    id: row.id,
    mapId: row.map_id,
    fromType,
    fromId: row.from_id,
    toType,
    toId: row.to_id,
    label: row.label,
    style,
  };
};

const touchRelationshipMapUpdatedAt = (mapId: string): void => {
  db.runSync(`UPDATE ${RELATIONSHIP_MAPS_TABLE} SET updated_at = ? WHERE id = ?;`, [nowIso(), mapId]);
};

export const getRelationshipMaps = (): RelationshipMap[] => {
  const rows = db.getAllSync<RelationshipMapRow>(
    `SELECT * FROM ${RELATIONSHIP_MAPS_TABLE} ORDER BY updated_at DESC;`
  );
  return rows.map(rowToRelationshipMap);
};

export const getRelationshipMap = (mapId: string): RelationshipMap | null => {
  const normalizedId = mapId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<RelationshipMapRow>(`SELECT * FROM ${RELATIONSHIP_MAPS_TABLE} WHERE id = ?;`, [
    normalizedId,
  ]);
  return row ? rowToRelationshipMap(row) : null;
};

export const createRelationshipMap = (input: RelationshipMapInput): RelationshipMap | null => {
  const title = input.title.trim();
  if (!title) {
    return null;
  }
  const timestamp = nowIso();
  const map: RelationshipMap = {
    id: uuidv4(),
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.runSync(
    `INSERT INTO ${RELATIONSHIP_MAPS_TABLE} (id, title, created_at, updated_at) VALUES (?, ?, ?, ?);`,
    [map.id, map.title, map.createdAt, map.updatedAt]
  );
  return map;
};

export const updateRelationshipMapTitle = (mapId: string, title: string): boolean => {
  const normalizedId = mapId.trim();
  const normalizedTitle = title.trim();
  if (!normalizedId || !normalizedTitle) {
    return false;
  }
  const result = db.runSync(
    `UPDATE ${RELATIONSHIP_MAPS_TABLE} SET title = ?, updated_at = ? WHERE id = ?;`,
    [normalizedTitle, nowIso(), normalizedId]
  );
  return result.changes > 0;
};

export const deleteRelationshipMap = (mapId: string): boolean => {
  const normalizedId = mapId.trim();
  if (!normalizedId) {
    return false;
  }
  const mapMembers = db.getAllSync<{ id: string }>(
    `SELECT id FROM ${RELATIONSHIP_MAP_MEMBERS_TABLE} WHERE map_id = ?;`,
    [normalizedId]
  );
  const groups = db.getAllSync<{ id: string }>(
    `SELECT id FROM ${RELATIONSHIP_GROUPS_TABLE} WHERE map_id = ?;`,
    [normalizedId]
  );
  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(`DELETE FROM ${RELATIONSHIPS_TABLE} WHERE map_id = ?;`, [normalizedId]);
    groups.forEach((group) => {
      db.runSync(`DELETE FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE group_id = ?;`, [group.id]);
    });
    db.runSync(`DELETE FROM ${RELATIONSHIP_GROUPS_TABLE} WHERE map_id = ?;`, [normalizedId]);
    mapMembers.forEach((member) => {
      db.runSync(`DELETE FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE map_member_id = ?;`, [member.id]);
    });
    db.runSync(`DELETE FROM ${RELATIONSHIP_MAP_MEMBERS_TABLE} WHERE map_id = ?;`, [normalizedId]);
    const result = db.runSync(`DELETE FROM ${RELATIONSHIP_MAPS_TABLE} WHERE id = ?;`, [normalizedId]);
    db.execSync('COMMIT;');
    return result.changes > 0;
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
};

export const getRelationshipMapMembers = (mapId: string): RelationshipMapMember[] => {
  const normalizedId = mapId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<RelationshipMapMemberRow>(
    `SELECT * FROM ${RELATIONSHIP_MAP_MEMBERS_TABLE} WHERE map_id = ? ORDER BY row ASC, col ASC;`,
    [normalizedId]
  );
  return rows.map(rowToRelationshipMapMember);
};

export const getRelationshipMapMember = (memberId: string): RelationshipMapMember | null => {
  const normalizedId = memberId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<RelationshipMapMemberRow>(
    `SELECT * FROM ${RELATIONSHIP_MAP_MEMBERS_TABLE} WHERE id = ?;`,
    [normalizedId]
  );
  return row ? rowToRelationshipMapMember(row) : null;
};

export const createRelationshipMapMember = (
  input: RelationshipMapMemberInput
): RelationshipMapMember | null => {
  const mapId = input.mapId.trim();
  const friendId = input.friendId.trim();
  if (!mapId || !friendId || !Number.isFinite(input.row) || !Number.isFinite(input.col)) {
    return null;
  }
  if (!getRelationshipMap(mapId)) {
    return null;
  }
  const existing = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${RELATIONSHIP_MAP_MEMBERS_TABLE} WHERE map_id = ? AND friend_id = ? LIMIT 1;`,
    [mapId, friendId]
  );
  if (existing) {
    return null;
  }
  const member: RelationshipMapMember = {
    id: uuidv4(),
    mapId,
    friendId,
    row: Math.trunc(input.row),
    col: Math.trunc(input.col),
  };
  db.runSync(
    `INSERT INTO ${RELATIONSHIP_MAP_MEMBERS_TABLE} (id, map_id, friend_id, row, col) VALUES (?, ?, ?, ?, ?);`,
    [member.id, member.mapId, member.friendId, member.row, member.col]
  );
  touchRelationshipMapUpdatedAt(mapId);
  return member;
};

export const updateRelationshipMapMemberPosition = (
  memberId: string,
  row: number,
  col: number
): boolean => {
  const normalizedId = memberId.trim();
  if (!normalizedId || !Number.isFinite(row) || !Number.isFinite(col)) {
    return false;
  }
  const existing = getRelationshipMapMember(normalizedId);
  if (!existing) {
    return false;
  }
  const result = db.runSync(
    `UPDATE ${RELATIONSHIP_MAP_MEMBERS_TABLE} SET row = ?, col = ? WHERE id = ?;`,
    [Math.trunc(row), Math.trunc(col), normalizedId]
  );
  if (result.changes > 0) {
    touchRelationshipMapUpdatedAt(existing.mapId);
  }
  return result.changes > 0;
};

export const deleteRelationshipMapMember = (memberId: string): boolean => {
  const normalizedId = memberId.trim();
  if (!normalizedId) {
    return false;
  }
  const existing = getRelationshipMapMember(normalizedId);
  if (!existing) {
    return false;
  }
  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(`DELETE FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE map_member_id = ?;`, [
      normalizedId,
    ]);
    db.runSync(
      `DELETE FROM ${RELATIONSHIPS_TABLE}
       WHERE map_id = ?
         AND (
           (from_type = 'person' AND from_id = ?)
           OR (to_type = 'person' AND to_id = ?)
         );`,
      [existing.mapId, normalizedId, normalizedId]
    );
    const result = db.runSync(`DELETE FROM ${RELATIONSHIP_MAP_MEMBERS_TABLE} WHERE id = ?;`, [
      normalizedId,
    ]);
    db.execSync('COMMIT;');
    if (result.changes > 0) {
      touchRelationshipMapUpdatedAt(existing.mapId);
    }
    return result.changes > 0;
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
};

export const getRelationshipGroups = (mapId: string): RelationshipGroup[] => {
  const normalizedId = mapId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<RelationshipGroupRow>(
    `SELECT * FROM ${RELATIONSHIP_GROUPS_TABLE} WHERE map_id = ? ORDER BY name COLLATE NOCASE ASC;`,
    [normalizedId]
  );
  return rows.map(rowToRelationshipGroup);
};

export const getRelationshipGroup = (groupId: string): RelationshipGroup | null => {
  const normalizedId = groupId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<RelationshipGroupRow>(
    `SELECT * FROM ${RELATIONSHIP_GROUPS_TABLE} WHERE id = ?;`,
    [normalizedId]
  );
  return row ? rowToRelationshipGroup(row) : null;
};

export const createRelationshipGroup = (input: RelationshipGroupInput): RelationshipGroup | null => {
  const mapId = input.mapId.trim();
  const name = input.name.trim();
  const color = input.color.trim();
  const parentGroupId = input.parentGroupId?.trim() || null;
  if (!mapId || !name || !color) {
    return null;
  }
  if (!getRelationshipMap(mapId)) {
    return null;
  }
  if (parentGroupId) {
    const parent = getRelationshipGroup(parentGroupId);
    if (!parent || parent.mapId !== mapId) {
      return null;
    }
  }
  const group: RelationshipGroup = {
    id: uuidv4(),
    mapId,
    name,
    color,
    parentGroupId,
  };
  db.runSync(
    `INSERT INTO ${RELATIONSHIP_GROUPS_TABLE} (id, map_id, name, color, parent_group_id) VALUES (?, ?, ?, ?, ?);`,
    [group.id, group.mapId, group.name, group.color, group.parentGroupId]
  );
  touchRelationshipMapUpdatedAt(mapId);
  return group;
};

export const updateRelationshipGroup = (
  groupId: string,
  patch: { name?: string; color?: string; parentGroupId?: string | null }
): boolean => {
  const existing = getRelationshipGroup(groupId);
  if (!existing) {
    return false;
  }
  const nextName = patch.name != null ? patch.name.trim() : existing.name;
  const nextColor = patch.color != null ? patch.color.trim() : existing.color;
  const nextParent =
    patch.parentGroupId === undefined
      ? existing.parentGroupId
      : patch.parentGroupId?.trim() || null;
  if (!nextName || !nextColor) {
    return false;
  }
  if (nextParent === existing.id) {
    return false;
  }
  if (nextParent) {
    const parent = getRelationshipGroup(nextParent);
    if (!parent || parent.mapId !== existing.mapId) {
      return false;
    }
    let walk: string | null = nextParent;
    const seen = new Set<string>();
    while (walk) {
      if (walk === existing.id) {
        return false;
      }
      if (seen.has(walk)) {
        break;
      }
      seen.add(walk);
      walk = getRelationshipGroup(walk)?.parentGroupId ?? null;
    }
  }
  const result = db.runSync(
    `UPDATE ${RELATIONSHIP_GROUPS_TABLE} SET name = ?, color = ?, parent_group_id = ? WHERE id = ?;`,
    [nextName, nextColor, nextParent, existing.id]
  );
  if (result.changes > 0) {
    touchRelationshipMapUpdatedAt(existing.mapId);
  }
  return result.changes > 0;
};

export const deleteRelationshipGroup = (groupId: string): boolean => {
  const existing = getRelationshipGroup(groupId);
  if (!existing) {
    return false;
  }
  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(
      `UPDATE ${RELATIONSHIP_GROUPS_TABLE} SET parent_group_id = NULL WHERE parent_group_id = ?;`,
      [existing.id]
    );
    db.runSync(`DELETE FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE group_id = ?;`, [existing.id]);
    db.runSync(
      `DELETE FROM ${RELATIONSHIPS_TABLE}
       WHERE map_id = ?
         AND (
           (from_type = 'group' AND from_id = ?)
           OR (to_type = 'group' AND to_id = ?)
         );`,
      [existing.mapId, existing.id, existing.id]
    );
    const result = db.runSync(`DELETE FROM ${RELATIONSHIP_GROUPS_TABLE} WHERE id = ?;`, [existing.id]);
    db.execSync('COMMIT;');
    if (result.changes > 0) {
      touchRelationshipMapUpdatedAt(existing.mapId);
    }
    return result.changes > 0;
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
};

export const getRelationshipGroupMembers = (groupId: string): RelationshipGroupMember[] => {
  const normalizedId = groupId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<RelationshipGroupMemberRow>(
    `SELECT * FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE group_id = ?;`,
    [normalizedId]
  );
  return rows.map(rowToRelationshipGroupMember);
};

export const getRelationshipGroupMembersByMapId = (mapId: string): RelationshipGroupMember[] => {
  const normalizedId = mapId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<RelationshipGroupMemberRow>(
    `SELECT gm.* FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} gm
     INNER JOIN ${RELATIONSHIP_GROUPS_TABLE} g ON g.id = gm.group_id
     WHERE g.map_id = ?;`,
    [normalizedId]
  );
  return rows.map(rowToRelationshipGroupMember);
};

export const addRelationshipGroupMember = (
  groupId: string,
  mapMemberId: string
): RelationshipGroupMember | null => {
  const normalizedGroupId = groupId.trim();
  const normalizedMemberId = mapMemberId.trim();
  if (!normalizedGroupId || !normalizedMemberId) {
    return null;
  }
  const group = getRelationshipGroup(normalizedGroupId);
  const member = getRelationshipMapMember(normalizedMemberId);
  if (!group || !member || group.mapId !== member.mapId) {
    return null;
  }
  const existingForMember = db.getFirstSync<{ id: string }>(
    `SELECT id FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE map_member_id = ? LIMIT 1;`,
    [normalizedMemberId]
  );
  if (existingForMember) {
    return null;
  }
  const link: RelationshipGroupMember = {
    id: uuidv4(),
    groupId: normalizedGroupId,
    mapMemberId: normalizedMemberId,
  };
  db.runSync(
    `INSERT INTO ${RELATIONSHIP_GROUP_MEMBERS_TABLE} (id, group_id, map_member_id) VALUES (?, ?, ?);`,
    [link.id, link.groupId, link.mapMemberId]
  );
  touchRelationshipMapUpdatedAt(group.mapId);
  return link;
};

export const removeRelationshipGroupMember = (groupMemberId: string): boolean => {
  const normalizedId = groupMemberId.trim();
  if (!normalizedId) {
    return false;
  }
  const row = db.getFirstSync<RelationshipGroupMemberRow>(
    `SELECT * FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE id = ?;`,
    [normalizedId]
  );
  if (!row) {
    return false;
  }
  const group = getRelationshipGroup(row.group_id);
  const result = db.runSync(`DELETE FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE id = ?;`, [
    normalizedId,
  ]);
  if (result.changes > 0 && group) {
    touchRelationshipMapUpdatedAt(group.mapId);
  }
  return result.changes > 0;
};

export const removeRelationshipGroupMemberByMapMember = (mapMemberId: string): boolean => {
  const normalizedId = mapMemberId.trim();
  if (!normalizedId) {
    return false;
  }
  const row = db.getFirstSync<RelationshipGroupMemberRow>(
    `SELECT * FROM ${RELATIONSHIP_GROUP_MEMBERS_TABLE} WHERE map_member_id = ? LIMIT 1;`,
    [normalizedId]
  );
  if (!row) {
    return false;
  }
  return removeRelationshipGroupMember(row.id);
};

export const getRelationships = (mapId: string): Relationship[] => {
  const normalizedId = mapId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<RelationshipRow>(
    `SELECT * FROM ${RELATIONSHIPS_TABLE} WHERE map_id = ?;`,
    [normalizedId]
  );
  return rows.map(rowToRelationship).filter((item): item is Relationship => item != null);
};

export const getRelationship = (relationshipId: string): Relationship | null => {
  const normalizedId = relationshipId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<RelationshipRow>(`SELECT * FROM ${RELATIONSHIPS_TABLE} WHERE id = ?;`, [
    normalizedId,
  ]);
  return row ? rowToRelationship(row) : null;
};

export const createRelationship = (input: RelationshipInput): Relationship | null => {
  const mapId = input.mapId.trim();
  const fromId = input.fromId.trim();
  const toId = input.toId.trim();
  const label = input.label?.trim() || null;
  if (!mapId || !fromId || !toId) {
    return null;
  }
  if (input.fromType === input.toType && fromId === toId) {
    return null;
  }
  if (!getRelationshipMap(mapId)) {
    return null;
  }
  if (input.fromType === 'person') {
    const member = getRelationshipMapMember(fromId);
    if (!member || member.mapId !== mapId) {
      return null;
    }
  } else {
    const group = getRelationshipGroup(fromId);
    if (!group || group.mapId !== mapId) {
      return null;
    }
  }
  if (input.toType === 'person') {
    const member = getRelationshipMapMember(toId);
    if (!member || member.mapId !== mapId) {
      return null;
    }
  } else {
    const group = getRelationshipGroup(toId);
    if (!group || group.mapId !== mapId) {
      return null;
    }
  }
  const relationship: Relationship = {
    id: uuidv4(),
    mapId,
    fromType: input.fromType,
    fromId,
    toType: input.toType,
    toId,
    label,
    style: input.style,
  };
  db.runSync(
    `INSERT INTO ${RELATIONSHIPS_TABLE} (
      id, map_id, from_type, from_id, to_type, to_id, label, style
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      relationship.id,
      relationship.mapId,
      relationship.fromType,
      relationship.fromId,
      relationship.toType,
      relationship.toId,
      relationship.label,
      relationship.style,
    ]
  );
  touchRelationshipMapUpdatedAt(mapId);
  return relationship;
};

export const updateRelationship = (
  relationshipId: string,
  patch: { label?: string | null; style?: RelationshipArrowStyle }
): boolean => {
  const existing = getRelationship(relationshipId);
  if (!existing) {
    return false;
  }
  const nextLabel = patch.label === undefined ? existing.label : patch.label?.trim() || null;
  const nextStyle = patch.style ?? existing.style;
  const result = db.runSync(`UPDATE ${RELATIONSHIPS_TABLE} SET label = ?, style = ? WHERE id = ?;`, [
    nextLabel,
    nextStyle,
    existing.id,
  ]);
  if (result.changes > 0) {
    touchRelationshipMapUpdatedAt(existing.mapId);
  }
  return result.changes > 0;
};

export const deleteRelationship = (relationshipId: string): boolean => {
  const existing = getRelationship(relationshipId);
  if (!existing) {
    return false;
  }
  const result = db.runSync(`DELETE FROM ${RELATIONSHIPS_TABLE} WHERE id = ?;`, [existing.id]);
  if (result.changes > 0) {
    touchRelationshipMapUpdatedAt(existing.mapId);
  }
  return result.changes > 0;
};

// --- Your questions (あなたの～は？) ---

type YourQuestionRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type YourQuestionAnswerRow = {
  id: string;
  question_id: string;
  friend_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

const rowToYourQuestion = (row: YourQuestionRow): YourQuestion => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToYourQuestionAnswer = (row: YourQuestionAnswerRow): YourQuestionAnswer => ({
  id: row.id,
  questionId: row.question_id,
  friendId: row.friend_id,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const touchYourQuestionUpdatedAt = (questionId: string): void => {
  db.runSync(`UPDATE ${YOUR_QUESTIONS_TABLE} SET updated_at = ? WHERE id = ?;`, [nowIso(), questionId]);
};

export const getYourQuestions = (): YourQuestion[] => {
  const rows = db.getAllSync<YourQuestionRow>(
    `SELECT * FROM ${YOUR_QUESTIONS_TABLE} ORDER BY updated_at DESC;`
  );
  return rows.map(rowToYourQuestion);
};

export const getYourQuestion = (questionId: string): YourQuestion | null => {
  const normalizedId = questionId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<YourQuestionRow>(`SELECT * FROM ${YOUR_QUESTIONS_TABLE} WHERE id = ?;`, [
    normalizedId,
  ]);
  return row ? rowToYourQuestion(row) : null;
};

export const createYourQuestion = (input: YourQuestionInput): YourQuestion | null => {
  const title = input.title.trim();
  if (!title) {
    return null;
  }
  const timestamp = nowIso();
  const question: YourQuestion = {
    id: uuidv4(),
    title,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.runSync(
    `INSERT INTO ${YOUR_QUESTIONS_TABLE} (id, title, created_at, updated_at) VALUES (?, ?, ?, ?);`,
    [question.id, question.title, question.createdAt, question.updatedAt]
  );
  return question;
};

export const updateYourQuestionTitle = (questionId: string, title: string): boolean => {
  const normalizedId = questionId.trim();
  const normalizedTitle = title.trim();
  if (!normalizedId || !normalizedTitle) {
    return false;
  }
  const result = db.runSync(
    `UPDATE ${YOUR_QUESTIONS_TABLE} SET title = ?, updated_at = ? WHERE id = ?;`,
    [normalizedTitle, nowIso(), normalizedId]
  );
  return result.changes > 0;
};

export const deleteYourQuestion = (questionId: string): boolean => {
  const normalizedId = questionId.trim();
  if (!normalizedId) {
    return false;
  }
  db.execSync('BEGIN IMMEDIATE;');
  try {
    db.runSync(`DELETE FROM ${YOUR_QUESTION_ANSWERS_TABLE} WHERE question_id = ?;`, [normalizedId]);
    const result = db.runSync(`DELETE FROM ${YOUR_QUESTIONS_TABLE} WHERE id = ?;`, [normalizedId]);
    db.execSync('COMMIT;');
    return result.changes > 0;
  } catch (error) {
    db.execSync('ROLLBACK;');
    throw error;
  }
};

export const getYourQuestionAnswers = (questionId: string): YourQuestionAnswer[] => {
  const normalizedId = questionId.trim();
  if (!normalizedId) {
    return [];
  }
  const rows = db.getAllSync<YourQuestionAnswerRow>(
    `SELECT * FROM ${YOUR_QUESTION_ANSWERS_TABLE} WHERE question_id = ? ORDER BY updated_at DESC;`,
    [normalizedId]
  );
  return rows.map(rowToYourQuestionAnswer);
};

export const getAllYourQuestionAnswers = (): YourQuestionAnswer[] => {
  const rows = db.getAllSync<YourQuestionAnswerRow>(
    `SELECT * FROM ${YOUR_QUESTION_ANSWERS_TABLE} ORDER BY updated_at DESC;`
  );
  return rows.map(rowToYourQuestionAnswer);
};

export const upsertYourQuestionAnswer = (
  input: YourQuestionAnswerInput
): YourQuestionAnswer | null => {
  const questionId = input.questionId.trim();
  const friendId = input.friendId.trim();
  const body = input.body.trim();
  if (!questionId || !friendId || !body) {
    return null;
  }
  if (!getYourQuestion(questionId)) {
    return null;
  }
  const timestamp = nowIso();
  const existing = db.getFirstSync<YourQuestionAnswerRow>(
    `SELECT * FROM ${YOUR_QUESTION_ANSWERS_TABLE} WHERE question_id = ? AND friend_id = ? LIMIT 1;`,
    [questionId, friendId]
  );
  if (existing) {
    db.runSync(
      `UPDATE ${YOUR_QUESTION_ANSWERS_TABLE} SET body = ?, updated_at = ? WHERE id = ?;`,
      [body, timestamp, existing.id]
    );
    touchYourQuestionUpdatedAt(questionId);
    return {
      ...rowToYourQuestionAnswer(existing),
      body,
      updatedAt: timestamp,
    };
  }
  const answer: YourQuestionAnswer = {
    id: uuidv4(),
    questionId,
    friendId,
    body,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.runSync(
    `INSERT INTO ${YOUR_QUESTION_ANSWERS_TABLE} (id, question_id, friend_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);`,
    [answer.id, answer.questionId, answer.friendId, answer.body, answer.createdAt, answer.updatedAt]
  );
  touchYourQuestionUpdatedAt(questionId);
  return answer;
};

export const deleteYourQuestionAnswer = (answerId: string): boolean => {
  const normalizedId = answerId.trim();
  if (!normalizedId) {
    return false;
  }
  const existing = db.getFirstSync<YourQuestionAnswerRow>(
    `SELECT * FROM ${YOUR_QUESTION_ANSWERS_TABLE} WHERE id = ?;`,
    [normalizedId]
  );
  if (!existing) {
    return false;
  }
  const result = db.runSync(`DELETE FROM ${YOUR_QUESTION_ANSWERS_TABLE} WHERE id = ?;`, [normalizedId]);
  if (result.changes > 0) {
    touchYourQuestionUpdatedAt(existing.question_id);
  }
  return result.changes > 0;
};

// --- Wishlist (行ってみたい・食べてみたい) ---

type WishlistItemRow = {
  id: string;
  kind: string;
  name: string;
  purpose_tags: string;
  location: string | null;
  cuisine: string | null;
  memo: string | null;
  link: string | null;
  created_at: string;
  updated_at: string;
};

const isWishlistKind = (value: string): value is WishlistKind =>
  value === 'visit' || value === 'eat';

const rowToWishlistItem = (row: WishlistItemRow): WishlistItem => ({
  id: row.id,
  kind: isWishlistKind(row.kind) ? row.kind : 'visit',
  name: row.name,
  purposeTags: fromJson(row.purpose_tags),
  location: row.location?.trim() || null,
  cuisine: row.cuisine?.trim() || null,
  memo: row.memo?.trim() || null,
  link: row.link?.trim() || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeWishlistPurposeTags = (kind: WishlistKind, tags: string[] | undefined): string[] => {
  if (kind !== 'visit') {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  (tags ?? []).forEach((tag) => {
    const normalized = tag.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

const normalizeWishlistNullableLabel = (
  kind: WishlistKind,
  expected: WishlistKind,
  value?: string | null
): string | null => {
  if (kind !== expected) {
    return null;
  }
  const normalized = value?.trim() ?? '';
  return normalized || null;
};

const normalizeWishlistOptionalText = (value?: string | null): string | null => {
  const normalized = value?.trim() ?? '';
  return normalized || null;
};

export const getWishlistItems = (kind?: WishlistKind): WishlistItem[] => {
  const rows =
    kind == null
      ? db.getAllSync<WishlistItemRow>(
          `SELECT * FROM ${WISHLIST_ITEMS_TABLE} ORDER BY updated_at DESC;`
        )
      : db.getAllSync<WishlistItemRow>(
          `SELECT * FROM ${WISHLIST_ITEMS_TABLE} WHERE kind = ? ORDER BY updated_at DESC;`,
          [kind]
        );
  return rows.map(rowToWishlistItem);
};

export const getWishlistItem = (itemId: string): WishlistItem | null => {
  const normalizedId = itemId.trim();
  if (!normalizedId) {
    return null;
  }
  const row = db.getFirstSync<WishlistItemRow>(`SELECT * FROM ${WISHLIST_ITEMS_TABLE} WHERE id = ?;`, [
    normalizedId,
  ]);
  return row ? rowToWishlistItem(row) : null;
};

export const createWishlistItem = (input: WishlistItemInput): WishlistItem | null => {
  const name = input.name.trim();
  if (!name) {
    return null;
  }
  const timestamp = nowIso();
  const item: WishlistItem = {
    id: uuidv4(),
    kind: input.kind,
    name,
    purposeTags: normalizeWishlistPurposeTags(input.kind, input.purposeTags),
    location: normalizeWishlistNullableLabel(input.kind, 'eat', input.location),
    cuisine: normalizeWishlistNullableLabel(input.kind, 'eat', input.cuisine),
    memo: normalizeWishlistOptionalText(input.memo),
    link: normalizeWishlistOptionalText(input.link),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db.runSync(
    `INSERT INTO ${WISHLIST_ITEMS_TABLE} (id, kind, name, purpose_tags, location, cuisine, memo, link, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      item.id,
      item.kind,
      item.name,
      toJson(item.purposeTags),
      item.location,
      item.cuisine,
      item.memo,
      item.link,
      item.createdAt,
      item.updatedAt,
    ]
  );
  return item;
};

export const updateWishlistItem = (itemId: string, input: WishlistItemInput): boolean => {
  const normalizedId = itemId.trim();
  const name = input.name.trim();
  if (!normalizedId || !name) {
    return false;
  }
  const purposeTags = normalizeWishlistPurposeTags(input.kind, input.purposeTags);
  const location = normalizeWishlistNullableLabel(input.kind, 'eat', input.location);
  const cuisine = normalizeWishlistNullableLabel(input.kind, 'eat', input.cuisine);
  const memo = normalizeWishlistOptionalText(input.memo);
  const link = normalizeWishlistOptionalText(input.link);
  const result = db.runSync(
    `UPDATE ${WISHLIST_ITEMS_TABLE} SET kind = ?, name = ?, purpose_tags = ?, location = ?, cuisine = ?, memo = ?, link = ?, updated_at = ? WHERE id = ?;`,
    [input.kind, name, toJson(purposeTags), location, cuisine, memo, link, nowIso(), normalizedId]
  );
  return result.changes > 0;
};

export const deleteWishlistItem = (itemId: string): boolean => {
  const normalizedId = itemId.trim();
  if (!normalizedId) {
    return false;
  }
  const result = db.runSync(`DELETE FROM ${WISHLIST_ITEMS_TABLE} WHERE id = ?;`, [normalizedId]);
  return result.changes > 0;
};

export const getDistinctWishlistPurposeTags = (): string[] => {
  const rows = db.getAllSync<{ purpose_tags: string }>(
    `SELECT purpose_tags FROM ${WISHLIST_ITEMS_TABLE} WHERE kind = 'visit';`
  );
  const seen = new Set<string>();
  rows.forEach((row) => {
    fromJson(row.purpose_tags).forEach((tag) => {
      const normalized = tag.trim();
      if (normalized) {
        seen.add(normalized);
      }
    });
  });
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'ja'));
};

export const getDistinctWishlistLocations = (): string[] => {
  const rows = db.getAllSync<{ location: string | null }>(
    `SELECT DISTINCT location FROM ${WISHLIST_ITEMS_TABLE} WHERE kind = 'eat' AND location IS NOT NULL AND TRIM(location) != '';`
  );
  return rows
    .map((row) => row.location?.trim() ?? '')
    .filter((value) => value.length > 0)
    .sort((a, b) => a.localeCompare(b, 'ja'));
};

export const getDistinctWishlistCuisines = (): string[] => {
  const rows = db.getAllSync<{ cuisine: string | null }>(
    `SELECT DISTINCT cuisine FROM ${WISHLIST_ITEMS_TABLE} WHERE kind = 'eat' AND cuisine IS NOT NULL AND TRIM(cuisine) != '';`
  );
  return rows
    .map((row) => row.cuisine?.trim() ?? '')
    .filter((value) => value.length > 0)
    .sort((a, b) => a.localeCompare(b, 'ja'));
};

