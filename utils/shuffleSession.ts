import { getAppSetting, initializeDatabase, setAppSetting } from '@/db';
import {
  createDefaultRankTiers,
  createEmptyRoleDraft,
  normalizeShuffleMemberIds,
  resolveRoleName,
  sanitizeExcludedMemberIds,
  sanitizeRoleDraftsForPool,
  sanitizeTeamSettingsForPool,
  type ShuffleRankTier,
  type ShuffleRoleAssignment,
  type ShuffleRoleDraft,
  type ShuffleTeamAssignment,
} from './shuffleHelpers';

export const SHUFFLE_SESSION_SETTING_KEY = 'shuffle.session';

export type ShuffleMode = 'random' | 'order' | 'role' | 'team';

export type ShufflePoolDraft = {
  memberIds: string[];
  label: string;
  labelIsCustom: boolean;
};

export const SHUFFLE_RESULT_COLUMNS_MIN = 3;
export const SHUFFLE_RESULT_COLUMNS_MAX = 6;
export const SHUFFLE_RESULT_COLUMNS_DEFAULT = 3;

export function clampShuffleResultColumns(value: number): number {
  if (!Number.isFinite(value)) {
    return SHUFFLE_RESULT_COLUMNS_DEFAULT;
  }
  return Math.min(
    SHUFFLE_RESULT_COLUMNS_MAX,
    Math.max(SHUFFLE_RESULT_COLUMNS_MIN, Math.round(value))
  );
}

export function nextShuffleResultColumns(value: number): number {
  const current = clampShuffleResultColumns(value);
  return current >= SHUFFLE_RESULT_COLUMNS_MAX
    ? SHUFFLE_RESULT_COLUMNS_MIN
    : current + 1;
}

export type ShuffleOrderLayout = 'wrap' | 'split';

export function parseShuffleOrderLayout(value: unknown): ShuffleOrderLayout {
  return value === 'split' ? 'split' : 'wrap';
}

export type ShuffleRunRecord = {
  key: string;
  count: number;
};

export type ShuffleRunByMode = Record<ShuffleMode, ShuffleRunRecord>;

export type ShuffleSessionState = {
  poolDraft: ShufflePoolDraft | null;
  shuffleMode: ShuffleMode;
  pickCount: number;
  resultColumns: number;
  resultMemberIds: string[] | null;
  orderResultMemberIds: string[] | null;
  orderLayout: ShuffleOrderLayout;
  orderExcludedMemberIds: string[];
  roleDrafts: ShuffleRoleDraft[];
  roleAssignments: ShuffleRoleAssignment[] | null;
  teamCount: number;
  useRanks: boolean;
  rankTiers: ShuffleRankTier[];
  memberRankById: Record<string, string>;
  teams: ShuffleTeamAssignment[] | null;
  runByMode: ShuffleRunByMode;
};

const SHUFFLE_MODES: readonly ShuffleMode[] = ['random', 'order', 'role', 'team'];

let memoryCache: ShuffleSessionState | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function cloneSession(state: ShuffleSessionState): ShuffleSessionState {
  return JSON.parse(JSON.stringify(state)) as ShuffleSessionState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parsePoolDraft(value: unknown): ShufflePoolDraft | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!isStringArray(value.memberIds) || typeof value.label !== 'string') {
    return null;
  }
  if (value.memberIds.length === 0) {
    return null;
  }
  return {
    memberIds: value.memberIds,
    label: value.label,
    labelIsCustom: value.labelIsCustom === true,
  };
}

function parseRoleDraft(value: unknown): ShuffleRoleDraft | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }
  if (typeof value.count !== 'number' || !Number.isFinite(value.count)) {
    return null;
  }
  if (!isStringArray(value.excludedMemberIds)) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    count: value.count,
    excludedMemberIds: value.excludedMemberIds,
  };
}

function parseRoleAssignment(value: unknown): ShuffleRoleAssignment | null {
  if (!isRecord(value) || typeof value.roleName !== 'string' || !isStringArray(value.memberIds)) {
    return null;
  }
  return { roleName: value.roleName, memberIds: value.memberIds };
}

function parseRankTier(value: unknown): ShuffleRankTier | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string') {
    return null;
  }
  return { id: value.id, label: value.label };
}

function parseTeamAssignment(value: unknown): ShuffleTeamAssignment | null {
  if (!isRecord(value) || typeof value.teamName !== 'string' || !isStringArray(value.memberIds)) {
    return null;
  }
  return { teamName: value.teamName, memberIds: value.memberIds };
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const next: Record<string, string> = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (typeof entry === 'string') {
      next[key] = entry;
    }
  });
  return next;
}

export function createEmptyShuffleRunByMode(): ShuffleRunByMode {
  return {
    random: { key: '', count: 0 },
    order: { key: '', count: 0 },
    role: { key: '', count: 0 },
    team: { key: '', count: 0 },
  };
}

function parseRunRecord(value: unknown): ShuffleRunRecord {
  if (!isRecord(value)) {
    return { key: '', count: 0 };
  }
  const key = typeof value.key === 'string' ? value.key : '';
  const count =
    typeof value.count === 'number' && Number.isFinite(value.count) && value.count > 0
      ? Math.floor(value.count)
      : 0;
  return { key, count };
}

function parseRunByMode(value: unknown): ShuffleRunByMode {
  const empty = createEmptyShuffleRunByMode();
  if (!isRecord(value)) {
    return empty;
  }
  return {
    random: parseRunRecord(value.random),
    order: parseRunRecord(value.order),
    role: parseRunRecord(value.role),
    team: parseRunRecord(value.team),
  };
}

function membersFingerprint(memberIds: readonly string[] | undefined): string {
  return normalizeShuffleMemberIds([...(memberIds ?? [])]).join(',');
}

export function buildShuffleConditionKey(
  session: ShuffleSessionState,
  mode: ShuffleMode
): string {
  const members = membersFingerprint(session.poolDraft?.memberIds);
  switch (mode) {
    case 'random':
      return `random|${members}|${session.pickCount}`;
    case 'order':
      return `order|${members}|${membersFingerprint(session.orderExcludedMemberIds)}`;
    case 'role':
      return `role|${members}|${session.roleDrafts
        .map(
          (role, index) =>
            `${resolveRoleName(role.name, index + 1)}\t${role.count}\t${membersFingerprint(role.excludedMemberIds)}`
        )
        .join('|')}`;
    case 'team': {
      if (!session.useRanks) {
        return `team|${members}|${session.teamCount}|0`;
      }
      const tiers = session.rankTiers.map((tier) => `${tier.id}:${tier.label}`).join(',');
      const assignments = Object.entries(session.memberRankById)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([memberId, tierId]) => `${memberId}:${tierId}`)
        .join(',');
      return `team|${members}|${session.teamCount}|1|${tiers}|${assignments}`;
    }
    default:
      return members;
  }
}

export function formatShuffleRunLabel(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) {
    return null;
  }
  return `#${String(Math.floor(count)).padStart(3, '0')}`;
}

export function getShuffleRunLabel(
  session: ShuffleSessionState,
  mode: ShuffleMode
): string | null {
  return formatShuffleRunLabel(session.runByMode?.[mode]?.count ?? 0);
}

export function advanceShuffleRun(
  session: ShuffleSessionState,
  mode: ShuffleMode
): ShuffleSessionState {
  const key = buildShuffleConditionKey(session, mode);
  const previous = session.runByMode?.[mode] ?? { key: '', count: 0 };
  const count = previous.key === key && previous.count > 0 ? previous.count + 1 : 1;
  return {
    ...session,
    runByMode: {
      ...createEmptyShuffleRunByMode(),
      ...session.runByMode,
      [mode]: { key, count },
    },
  };
}

export function createDefaultShuffleSession(): ShuffleSessionState {
  return {
    poolDraft: null,
    shuffleMode: 'random',
    pickCount: 1,
    resultColumns: SHUFFLE_RESULT_COLUMNS_DEFAULT,
    resultMemberIds: null,
    orderResultMemberIds: null,
    orderLayout: 'wrap',
    orderExcludedMemberIds: [],
    roleDrafts: [createEmptyRoleDraft(1)],
    roleAssignments: null,
    teamCount: 2,
    useRanks: false,
    rankTiers: createDefaultRankTiers(),
    memberRankById: {},
    teams: null,
    runByMode: createEmptyShuffleRunByMode(),
  };
}

export function coerceShuffleSession(raw: ShuffleSessionState): ShuffleSessionState {
  if (!raw.poolDraft || raw.poolDraft.memberIds.length === 0) {
    return {
      ...raw,
      poolDraft: null,
      pickCount: 1,
      resultColumns: clampShuffleResultColumns(raw.resultColumns),
      resultMemberIds: null,
      orderResultMemberIds: null,
      orderLayout: parseShuffleOrderLayout(raw.orderLayout),
      orderExcludedMemberIds: [],
      roleAssignments: null,
      teams: null,
      runByMode: createEmptyShuffleRunByMode(),
    };
  }

  const memberIds = raw.poolDraft.memberIds;
  const team = sanitizeTeamSettingsForPool(
    raw.teamCount,
    raw.memberRankById,
    raw.rankTiers,
    memberIds
  );
  const roleDrafts =
    raw.roleDrafts.length > 0
      ? sanitizeRoleDraftsForPool(raw.roleDrafts, memberIds)
      : [createEmptyRoleDraft(1)];

  return {
    ...raw,
    pickCount: Math.min(Math.max(1, raw.pickCount), memberIds.length),
    resultColumns: clampShuffleResultColumns(raw.resultColumns),
    orderLayout: parseShuffleOrderLayout(raw.orderLayout),
    orderExcludedMemberIds: sanitizeExcludedMemberIds(
      raw.orderExcludedMemberIds ?? [],
      memberIds
    ),
    roleDrafts,
    runByMode: raw.runByMode ?? createEmptyShuffleRunByMode(),
    ...team,
  };
}

export function resetShuffleResultsForMemberChange(
  session: ShuffleSessionState
): ShuffleSessionState {
  const next = coerceShuffleSession(session);
  return {
    ...next,
    resultMemberIds: null,
    orderResultMemberIds: null,
    roleAssignments: null,
    teams: null,
    runByMode: createEmptyShuffleRunByMode(),
  };
}

function parseShuffleSession(value: unknown): ShuffleSessionState | null {
  if (!isRecord(value)) {
    return null;
  }

  const shuffleMode = SHUFFLE_MODES.includes(value.shuffleMode as ShuffleMode)
    ? (value.shuffleMode as ShuffleMode)
    : 'random';
  const pickCount = typeof value.pickCount === 'number' && Number.isFinite(value.pickCount)
    ? Math.max(1, Math.floor(value.pickCount))
    : 1;
  const resultColumns = clampShuffleResultColumns(
    typeof value.resultColumns === 'number' ? value.resultColumns : SHUFFLE_RESULT_COLUMNS_DEFAULT
  );
  const teamCount = typeof value.teamCount === 'number' && Number.isFinite(value.teamCount)
    ? Math.max(2, Math.floor(value.teamCount))
    : 2;
  const roleDrafts = Array.isArray(value.roleDrafts)
    ? value.roleDrafts.map(parseRoleDraft).filter((role): role is ShuffleRoleDraft => role != null)
    : [];
  const rankTiers = Array.isArray(value.rankTiers)
    ? value.rankTiers.map(parseRankTier).filter((tier): tier is ShuffleRankTier => tier != null)
    : [];
  const roleAssignments = Array.isArray(value.roleAssignments)
    ? value.roleAssignments
        .map(parseRoleAssignment)
        .filter((item): item is ShuffleRoleAssignment => item != null)
    : null;
  const teams = Array.isArray(value.teams)
    ? value.teams.map(parseTeamAssignment).filter((item): item is ShuffleTeamAssignment => item != null)
    : null;

  return coerceShuffleSession({
    poolDraft: parsePoolDraft(value.poolDraft),
    shuffleMode,
    pickCount,
    resultColumns,
    resultMemberIds: isStringArray(value.resultMemberIds) ? value.resultMemberIds : null,
    orderResultMemberIds: isStringArray(value.orderResultMemberIds)
      ? value.orderResultMemberIds
      : null,
    orderLayout: parseShuffleOrderLayout(value.orderLayout),
    orderExcludedMemberIds: isStringArray(value.orderExcludedMemberIds)
      ? value.orderExcludedMemberIds
      : [],
    roleDrafts: roleDrafts.length > 0 ? roleDrafts : [createEmptyRoleDraft(1)],
    roleAssignments: roleAssignments && roleAssignments.length > 0 ? roleAssignments : null,
    teamCount,
    useRanks: value.useRanks === true,
    rankTiers: rankTiers.length > 0 ? rankTiers : createDefaultRankTiers(),
    memberRankById: parseStringRecord(value.memberRankById),
    teams: teams && teams.length > 0 ? teams : null,
    runByMode: parseRunByMode(value.runByMode),
  });
}

function writePersistedSession(state: ShuffleSessionState): void {
  initializeDatabase();
  setAppSetting(SHUFFLE_SESSION_SETTING_KEY, JSON.stringify(state));
}

export function loadShuffleSession(): ShuffleSessionState {
  if (memoryCache) {
    return cloneSession(memoryCache);
  }

  initializeDatabase();
  const stored = getAppSetting(SHUFFLE_SESSION_SETTING_KEY);
  if (stored) {
    try {
      const parsed = parseShuffleSession(JSON.parse(stored) as unknown);
      if (parsed) {
        memoryCache = parsed;
        return cloneSession(parsed);
      }
    } catch {
      // fall through to default
    }
  }

  const next = createDefaultShuffleSession();
  memoryCache = next;
  return cloneSession(next);
}

export function persistShuffleSession(state: ShuffleSessionState): void {
  memoryCache = cloneSession(state);
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (memoryCache) {
      writePersistedSession(memoryCache);
    }
  }, 300);
}

export function flushShuffleSession(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (memoryCache) {
    writePersistedSession(memoryCache);
  }
}
