export type MBTIType =
  | ''
  | 'INTJ'
  | 'INTP'
  | 'ENTJ'
  | 'ENTP'
  | 'INFJ'
  | 'INFP'
  | 'ENFJ'
  | 'ENFP'
  | 'ISTJ'
  | 'ISFJ'
  | 'ESTJ'
  | 'ESFJ'
  | 'ISTP'
  | 'ISFP'
  | 'ESTP'
  | 'ESFP';

export const MBTI_TYPES: MBTIType[] = [
  'INTJ',
  'INTP',
  'ENTJ',
  'ENTP',
  'INFJ',
  'INFP',
  'ENFJ',
  'ENFP',
  'ISTJ',
  'ISFJ',
  'ESTJ',
  'ESFJ',
  'ISTP',
  'ISFP',
  'ESTP',
  'ESFP',
];

export type EpisodeParticipant = {
  kind: 'individual' | 'group';
  value: string;
  isMain: boolean;
};

/** エピソードの公開範囲（参加者とは別に保持） */
export type EpisodeVisibilityEntry = {
  kind: 'individual' | 'group';
  value: string;
};

export type EpisodeVisibilityMode = 'public' | 'limited' | 'private';

export type Episode = {
  id: string;
  title: string;
  date: string;
  description: string;
  authorFriendId: string;
  visibilityMode: EpisodeVisibilityMode;
  mainParticipants: string[];
  subParticipants: string[];
  participantEntries: EpisodeParticipant[];
  visibilityEntries: EpisodeVisibilityEntry[];
};

export type EpisodePhoto = {
  id: number;
  episodeId: string;
  photoUri: string;
  sortOrder: number;
  createdAt: string;
};

export type Saying = {
  id: string;
  text: string;
  date: string;
};

export type Profile = {
  id: string;
  friendId: string;
  /** 人物名（同一 friendId の全プロフィールで共通） */
  name: string;
  authorUserId: string | null;
  source: 'self' | 'shared';
  isDefault: boolean;
  nickname: string;
  origin: string;
  residence: string;
  mbti: MBTIType;
  birthday: string;
  height: number | null;
  weight: number | null;
  category: string;
  description: string;
  photoUri: string | null;
  affiliations: string[];
  personalities: string[];
  experiences: string[];
  traits: string[];
  likes: string[];
  dislikes: string[];
  episodes: Episode[];
  sayings: Saying[];
  createdAt: string;
  updatedAt: string;
};

export type Friend = {
  id: string;
  name: string;
  nickname: string;
  origin: string;
  residence: string;
  mbti: MBTIType;
  birthday: string;
  height: number | null;
  weight: number | null;
  category: string;
  description: string;
  photoUri: string | null;
  affiliations: string[];
  personalities: string[];
  experiences: string[];
  traits: string[];
  likes: string[];
  dislikes: string[];
  episodes: Episode[];
  sayings: Saying[];
  profiles?: Profile[];
  activeProfileId?: string;
};

export type FriendInput = Omit<Friend, 'id' | 'episodes' | 'sayings'> & {
  episodes?: Episode[];
  sayings?: Saying[];
};

export type FriendSearchFilters = {
  name?: string;
  affiliation1?: string;
  affiliation2?: string;
  birthMonth?: number;
  mbti?: MBTIType;
  experience?: string;
};

export type CommonItemKind = 'affiliation' | 'experience' | 'personality' | 'visibility_group';

export type CommonItemOption = {
  id: string;
  kind: CommonItemKind;
  label: string;
  members: string[];
  createdAt: string;
  updatedAt: string;
};

export const FRIENDDEX_BACKUP_V1_TABLE_NAMES = [
  'friend_profiles',
  'app_settings',
  'common_item_options',
] as const;

export const FRIENDDEX_BACKUP_TABLE_NAMES = [
  ...FRIENDDEX_BACKUP_V1_TABLE_NAMES,
  'episode_photos',
] as const;

export type FriendDexBackupTableName = (typeof FRIENDDEX_BACKUP_TABLE_NAMES)[number];

export type FriendDexBackupRow = Record<string, string | number | null>;

export type FriendDexBackup = {
  version: 1 | 2;
  exportedAt: string;
  tables: Record<(typeof FRIENDDEX_BACKUP_V1_TABLE_NAMES)[number], FriendDexBackupRow[]> & {
    episode_photos?: FriendDexBackupRow[];
  };
};

