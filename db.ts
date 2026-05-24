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
  FRIENDDEX_BACKUP_TABLE_NAMES,
  Friend,
  FriendDexBackup,
  FriendDexBackupRow,
  FriendDexBackupTableName,
  FriendInput,
  FriendSearchFilters,
  Profile,
  Saying,
} from './types';

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

const DB_NAME = 'frienddex.db';
const FRIENDS_TABLE = 'friends';
const SETTINGS_TABLE = 'app_settings';
const PROFILES_TABLE = 'friend_profiles';
const COMMON_ITEM_OPTIONS_TABLE = 'common_item_options';
export const EPISODE_PHOTOS_TABLE = 'episode_photos';
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

const isEpisodeParticipant = (value: unknown): value is EpisodeParticipant => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const participant = value as Partial<EpisodeParticipant>;
  return (
    (participant.kind === 'individual' || participant.kind === 'group') &&
    typeof participant.value === 'string' &&
    typeof participant.isMain === 'boolean'
  );
};

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

const sanitizeEpisode = (value: unknown): Episode | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<Episode>;
  const participantEntries = Array.isArray(candidate.participantEntries)
    ? candidate.participantEntries.filter(isEpisodeParticipant)
    : [];
  const visibilityEntries = Array.isArray(candidate.visibilityEntries)
    ? candidate.visibilityEntries.filter(isEpisodeVisibilityEntry)
    : [];
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.date !== 'string' ||
    typeof candidate.description !== 'string' ||
    !isStringArray(candidate.mainParticipants) ||
    !isStringArray(candidate.subParticipants)
  ) {
    return null;
  }

  const normalizedMain = Array.from(new Set(candidate.mainParticipants));
  const normalizedSub = Array.from(new Set(candidate.subParticipants)).filter((id) => !normalizedMain.includes(id));
  const fallbackEntries: EpisodeParticipant[] = [
    ...normalizedMain.map((value) => ({ kind: 'individual' as const, value, isMain: true })),
    ...normalizedSub.map((value) => ({ kind: 'individual' as const, value, isMain: false })),
  ];

  return {
    id: candidate.id,
    title: candidate.title,
    date: candidate.date,
    description: candidate.description,
    authorFriendId: typeof candidate.authorFriendId === 'string' ? candidate.authorFriendId : '',
    mainParticipants: normalizedMain,
    subParticipants: normalizedSub,
    participantEntries: participantEntries.length > 0 ? participantEntries : fallbackEntries,
    visibilityEntries: uniqueVisibilityEntries(visibilityEntries),
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
        description, photoUri, affiliations, personalities, experiences, traits, likes, dislikes, episodes, sayings, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
      timestamp,
      timestamp,
    ]
  );

  return { id: personId, ...input, episodes: input.episodes ?? [], sayings: input.sayings ?? [] };
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

type EpisodeInput = Omit<Episode, 'id' | 'authorFriendId'>;

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

const collectEpisodeParticipantIds = (episode: Pick<EpisodeInput, 'mainParticipants' | 'subParticipants'>): string[] => {
  const participants = [...episode.mainParticipants, ...episode.subParticipants];
  return Array.from(new Set(participants.filter((id) => id.trim().length > 0)));
};

const uniqueParticipantEntries = (entries: EpisodeParticipant[]): EpisodeParticipant[] => {
  const seen = new Set<string>();
  const normalized: EpisodeParticipant[] = [];
  entries.forEach((entry) => {
    if (!entry.value.trim()) {
      return;
    }
    const key = `${entry.kind}:${entry.value}:${entry.isMain ? 'main' : 'sub'}`;
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(entry);
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

const resolveParticipantsFromEntries = (
  episodeInput: EpisodeInput
): { mainParticipants: string[]; subParticipants: string[]; participantEntries: EpisodeParticipant[] } => {
  const rows = db.getAllSync<{ friendId: string; affiliations: string }>(
    `SELECT friendId, affiliations FROM ${PROFILES_TABLE} WHERE isDefault = 1;`
  );
  const mainSet = new Set(episodeInput.mainParticipants);
  const subSet = new Set(episodeInput.subParticipants);
  const entries = uniqueParticipantEntries(episodeInput.participantEntries ?? []);

  entries.forEach((entry) => {
    const targetIds =
      entry.kind === 'individual' ? [entry.value] : collectAffiliationMemberIds(rows, entry.value);
    targetIds.forEach((id) => {
      if (entry.isMain) {
        mainSet.add(id);
        subSet.delete(id);
      } else if (!mainSet.has(id)) {
        subSet.add(id);
      }
    });
  });

  const mainParticipants = Array.from(mainSet).filter((id) => id.trim().length > 0);
  const subParticipants = Array.from(subSet).filter((id) => id.trim().length > 0 && !mainSet.has(id));
  return { mainParticipants, subParticipants, participantEntries: entries };
};

const ensureRequiredIndividualParticipants = (
  resolved: { mainParticipants: string[]; subParticipants: string[]; participantEntries: EpisodeParticipant[] },
  ownerFriendId: string,
  myselfId: string | null
): { mainParticipants: string[]; subParticipants: string[]; participantEntries: EpisodeParticipant[] } => {
  const requiredIds = Array.from(
    new Set([ownerFriendId.trim(), myselfId?.trim() ?? ''].filter((id) => id.length > 0))
  );

  const mainSet = new Set(resolved.mainParticipants);
  const subSet = new Set(resolved.subParticipants);
  requiredIds.forEach((id) => {
    if (!mainSet.has(id) && !subSet.has(id)) {
      subSet.add(id);
    }
  });

  const nextEntries = [...resolved.participantEntries];
  requiredIds.forEach((id) => {
    const hasEntry = nextEntries.some((entry) => entry.kind === 'individual' && entry.value === id);
    if (!hasEntry) {
      nextEntries.push({ kind: 'individual', value: id, isMain: mainSet.has(id) });
    }
  });

  const mainParticipants = Array.from(mainSet).filter((id) => id.trim().length > 0);
  const subParticipants = Array.from(subSet).filter((id) => id.trim().length > 0 && !mainSet.has(id));
  return { mainParticipants, subParticipants, participantEntries: nextEntries };
};

export const createEpisode = (ownerFriendId: string, input: EpisodeInput): Episode | null => {
  const owner = getFriendById(ownerFriendId);
  if (!owner) {
    return null;
  }

  const resolved = ensureRequiredIndividualParticipants(resolveParticipantsFromEntries(input), ownerFriendId, getMyself());
  const visibilityEntries = uniqueVisibilityEntries(input.visibilityEntries ?? []);
  const episode: Episode = {
    ...input,
    id: uuidv4(),
    authorFriendId: ownerFriendId,
    mainParticipants: resolved.mainParticipants,
    subParticipants: resolved.subParticipants,
    participantEntries: resolved.participantEntries,
    visibilityEntries,
  };

  const targetIds = Array.from(new Set([ownerFriendId, ...collectEpisodeParticipantIds(resolved)]));
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

export const getEpisodeById = (friendId: string, episodeId: string): Episode | null => {
  const episodes = getEpisodes(friendId);
  return episodes.find((episode) => episode.id === episodeId) ?? null;
};

export const updateEpisode = (ownerFriendId: string, episodeId: string, input: EpisodeInput): boolean => {
  const owner = getFriendById(ownerFriendId);
  if (!owner) {
    return false;
  }

  const previousEpisode = owner.episodes.find((episode) => episode.id === episodeId);
  if (!previousEpisode) {
    return false;
  }

  const resolved = ensureRequiredIndividualParticipants(resolveParticipantsFromEntries(input), ownerFriendId, getMyself());
  const visibilityEntries = uniqueVisibilityEntries(input.visibilityEntries ?? []);
  const updatedEpisode: Episode = {
    id: episodeId,
    title: input.title,
    date: input.date,
    description: input.description,
    authorFriendId: previousEpisode.authorFriendId,
    mainParticipants: resolved.mainParticipants,
    subParticipants: resolved.subParticipants,
    participantEntries: resolved.participantEntries,
    visibilityEntries,
  };

  const previousTargets = new Set([
    ownerFriendId,
    ...previousEpisode.mainParticipants,
    ...previousEpisode.subParticipants,
  ]);
  const nextTargets = new Set([ownerFriendId, ...updatedEpisode.mainParticipants, ...updatedEpisode.subParticipants]);
  const unionTargetIds = Array.from(new Set([...previousTargets, ...nextTargets]));
  const rows = getDefaultProfileRowsByPersonIds(unionTargetIds);
  const timestamp = nowIso();

  rows.forEach((row) => {
    const shouldHaveEpisode = nextTargets.has(row.friendId);
    const existingEpisodes = fromEpisodeJson(row.episodes);
    const withoutTarget = existingEpisodes.filter((episode) => episode.id !== episodeId);
    const nextEpisodes = shouldHaveEpisode ? [...withoutTarget, updatedEpisode] : withoutTarget;
    db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
      toEpisodeJson(nextEpisodes),
      timestamp,
      row.id,
    ]);
  });

  return true;
};

export const deleteEpisode = (ownerFriendId: string, episodeId: string): boolean => {
  const owner = getFriendById(ownerFriendId);
  if (!owner) {
    return false;
  }

  const targetEpisode = owner.episodes.find((episode) => episode.id === episodeId);
  if (!targetEpisode) {
    return false;
  }

  const targetIds = Array.from(
    new Set([ownerFriendId, ...targetEpisode.mainParticipants, ...targetEpisode.subParticipants])
  );
  const rows = getDefaultProfileRowsByPersonIds(targetIds);
  const timestamp = nowIso();
  let changed = false;

  rows.forEach((row) => {
    const existingEpisodes = fromEpisodeJson(row.episodes);
    const nextEpisodes = existingEpisodes.filter((episode) => episode.id !== episodeId);
    if (nextEpisodes.length !== existingEpisodes.length) {
      changed = true;
      db.runSync(`UPDATE ${PROFILES_TABLE} SET episodes = ?, updatedAt = ? WHERE id = ?;`, [
        toEpisodeJson(nextEpisodes),
        timestamp,
        row.id,
      ]);
    }
  });

  if (changed) {
    deleteEpisodePhotosByEpisodeId(episodeId);
  }

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
  const relatedEpisodeMap = new Map<string, { episode: Episode; shouldBeMain: boolean }>();

  allFriends.forEach((friend) => {
    friend.episodes.forEach((episode) => {
      const entries = episode.participantEntries ?? [];
      const matchedEntries = entries.filter(
        (entry) => entry.kind === 'group' && targetAffiliations.has(entry.value.trim())
      );
      if (matchedEntries.length === 0) {
        return;
      }
      const shouldBeMain = matchedEntries.some((entry) => entry.isMain);
      const existing = relatedEpisodeMap.get(episode.id);
      if (!existing || (!existing.shouldBeMain && shouldBeMain)) {
        relatedEpisodeMap.set(episode.id, { episode, shouldBeMain });
      }
    });
  });

  if (relatedEpisodeMap.size === 0) {
    return false;
  }

  const episodeById = new Map(targetFriend.episodes.map((episode) => [episode.id, episode]));
  let changed = false;

  relatedEpisodeMap.forEach(({ episode, shouldBeMain }, episodeId) => {
    const existing = episodeById.get(episodeId);
    const source = existing ?? episode;
    const mainSet = new Set(source.mainParticipants);
    const subSet = new Set(source.subParticipants);

    const hadMain = mainSet.has(friendId);
    const hadSub = subSet.has(friendId);

    if (shouldBeMain) {
      mainSet.add(friendId);
      subSet.delete(friendId);
    } else if (!mainSet.has(friendId)) {
      subSet.add(friendId);
    }

    if (!existing) {
      changed = true;
    }
    if (hadMain !== mainSet.has(friendId) || hadSub !== subSet.has(friendId)) {
      changed = true;
    }

    episodeById.set(episodeId, {
      ...source,
      mainParticipants: Array.from(mainSet),
      subParticipants: Array.from(subSet).filter((id) => !mainSet.has(id)),
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
  columnName: 'affiliations' | 'experiences' | 'personalities'
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

const getProfileColumnByKind = (
  kind: CommonItemKind
): 'affiliations' | 'experiences' | 'personalities' | null => {
  if (kind === 'affiliation') return 'affiliations';
  if (kind === 'experience') return 'experiences';
  if (kind === 'personality') return 'personalities';
  return null;
};

const rewriteProfileArrayColumnValue = (
  columnName: 'affiliations' | 'experiences' | 'personalities',
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
  return extractDistinctVisibilityGroupsFromProfiles();
};

export const getDistinctAffiliations = (): string[] => extractDistinctFromProfilesJsonArrayColumn('affiliations');

export const getDistinctExperiences = (): string[] => extractDistinctFromProfilesJsonArrayColumn('experiences');

export const getDistinctPersonalities = (): string[] => extractDistinctFromProfilesJsonArrayColumn('personalities');

export const getDistinctVisibilityGroups = (): string[] => extractDistinctVisibilityGroupsFromProfiles();

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
    rewriteVisibilityGroupsInProfiles(target.label, normalized);
  }

  db.runSync(`UPDATE ${COMMON_ITEM_OPTIONS_TABLE} SET label = ?, updatedAt = ? WHERE id = ?;`, [normalized, nowIso(), id]);
  return true;
};

export const deleteCommonItemOption = (id: string): boolean => {
  const target = db.getFirstSync<CommonItemOptionRow>(`SELECT * FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE id = ? LIMIT 1;`, [id]);
  if (!target) {
    return false;
  }

  const column = getProfileColumnByKind(target.kind);
  if (column) {
    rewriteProfileArrayColumnValue(column, target.label, null);
  } else {
    rewriteVisibilityGroupsInProfiles(target.label, null);
  }

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

  const column = getProfileColumnByKind(kind);
  if (column) {
    rewriteProfileArrayColumnValue(column, from, to);
  } else {
    rewriteVisibilityGroupsInProfiles(from, to);
  }

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

  const column = getProfileColumnByKind(kind);
  if (column) {
    rewriteProfileArrayColumnValue(column, normalized, null);
  } else {
    rewriteVisibilityGroupsInProfiles(normalized, null);
  }

  db.runSync(`DELETE FROM ${COMMON_ITEM_OPTIONS_TABLE} WHERE kind = ? AND label = ?;`, [kind, normalized]);
  return true;
};

const addLabelToProfilesByFriendIds = (
  columnName: 'affiliations' | 'experiences' | 'personalities',
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
  columnName: 'affiliations' | 'experiences' | 'personalities',
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

const BACKUP_TABLE_SQL: Record<FriendDexBackupTableName, string> = {
  friend_profiles: PROFILES_TABLE,
  app_settings: SETTINGS_TABLE,
  common_item_options: COMMON_ITEM_OPTIONS_TABLE,
  episode_photos: EPISODE_PHOTOS_TABLE,
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
    version: 2,
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

