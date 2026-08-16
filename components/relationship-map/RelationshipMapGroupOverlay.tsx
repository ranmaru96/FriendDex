import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { RELATIONSHIP_MAP_FILL_SIZE, gridCellFillTopLeft } from '@/utils/relationshipMapHelpers';
import type { GroupFillLayout } from '@/utils/relationshipGroupLayout';

type RelationshipMapGroupOverlayProps = {
  width: number;
  height: number;
  layouts: GroupFillLayout[];
  interactive?: boolean;
  onPressGroup: (groupId: string) => void;
};

export function RelationshipMapGroupOverlay({
  width,
  height,
  layouts,
  interactive = true,
  onPressGroup,
}: RelationshipMapGroupOverlayProps) {
  return (
    <View
      pointerEvents={interactive ? 'box-none' : 'none'}
      style={[styles.layer, { width, height }]}
    >
      <Svg width={width} height={height} pointerEvents="none">
        {layouts.map((layout) =>
          layout.components.flatMap((component, componentIndex) =>
            component.fillRects.map((rect, rectIndex) => (
              <Rect
                key={`${layout.groupId}-fill-${componentIndex}-${rectIndex}`}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill={layout.fill}
              />
            ))
          )
        )}
        {layouts.map((layout) =>
          layout.components.map((component, index) =>
            component.outlinePath ? (
              <Path
                key={`${layout.groupId}-outline-${index}`}
                d={component.outlinePath}
                fill="none"
                stroke={layout.stroke}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null
          )
        )}
      </Svg>

      {interactive
        ? layouts.map((layout) => (
            <View
              key={`${layout.groupId}-hits`}
              pointerEvents="box-none"
              style={StyleSheet.absoluteFill}
            >
              {layout.cells.map((cell) => {
                const { left, top } = gridCellFillTopLeft(cell.row, cell.col);
                return (
                  <Pressable
                    key={`${layout.groupId}-hit-${cell.row}-${cell.col}`}
                    onPress={() => onPressGroup(layout.groupId)}
                    style={[
                      styles.cellHit,
                      {
                        left,
                        top,
                        width: RELATIONSHIP_MAP_FILL_SIZE,
                        height: RELATIONSHIP_MAP_FILL_SIZE,
                      },
                    ]}
                  />
                );
              })}
              {layout.components.map((component, index) =>
                component.label ? (
                  <Pressable
                    key={`${layout.groupId}-label-${index}`}
                    onPress={() => onPressGroup(layout.groupId)}
                    style={[
                      styles.labelWrap,
                      {
                        left: component.label.x - 48,
                        top: component.label.y - RELATIONSHIP_MAP_FILL_SIZE / 2 + 4,
                      },
                    ]}
                  >
                    <Text style={[styles.label, { color: layout.stroke }]} numberOfLines={1}>
                      {layout.name}
                    </Text>
                  </Pressable>
                ) : null
              )}
            </View>
          ))
        : layouts.map((layout) =>
            layout.components.map((component, index) =>
              component.label ? (
                <View
                  key={`${layout.groupId}-label-${index}`}
                  pointerEvents="none"
                  style={[
                    styles.labelWrap,
                    {
                      left: component.label.x - 48,
                      top: component.label.y - RELATIONSHIP_MAP_FILL_SIZE / 2 + 4,
                    },
                  ]}
                >
                  <Text style={[styles.label, { color: layout.stroke }]} numberOfLines={1}>
                    {layout.name}
                  </Text>
                </View>
              ) : null
            )
          )}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 0,
  },
  cellHit: {
    position: 'absolute',
  },
  labelWrap: {
    position: 'absolute',
    width: 96,
    alignItems: 'center',
    paddingVertical: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});
