import { getAppSetting, initializeDatabase, setAppSetting } from '@/db';
import {
  createDefaultRankTiers,
  createEmptyRoleDraft,
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

export type ShuffleSessionState = {
  poolDraft: ShufflePoolDraft | null;
  shuffleMode: ShuffleMode;
  pickCount: number;
  resultMemberIds: string[] | null;
  orderResultMemberIds: string[] | null;
  roleDrafts: ShuffleRoleDraft[];
  roleAssignments: ShuffleRoleAssignment[] | null;
  teamCount: number;
  useRanks: boolean;
  rankTiers: ShuffleRankTier[];
  memberRankById: Record<string, string>;
  teams: ShuffleTeamAssignment[] | null;
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

export function createDefaultShuffleSession(): ShuffleSessionState {
  return {
    poolDraft: null,
    shuffleMode: 'random',
    pickCount: 1,
    resultMemberIds: null,
    orderResultMemberIds: null,
    roleDrafts: [createEmptyRoleDraft(1)],
    roleAssignments: null,
    teamCount: 2,
    useRanks: false,
    rankTiers: createDefaultRankTiers(),
    memberRankById: {},
    teams: null,
  };
}

export function coerceShuffleSession(raw: ShuffleSessionState): ShuffleSessionState {
  if (!raw.poolDraft || raw.poolDraft.memberIds.length === 0) {
    return {
      ...raw,
      poolDraft: null,
      pickCount: 1,
      resultMemberIds: null,
      orderResultMemberIds: null,
      roleAssignments: null,
      teams: null,
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
    roleDrafts,
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
    resultMemberIds: isStringArray(value.resultMemberIds) ? value.resultMemberIds : null,
    orderResultMemberIds: isStringArray(value.orderResultMemberIds)
      ? value.orderResultMemberIds
      : null,
    roleDrafts: roleDrafts.length > 0 ? roleDrafts : [createEmptyRoleDraft(1)],
    roleAssignments: roleAssignments && roleAssignments.length > 0 ? roleAssignments : null,
    teamCount,
    useRanks: value.useRanks === true,
    rankTiers: rankTiers.length > 0 ? rankTiers : createDefaultRankTiers(),
    memberRankById: parseStringRecord(value.memberRankById),
    teams: teams && teams.length > 0 ? teams : null,
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
