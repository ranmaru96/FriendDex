import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import type { Relationship } from '@/types';
import {
  arrowHeadPoints,
  buildRelationshipArrowGeometry,
  type RelationshipMapPoint,
} from '@/utils/relationshipMapHelpers';

export type RelationshipMapArrowItem = {
  relationship: Relationship;
  from: RelationshipMapPoint;
  to: RelationshipMapPoint;
};

type RelationshipMapArrowsProps = {
  width: number;
  height: number;
  items: RelationshipMapArrowItem[];
  strokeColor: string;
  labelColor: string;
  onPress: (relationship: Relationship) => void;
};

export function RelationshipMapArrows({
  width,
  height,
  items,
  strokeColor,
  labelColor,
  onPress,
}: RelationshipMapArrowsProps) {
  const drawn = items
    .map((item) => {
      const geometry = buildRelationshipArrowGeometry(item.from, item.to);
      if (!geometry) {
        return null;
      }
      return { ...item, geometry };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);

  return (
    <View pointerEvents="box-none" style={[styles.layer, { width, height }]}>
      <Svg width={width} height={height} pointerEvents="none">
        {drawn.map(({ relationship, geometry }) => {
          const showStartHead = relationship.style === 'both';
          const showEndHead = relationship.style === 'oneway' || relationship.style === 'both';
          const label = relationship.label?.trim() ?? '';
          return (
            <G key={relationship.id}>
              <Line
                x1={geometry.start.x}
                y1={geometry.start.y}
                x2={geometry.end.x}
                y2={geometry.end.y}
                stroke={strokeColor}
                strokeWidth={2}
              />
              {showStartHead ? (
                <Polygon
                  points={arrowHeadPoints(geometry.start, geometry.end)}
                  fill={strokeColor}
                />
              ) : null}
              {showEndHead ? (
                <Polygon
                  points={arrowHeadPoints(geometry.end, geometry.start)}
                  fill={strokeColor}
                />
              ) : null}
              {label ? (
                <SvgText
                  x={geometry.label.x}
                  y={geometry.label.y}
                  fill={labelColor}
                  fontSize={11}
                  fontWeight="600"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
      {drawn.map(({ relationship, geometry }) => (
        <Pressable
          key={`${relationship.id}-hit`}
          accessibilityRole="button"
          accessibilityLabel={relationship.label?.trim() || '関係を編集'}
          onPress={() => onPress(relationship)}
          hitSlop={8}
          style={[
            styles.hit,
            {
              left: geometry.mid.x - 22,
              top: geometry.mid.y - 16,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
  },
  hit: {
    position: 'absolute',
    width: 44,
    height: 32,
  },
});
