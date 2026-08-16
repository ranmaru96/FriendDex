import type { Relationship, RelationshipMapMember } from '@/types';

/** グリッドのスナップ間隔（row/col のピッチ） */
export const RELATIONSHIP_MAP_PITCH = 80;
/** @deprecated 互換用。PITCH と同じ */
export const RELATIONSHIP_MAP_CELL_SIZE = RELATIONSHIP_MAP_PITCH;
/** グループ塗り・枠の箱サイズ（PITCH より小さく gutter を作る） */
export const RELATIONSHIP_MAP_FILL_SIZE = 72;
/** 隣接セル間の隙間（PITCH - FILL_SIZE） */
export const RELATIONSHIP_MAP_GUTTER = RELATIONSHIP_MAP_PITCH - RELATIONSHIP_MAP_FILL_SIZE;
export const RELATIONSHIP_MAP_GRID_COLS = 12;
export const RELATIONSHIP_MAP_GRID_ROWS = 16;
export const RELATIONSHIP_MAP_CANVAS_PADDING = 16;
/** アバターは FILL_SIZE 内に収まるサイズ（深い inset でも枠と重ならない） */
export const RELATIONSHIP_MAP_AVATAR_SIZE = 40;
export const RELATIONSHIP_MAP_NODE_SIZE = 52;
export const RELATIONSHIP_MAP_ARROW_INSET = RELATIONSHIP_MAP_AVATAR_SIZE / 2 + 4;
export const RELATIONSHIP_MAP_ARROW_HEAD_SIZE = 9;

export type RelationshipMapPoint = { x: number; y: number };
export type RelationshipMapDragOffset = { x: number; y: number };
export type RelationshipMapRect = { x: number; y: number; width: number; height: number };

export type GridCell = { row: number; col: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function gridCellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function getCanvasPixelSize(): { width: number; height: number } {
  return {
    width:
      RELATIONSHIP_MAP_CANVAS_PADDING * 2 + RELATIONSHIP_MAP_GRID_COLS * RELATIONSHIP_MAP_PITCH,
    height:
      RELATIONSHIP_MAP_CANVAS_PADDING * 2 + RELATIONSHIP_MAP_GRID_ROWS * RELATIONSHIP_MAP_PITCH,
  };
}

/** ピッチセルの左上（スナップ・グリッド線用） */
export function gridCellTopLeft(row: number, col: number): { left: number; top: number } {
  return {
    left: RELATIONSHIP_MAP_CANVAS_PADDING + col * RELATIONSHIP_MAP_PITCH,
    top: RELATIONSHIP_MAP_CANVAS_PADDING + row * RELATIONSHIP_MAP_PITCH,
  };
}

export function gridCellCenter(row: number, col: number): { x: number; y: number } {
  const { left, top } = gridCellTopLeft(row, col);
  return {
    x: left + RELATIONSHIP_MAP_PITCH / 2,
    y: top + RELATIONSHIP_MAP_PITCH / 2,
  };
}

/** FILL_SIZE 箱の左上（セル中央に配置） */
export function gridCellFillTopLeft(row: number, col: number): { left: number; top: number } {
  const inset = (RELATIONSHIP_MAP_PITCH - RELATIONSHIP_MAP_FILL_SIZE) / 2;
  const { left, top } = gridCellTopLeft(row, col);
  return { left: left + inset, top: top + inset };
}

export function gridCellFillRect(row: number, col: number): RelationshipMapRect {
  const { left, top } = gridCellFillTopLeft(row, col);
  return {
    x: left,
    y: top,
    width: RELATIONSHIP_MAP_FILL_SIZE,
    height: RELATIONSHIP_MAP_FILL_SIZE,
  };
}

export function gridCellNodePosition(row: number, col: number): { left: number; top: number } {
  const center = gridCellCenter(row, col);
  // アバター中心をセル中心に合わせ、FILL_SIZE 内に収める（extent: 'parent' 相当）
  return {
    left: center.x - RELATIONSHIP_MAP_NODE_SIZE / 2,
    top: center.y - RELATIONSHIP_MAP_AVATAR_SIZE / 2,
  };
}

export function pixelCenterToGridCell(x: number, y: number): GridCell {
  const relX = x - RELATIONSHIP_MAP_CANVAS_PADDING - RELATIONSHIP_MAP_PITCH / 2;
  const relY = y - RELATIONSHIP_MAP_CANVAS_PADDING - RELATIONSHIP_MAP_PITCH / 2;
  const col = Math.round(relX / RELATIONSHIP_MAP_PITCH);
  const row = Math.round(relY / RELATIONSHIP_MAP_PITCH);
  return {
    row: clamp(row, 0, RELATIONSHIP_MAP_GRID_ROWS - 1),
    col: clamp(col, 0, RELATIONSHIP_MAP_GRID_COLS - 1),
  };
}

export function isCellOccupied(
  row: number,
  col: number,
  members: ReadonlyArray<Pick<RelationshipMapMember, 'id' | 'row' | 'col'>>,
  excludeMemberId?: string
): boolean {
  return members.some(
    (member) =>
      member.id !== excludeMemberId && member.row === row && member.col === col
  );
}

export function findNextEmptyCell(
  members: ReadonlyArray<Pick<RelationshipMapMember, 'row' | 'col'>>,
  maxRows = RELATIONSHIP_MAP_GRID_ROWS,
  maxCols = RELATIONSHIP_MAP_GRID_COLS
): GridCell | null {
  const occupied = new Set(members.map((member) => gridCellKey(member.row, member.col)));
  for (let row = 0; row < maxRows; row += 1) {
    for (let col = 0; col < maxCols; col += 1) {
      if (!occupied.has(gridCellKey(row, col))) {
        return { row, col };
      }
    }
  }
  return null;
}

export function resolveSnapCell(
  target: GridCell,
  members: ReadonlyArray<Pick<RelationshipMapMember, 'id' | 'row' | 'col'>>,
  excludeMemberId: string,
  fallback: GridCell
): GridCell {
  if (!isCellOccupied(target.row, target.col, members, excludeMemberId)) {
    return target;
  }
  return fallback;
}

export function formatRelationshipMapUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function gridCellAvatarCenter(row: number, col: number): RelationshipMapPoint {
  return gridCellCenter(row, col);
}

export function getMemberAvatarCenter(
  member: Pick<RelationshipMapMember, 'row' | 'col'>,
  dragOffset?: RelationshipMapDragOffset | null
): RelationshipMapPoint {
  const center = gridCellAvatarCenter(member.row, member.col);
  if (!dragOffset) {
    return center;
  }
  return {
    x: center.x + dragOffset.x,
    y: center.y + dragOffset.y,
  };
}

function offsetAlongSegment(
  from: RelationshipMapPoint,
  to: RelationshipMapPoint,
  distance: number
): RelationshipMapPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    return { x: from.x, y: from.y };
  }
  const ratio = Math.min(Math.max(distance, 0) / length, 0.45);
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
  };
}

export type RelationshipArrowGeometry = {
  start: RelationshipMapPoint;
  end: RelationshipMapPoint;
  mid: RelationshipMapPoint;
  label: RelationshipMapPoint;
  length: number;
};

export function buildRelationshipArrowGeometry(
  from: RelationshipMapPoint,
  to: RelationshipMapPoint,
  inset = RELATIONSHIP_MAP_ARROW_INSET
): RelationshipArrowGeometry | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 8) {
    return null;
  }
  const usableInset = Math.min(inset, length / 2 - 2);
  const start = offsetAlongSegment(from, to, Math.max(usableInset, 0));
  const end = offsetAlongSegment(to, from, Math.max(usableInset, 0));
  const mid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const ux = dx / length;
  const uy = dy / length;
  return {
    start,
    end,
    mid,
    label: {
      x: mid.x - uy * 12,
      y: mid.y + ux * 12,
    },
    length,
  };
}

export function arrowHeadPoints(
  tip: RelationshipMapPoint,
  from: RelationshipMapPoint,
  size = RELATIONSHIP_MAP_ARROW_HEAD_SIZE
): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const baseX = tip.x - ux * size;
  const baseY = tip.y - uy * size;
  const px = -uy * size * 0.55;
  const py = ux * size * 0.55;
  return `${tip.x},${tip.y} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`;
}

export function getMemberLiveCell(
  member: Pick<RelationshipMapMember, 'row' | 'col'>,
  dragOffset?: RelationshipMapDragOffset | null
): GridCell {
  if (!dragOffset || (dragOffset.x === 0 && dragOffset.y === 0)) {
    return { row: member.row, col: member.col };
  }
  const center = getMemberAvatarCenter(member, dragOffset);
  return pixelCenterToGridCell(center.x, center.y);
}

export function findPersonRelationship(
  relationships: readonly Relationship[],
  memberIdA: string,
  memberIdB: string
): Relationship | null {
  return (
    relationships.find(
      (relationship) =>
        relationship.fromType === 'person' &&
        relationship.toType === 'person' &&
        ((relationship.fromId === memberIdA && relationship.toId === memberIdB) ||
          (relationship.fromId === memberIdB && relationship.toId === memberIdA))
    ) ?? null
  );
}
