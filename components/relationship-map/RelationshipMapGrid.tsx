import { useMemo, type ReactElement } from 'react';
import Svg, { Line } from 'react-native-svg';
import {
  RELATIONSHIP_MAP_CANVAS_PADDING,
  RELATIONSHIP_MAP_PITCH,
  RELATIONSHIP_MAP_GRID_COLS,
  RELATIONSHIP_MAP_GRID_ROWS,
} from '@/utils/relationshipMapHelpers';

type RelationshipMapGridProps = {
  width: number;
  height: number;
  strokeColor: string;
};

export function RelationshipMapGrid({ width, height, strokeColor }: RelationshipMapGridProps) {
  const lines = useMemo(() => {
    const items: ReactElement[] = [];
    for (let col = 0; col <= RELATIONSHIP_MAP_GRID_COLS; col += 1) {
      const x = RELATIONSHIP_MAP_CANVAS_PADDING + col * RELATIONSHIP_MAP_PITCH;
      items.push(
        <Line
          key={`v-${col}`}
          x1={x}
          y1={RELATIONSHIP_MAP_CANVAS_PADDING}
          x2={x}
          y2={height - RELATIONSHIP_MAP_CANVAS_PADDING}
          stroke={strokeColor}
          strokeWidth={1}
        />
      );
    }
    for (let row = 0; row <= RELATIONSHIP_MAP_GRID_ROWS; row += 1) {
      const y = RELATIONSHIP_MAP_CANVAS_PADDING + row * RELATIONSHIP_MAP_PITCH;
      items.push(
        <Line
          key={`h-${row}`}
          x1={RELATIONSHIP_MAP_CANVAS_PADDING}
          y1={y}
          x2={width - RELATIONSHIP_MAP_CANVAS_PADDING}
          y2={y}
          stroke={strokeColor}
          strokeWidth={1}
        />
      );
    }
    return items;
  }, [height, strokeColor, width]);

  return (
    <Svg width={width} height={height} pointerEvents="none">
      {lines}
    </Svg>
  );
}
