import type { RelationshipGroup, RelationshipGroupMember, RelationshipMapMember } from '@/types';
import { withAlpha } from '@/utils/colorHelpers';
import {
  RELATIONSHIP_MAP_FILL_SIZE,
  RELATIONSHIP_MAP_GUTTER,
  gridCellCenter,
  gridCellFillTopLeft,
  gridCellKey,
  getMemberLiveCell,
  type GridCell,
  type RelationshipMapDragOffset,
  type RelationshipMapPoint,
  type RelationshipMapRect,
} from '@/utils/relationshipMapHelpers';

const EIGHT_WAY: GridCell[] = [
  { row: -1, col: -1 },
  { row: -1, col: 0 },
  { row: -1, col: 1 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
];

const FILL_ALPHA_BY_DEPTH = [0.14, 0.22, 0.3, 0.36];
const STROKE_ALPHA = 0.92;

/** inset = 2 + depth * 6 */
export function groupOutlineInsetForDepth(depth: number): number {
  return 2 + Math.max(0, depth) * 6;
}

export type GroupComponentLayout = {
  cells: GridCell[];
  /** getNodesBounds 相当（ピッチセルの min/max） */
  bounds: { minRow: number; maxRow: number; minCol: number; maxCol: number };
  fillRects: RelationshipMapRect[];
  outlinePath: string;
  label: RelationshipMapPoint | null;
};

export type GroupFillLayout = {
  groupId: string;
  name: string;
  color: string;
  fill: string;
  stroke: string;
  depth: number;
  inset: number;
  cells: GridCell[];
  components: GroupComponentLayout[];
};

function uniqueCells(cells: readonly GridCell[]): GridCell[] {
  const seen = new Set<string>();
  const result: GridCell[] = [];
  cells.forEach((cell) => {
    const key = gridCellKey(cell.row, cell.col);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push({ row: cell.row, col: cell.col });
  });
  return result;
}

function cellBounds(cells: readonly GridCell[]): GroupComponentLayout['bounds'] {
  let minRow = cells[0].row;
  let maxRow = cells[0].row;
  let minCol = cells[0].col;
  let maxCol = cells[0].col;
  cells.forEach((cell) => {
    minRow = Math.min(minRow, cell.row);
    maxRow = Math.max(maxRow, cell.row);
    minCol = Math.min(minCol, cell.col);
    maxCol = Math.max(maxCol, cell.col);
  });
  return { minRow, maxRow, minCol, maxCol };
}

/** 8方向で連続するブロックに分割（隙間埋めなし） */
export function connectedComponents8(cells: readonly GridCell[]): GridCell[][] {
  const remaining = uniqueCells(cells);
  const keys = new Set(remaining.map((cell) => gridCellKey(cell.row, cell.col)));
  const visited = new Set<string>();
  const components: GridCell[][] = [];

  remaining.forEach((start) => {
    const startKey = gridCellKey(start.row, start.col);
    if (visited.has(startKey)) {
      return;
    }
    const component: GridCell[] = [];
    const stack = [start];
    visited.add(startKey);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      EIGHT_WAY.forEach((delta) => {
        const next = { row: current.row + delta.row, col: current.col + delta.col };
        const nextKey = gridCellKey(next.row, next.col);
        if (!keys.has(nextKey) || visited.has(nextKey)) {
          return;
        }
        visited.add(nextKey);
        stack.push(next);
      });
    }
    components.push(component);
  });

  return components.sort((left, right) => right.length - left.length);
}

export function largestConnectedComponent(cells: readonly GridCell[]): GridCell[] {
  return connectedComponents8(cells)[0] ?? [];
}

export function componentLabelPoint(cells: readonly GridCell[]): RelationshipMapPoint | null {
  if (cells.length === 0) {
    return null;
  }
  const avgRow = cells.reduce((sum, cell) => sum + cell.row, 0) / cells.length;
  const avgCol = cells.reduce((sum, cell) => sum + cell.col, 0) / cells.length;
  let best = cells[0];
  let bestDist = Number.POSITIVE_INFINITY;
  cells.forEach((cell) => {
    const dist = (cell.row - avgRow) ** 2 + (cell.col - avgCol) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = cell;
    }
  });
  return gridCellCenter(best.row, best.col);
}

/**
 * 同じブロック内で4方向隣接していれば gutter 中央まで塗りを延長した矩形。
 * 異なるグループ／ブロックとは延長しない。
 */
export function buildCellFillRect(
  cell: GridCell,
  blockKeys: Set<string>
): RelationshipMapRect {
  const halfGutter = RELATIONSHIP_MAP_GUTTER / 2;
  const { left, top } = gridCellFillTopLeft(cell.row, cell.col);
  const has = (row: number, col: number) => blockKeys.has(gridCellKey(row, col));
  const expandLeft = has(cell.row, cell.col - 1) ? halfGutter : 0;
  const expandRight = has(cell.row, cell.col + 1) ? halfGutter : 0;
  const expandTop = has(cell.row - 1, cell.col) ? halfGutter : 0;
  const expandBottom = has(cell.row + 1, cell.col) ? halfGutter : 0;
  return {
    x: left - expandLeft,
    y: top - expandTop,
    width: RELATIONSHIP_MAP_FILL_SIZE + expandLeft + expandRight,
    height: RELATIONSHIP_MAP_FILL_SIZE + expandTop + expandBottom,
  };
}

type PointKey = string;
type DirectedEdge = { x1: number; y1: number; x2: number; y2: number };

function pointKey(x: number, y: number): PointKey {
  return `${x},${y}`;
}

/**
 * 拡張塗り矩形の外周辺を収集（内部を右側に見て辿る）。
 * 4方向に隣接するセル間には辺を出さない → 内部境界線なし。
 */
function collectExpandedPerimeterEdges(
  cells: readonly GridCell[],
  blockKeys: Set<string>
): DirectedEdge[] {
  const has = (row: number, col: number) => blockKeys.has(gridCellKey(row, col));
  const edges: DirectedEdge[] = [];
  const halfGutter = RELATIONSHIP_MAP_GUTTER / 2;

  cells.forEach((cell) => {
    const { left, top } = gridCellFillTopLeft(cell.row, cell.col);
    const expandLeft = has(cell.row, cell.col - 1) ? halfGutter : 0;
    const expandRight = has(cell.row, cell.col + 1) ? halfGutter : 0;
    const expandTop = has(cell.row - 1, cell.col) ? halfGutter : 0;
    const expandBottom = has(cell.row + 1, cell.col) ? halfGutter : 0;
    const L = left - expandLeft;
    const R = left + RELATIONSHIP_MAP_FILL_SIZE + expandRight;
    const T = top - expandTop;
    const B = top + RELATIONSHIP_MAP_FILL_SIZE + expandBottom;

    // 内部を右: 北=左→右, 東=上→下, 南=右→左, 西=下→上
    if (!has(cell.row - 1, cell.col)) {
      edges.push({ x1: L, y1: T, x2: R, y2: T });
    }
    if (!has(cell.row, cell.col + 1)) {
      edges.push({ x1: R, y1: T, x2: R, y2: B });
    }
    if (!has(cell.row + 1, cell.col)) {
      edges.push({ x1: R, y1: B, x2: L, y2: B });
    }
    if (!has(cell.row, cell.col - 1)) {
      edges.push({ x1: L, y1: B, x2: L, y2: T });
    }
  });

  return edges;
}

function chainPerimeterCycles(edges: DirectedEdge[]): RelationshipMapPoint[][] {
  const byStart = new Map<PointKey, DirectedEdge[]>();
  edges.forEach((edge) => {
    const key = pointKey(edge.x1, edge.y1);
    const list = byStart.get(key) ?? [];
    list.push(edge);
    byStart.set(key, list);
  });

  const used = new Set<DirectedEdge>();
  const cycles: RelationshipMapPoint[][] = [];

  const pickNext = (from: DirectedEdge): DirectedEdge | null => {
    const endKey = pointKey(from.x2, from.y2);
    const candidates = (byStart.get(endKey) ?? []).filter((edge) => !used.has(edge));
    if (candidates.length === 0) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0];
    }
    const inDx = Math.sign(from.x2 - from.x1);
    const inDy = Math.sign(from.y2 - from.y1);
    const score = (edge: DirectedEdge) => {
      const outDx = Math.sign(edge.x2 - edge.x1);
      const outDy = Math.sign(edge.y2 - edge.y1);
      if (outDx === inDx && outDy === inDy) {
        return 0;
      }
      if (outDx === -inDy && outDy === inDx) {
        return 1;
      }
      return 2;
    };
    return [...candidates].sort((left, right) => score(left) - score(right))[0];
  };

  edges.forEach((startEdge) => {
    if (used.has(startEdge)) {
      return;
    }
    const cycle: RelationshipMapPoint[] = [{ x: startEdge.x1, y: startEdge.y1 }];
    let current = startEdge;
    used.add(current);
    for (let guard = 0; guard < edges.length + 2; guard += 1) {
      cycle.push({ x: current.x2, y: current.y2 });
      if (
        pointKey(current.x2, current.y2) === pointKey(startEdge.x1, startEdge.y1) &&
        cycle.length > 2
      ) {
        cycles.push(cycle.slice(0, -1));
        break;
      }
      const next = pickNext(current);
      if (!next) {
        break;
      }
      current = next;
      used.add(current);
    }
  });

  return cycles;
}

function insetRectilinearVertex(
  prev: RelationshipMapPoint,
  curr: RelationshipMapPoint,
  next: RelationshipMapPoint,
  inset: number
): RelationshipMapPoint {
  const inDx = Math.sign(curr.x - prev.x);
  const inDy = Math.sign(curr.y - prev.y);
  const outDx = Math.sign(next.x - curr.x);
  const outDy = Math.sign(next.y - curr.y);
  const nInX = -inDy;
  const nInY = inDx;
  const nOutX = -outDy;
  const nOutY = outDx;
  if (nInX === nOutX && nInY === nOutY) {
    return { x: curr.x + inset * nInX, y: curr.y + inset * nInY };
  }
  return {
    x: curr.x + inset * nInX + inset * nOutX,
    y: curr.y + inset * nInY + inset * nOutY,
  };
}

function insetPolygon(points: RelationshipMapPoint[], inset: number): RelationshipMapPoint[] {
  if (points.length < 3 || inset <= 0) {
    return points;
  }
  const n = points.length;
  return points.map((curr, index) => {
    const prev = points[(index - 1 + n) % n];
    const next = points[(index + 1) % n];
    return insetRectilinearVertex(prev, curr, next, inset);
  });
}

function pointsToSvgPath(points: RelationshipMapPoint[]): string {
  if (points.length < 2) {
    return '';
  }
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')} Z`;
}

export function buildComponentOutlinePath(
  cells: readonly GridCell[],
  inset: number
): string {
  const unique = uniqueCells(cells);
  if (unique.length === 0) {
    return '';
  }
  const blockKeys = new Set(unique.map((cell) => gridCellKey(cell.row, cell.col)));
  const cycles = chainPerimeterCycles(collectExpandedPerimeterEdges(unique, blockKeys));
  return cycles
    .map((cycle) => pointsToSvgPath(insetPolygon(cycle, inset)))
    .filter(Boolean)
    .join(' ');
}

export function wouldCreateGroupCycle(
  groups: readonly RelationshipGroup[],
  groupId: string,
  newParentId: string | null
): boolean {
  if (!newParentId) {
    return false;
  }
  if (newParentId === groupId) {
    return true;
  }
  const byId = new Map(groups.map((group) => [group.id, group]));
  const seen = new Set<string>();
  let walk: string | null = newParentId;
  while (walk) {
    if (walk === groupId) {
      return true;
    }
    if (seen.has(walk)) {
      return true;
    }
    seen.add(walk);
    walk = byId.get(walk)?.parentGroupId ?? null;
  }
  return false;
}

export function getGroupDepthMap(groups: readonly RelationshipGroup[]): Map<string, number> {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const memo = new Map<string, number>();

  const depthOf = (groupId: string, stack: Set<string>): number => {
    const cached = memo.get(groupId);
    if (cached != null) {
      return cached;
    }
    if (stack.has(groupId)) {
      memo.set(groupId, 0);
      return 0;
    }
    const group = byId.get(groupId);
    if (!group?.parentGroupId || !byId.has(group.parentGroupId)) {
      memo.set(groupId, 0);
      return 0;
    }
    stack.add(groupId);
    const depth = depthOf(group.parentGroupId, stack) + 1;
    stack.delete(groupId);
    memo.set(groupId, depth);
    return depth;
  };

  groups.forEach((group) => {
    depthOf(group.id, new Set());
  });
  return memo;
}

function buildComponentLayout(cells: GridCell[], inset: number): GroupComponentLayout {
  const blockKeys = new Set(cells.map((cell) => gridCellKey(cell.row, cell.col)));
  return {
    cells,
    bounds: cellBounds(cells),
    fillRects: cells.map((cell) => buildCellFillRect(cell, blockKeys)),
    outlinePath: buildComponentOutlinePath(cells, inset),
    label: componentLabelPoint(cells),
  };
}

export function buildGroupFillLayouts(options: {
  groups: readonly RelationshipGroup[];
  groupMembers: readonly RelationshipGroupMember[];
  members: readonly RelationshipMapMember[];
  dragOffsets?: Record<string, RelationshipMapDragOffset>;
}): GroupFillLayout[] {
  const { groups, groupMembers, members, dragOffsets = {} } = options;
  const memberById = new Map(members.map((member) => [member.id, member]));
  const childrenByParent = new Map<string, RelationshipGroup[]>();
  groups.forEach((group) => {
    if (!group.parentGroupId) {
      return;
    }
    const list = childrenByParent.get(group.parentGroupId) ?? [];
    list.push(group);
    childrenByParent.set(group.parentGroupId, list);
  });
  const membersByGroup = new Map<string, string[]>();
  groupMembers.forEach((link) => {
    const list = membersByGroup.get(link.groupId) ?? [];
    list.push(link.mapMemberId);
    membersByGroup.set(link.groupId, list);
  });
  const depthMap = getGroupDepthMap(groups);
  const cellMemo = new Map<string, GridCell[]>();

  const cellsForGroup = (groupId: string, stack: Set<string>): GridCell[] => {
    const cached = cellMemo.get(groupId);
    if (cached) {
      return cached;
    }
    if (stack.has(groupId)) {
      return [];
    }
    stack.add(groupId);
    const directCells: GridCell[] = [];
    (membersByGroup.get(groupId) ?? []).forEach((memberId) => {
      const member = memberById.get(memberId);
      if (!member) {
        return;
      }
      directCells.push(getMemberLiveCell(member, dragOffsets[memberId]));
    });
    (childrenByParent.get(groupId) ?? []).forEach((child) => {
      directCells.push(...cellsForGroup(child.id, stack));
    });
    stack.delete(groupId);
    const cells = uniqueCells(directCells);
    cellMemo.set(groupId, cells);
    return cells;
  };

  return groups
    .map((group) => {
      const cells = cellsForGroup(group.id, new Set());
      const depth = depthMap.get(group.id) ?? 0;
      const inset = groupOutlineInsetForDepth(depth);
      const alpha = FILL_ALPHA_BY_DEPTH[Math.min(depth, FILL_ALPHA_BY_DEPTH.length - 1)];
      const components = connectedComponents8(cells).map((componentCells) =>
        buildComponentLayout(componentCells, inset)
      );
      return {
        groupId: group.id,
        name: group.name,
        color: group.color,
        fill: withAlpha(group.color, alpha),
        stroke: withAlpha(group.color, STROKE_ALPHA),
        depth,
        inset,
        cells,
        components,
      };
    })
    .filter((layout) => layout.cells.length > 0)
    .sort((left, right) => left.depth - right.depth);
}
