export function normalizeShuffleMemberIds(memberIds: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  memberIds.forEach((memberId) => {
    const id = memberId.trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  });
  return normalized.sort((a, b) => a.localeCompare(b));
}

export function buildShuffleMemberSetKey(memberIds: string[]): string {
  return normalizeShuffleMemberIds(memberIds).join('\u0000');
}

export function buildDefaultShufflePoolLabel(
  memberIds: string[],
  friendNameById: Map<string, string>
): string {
  const names = normalizeShuffleMemberIds(memberIds).map(
    (memberId) => friendNameById.get(memberId) ?? memberId
  );
  if (names.length === 0) {
    return '集団';
  }
  if (names.length <= 2) {
    return names.join('、');
  }
  return `${names[0]}、${names[1]}、他${names.length - 2}人`;
}

export function memberIdsToParticipantEntries(memberIds: string[]) {
  return normalizeShuffleMemberIds(memberIds).map((memberId) => ({
    kind: 'individual' as const,
    value: memberId,
  }));
}

export function shuffleInPlace<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }
  return items;
}

export function pickRandomMembers(memberIds: string[], count: number): string[] {
  const normalized = normalizeShuffleMemberIds(memberIds);
  if (count <= 0 || count > normalized.length) {
    return [];
  }
  return shuffleInPlace([...normalized]).slice(0, count);
}

/** 全員をランダムな順序で返す */
export function shuffleAllMemberIds(memberIds: string[]): string[] {
  const normalized = normalizeShuffleMemberIds(memberIds);
  if (normalized.length === 0) {
    return [];
  }
  return shuffleInPlace([...normalized]);
}

export type ShuffleRoleDraft = {
  id: string;
  name: string;
  count: number;
  excludedMemberIds: string[];
};

export type ShuffleRoleAssignment = {
  roleName: string;
  memberIds: string[];
};

export type AssignRolesResult =
  | { ok: true; assignments: ShuffleRoleAssignment[] }
  | { ok: false; error: string };

export function createRoleDraftId(): string {
  return `role-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyRoleDraft(): ShuffleRoleDraft {
  return {
    id: createRoleDraftId(),
    name: '',
    count: 1,
    excludedMemberIds: [],
  };
}

export function sanitizeRoleDraftsForPool(
  roles: ShuffleRoleDraft[],
  memberIds: string[]
): ShuffleRoleDraft[] {
  const poolSet = new Set(normalizeShuffleMemberIds(memberIds));
  const maxCount = Math.max(poolSet.size, 1);
  return roles.map((role) => ({
    ...role,
    count: Math.min(Math.max(1, role.count), maxCount),
    excludedMemberIds: normalizeShuffleMemberIds(role.excludedMemberIds).filter((memberId) =>
      poolSet.has(memberId)
    ),
  }));
}

export function assignRolesToMembers(
  memberIds: string[],
  roles: Array<{ name: string; count: number; excludedMemberIds: string[] }>
): AssignRolesResult {
  const pool = normalizeShuffleMemberIds(memberIds);
  if (pool.length === 0) {
    return { ok: false, error: '集団にメンバーがいません。' };
  }
  if (roles.length === 0) {
    return { ok: false, error: '役を1つ以上追加してください。' };
  }

  const assigned = new Set<string>();
  const assignments: ShuffleRoleAssignment[] = [];

  for (const role of roles) {
    const roleName = role.name.trim();
    if (!roleName) {
      return { ok: false, error: '役名を入力してください。' };
    }
    if (!Number.isFinite(role.count) || role.count < 1) {
      return { ok: false, error: `「${roleName}」の人数は1以上にしてください。` };
    }

    const excluded = new Set(
      normalizeShuffleMemberIds(role.excludedMemberIds).filter((memberId) => pool.includes(memberId))
    );
    const candidates = pool.filter(
      (memberId) => !excluded.has(memberId) && !assigned.has(memberId)
    );

    if (candidates.length < role.count) {
      return {
        ok: false,
        error: `「${roleName}」の候補が足りません（必要${role.count}人、残り${candidates.length}人）。`,
      };
    }

    const picked = pickRandomMembers(candidates, role.count);
    if (picked.length < role.count) {
      return { ok: false, error: `「${roleName}」の振り分けに失敗しました。` };
    }

    picked.forEach((memberId) => assigned.add(memberId));
    assignments.push({ roleName, memberIds: picked });
  }

  return { ok: true, assignments };
}

export type ShuffleRankTier = {
  id: string;
  label: string;
};

export type ShuffleTeamAssignment = {
  teamName: string;
  memberIds: string[];
};

export type SplitTeamsResult =
  | { ok: true; teams: ShuffleTeamAssignment[] }
  | { ok: false; error: string };

export function createRankTierId(): string {
  return `rank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultRankTiers(): ShuffleRankTier[] {
  return ['A', 'B', 'C', 'D'].map((label) => ({
    id: createRankTierId(),
    label,
  }));
}

export function suggestNextRankLabel(tiers: ShuffleRankTier[]): string {
  const index = tiers.length;
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }
  return `R${index + 1}`;
}

export function sanitizeTeamSettingsForPool(
  teamCount: number,
  memberRankById: Record<string, string>,
  rankTiers: ShuffleRankTier[],
  memberIds: string[]
): {
  teamCount: number;
  memberRankById: Record<string, string>;
  rankTiers: ShuffleRankTier[];
} {
  const pool = normalizeShuffleMemberIds(memberIds);
  const poolSet = new Set(pool);
  const maxTeams = Math.max(pool.length, 2);
  const tierIds = new Set(rankTiers.map((tier) => tier.id));
  const nextMemberRankById: Record<string, string> = {};

  pool.forEach((memberId) => {
    const tierId = memberRankById[memberId];
    if (tierId && tierIds.has(tierId)) {
      nextMemberRankById[memberId] = tierId;
    }
  });

  return {
    teamCount: Math.min(Math.max(2, teamCount), maxTeams),
    memberRankById: nextMemberRankById,
    rankTiers: rankTiers.length > 0 ? rankTiers : createDefaultRankTiers(),
  };
}

function hasRankAssignments(memberRankById: Record<string, string>, memberIds: string[]): boolean {
  return normalizeShuffleMemberIds(memberIds).some((memberId) => Boolean(memberRankById[memberId]));
}

function pickSmallestTeamIndex(teams: string[][]): number {
  let smallestIndex = 0;
  let smallestSize = teams[0]?.length ?? 0;
  teams.forEach((team, index) => {
    if (team.length < smallestSize) {
      smallestSize = team.length;
      smallestIndex = index;
    }
  });
  return smallestIndex;
}

export function splitMembersIntoTeams(
  memberIds: string[],
  teamCount: number,
  options?: {
    useRanks?: boolean;
    memberRankById?: Record<string, string>;
    rankTiers?: ShuffleRankTier[];
  }
): SplitTeamsResult {
  const pool = normalizeShuffleMemberIds(memberIds);
  if (pool.length === 0) {
    return { ok: false, error: '集団にメンバーがいません。' };
  }
  if (!Number.isFinite(teamCount) || teamCount < 2) {
    return { ok: false, error: 'チーム数は2以上にしてください。' };
  }
  if (teamCount > pool.length) {
    return { ok: false, error: `チーム数は${pool.length}以下にしてください。` };
  }

  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  const useRanks = Boolean(options?.useRanks);
  const memberRankById = options?.memberRankById ?? {};
  const rankTiers = options?.rankTiers ?? [];

  if (!useRanks || !hasRankAssignments(memberRankById, pool)) {
    const shuffled = shuffleInPlace([...pool]);
    shuffled.forEach((memberId, index) => {
      teams[index % teamCount].push(memberId);
    });
  } else {
    const tierIds = rankTiers.map((tier) => tier.id);
    const validTierIds = new Set(tierIds);
    const byTier = new Map<string, string[]>();
    tierIds.forEach((tierId) => byTier.set(tierId, []));
    const unranked: string[] = [];

    pool.forEach((memberId) => {
      const tierId = memberRankById[memberId];
      if (tierId && validTierIds.has(tierId)) {
        byTier.get(tierId)!.push(memberId);
      } else {
        unranked.push(memberId);
      }
    });

    tierIds.forEach((tierId) => {
      const members = shuffleInPlace([...(byTier.get(tierId) ?? [])]);
      if (members.length === 0) {
        return;
      }
      const start = Math.floor(Math.random() * teamCount);
      members.forEach((memberId, index) => {
        teams[(start + index) % teamCount].push(memberId);
      });
    });

    shuffleInPlace(unranked).forEach((memberId) => {
      teams[pickSmallestTeamIndex(teams)].push(memberId);
    });
  }

  return {
    ok: true,
    teams: teams.map((teamMemberIds, index) => ({
      teamName: `チーム${index + 1}`,
      memberIds: teamMemberIds,
    })),
  };
}
