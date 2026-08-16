import { useCallback, useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import {
  RELATIONSHIP_MAP_AVATAR_SIZE,
  RELATIONSHIP_MAP_NODE_SIZE,
  gridCellNodePosition,
  pixelCenterToGridCell,
  resolveSnapCell,
} from '@/utils/relationshipMapHelpers';
import { contentTextStyle } from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import type { Friend, RelationshipMapMember } from '@/types';

type RelationshipMapPersonNodeProps = {
  member: RelationshipMapMember;
  friend: Friend;
  members: RelationshipMapMember[];
  selected?: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onPositionChange: (memberId: string, row: number, col: number) => void;
  onDragMove?: (memberId: string, x: number, y: number) => void;
  onDragEnd?: (memberId: string) => void;
};

export function RelationshipMapPersonNode({
  member,
  friend,
  members,
  selected = false,
  onTap,
  onLongPress,
  onPositionChange,
  onDragMove,
  onDragEnd,
}: RelationshipMapPersonNodeProps) {
  const content = useContentColors();
  const basePosition = useMemo(
    () => gridCellNodePosition(member.row, member.col),
    [member.col, member.row]
  );

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
  }, [member.col, member.row, translateX, translateY]);

  const commitDrag = useCallback(
    (centerX: number, centerY: number) => {
      translateX.value = 0;
      translateY.value = 0;
      onDragEnd?.(member.id);
      const target = pixelCenterToGridCell(centerX, centerY);
      const resolved = resolveSnapCell(target, members, member.id, {
        row: member.row,
        col: member.col,
      });
      if (resolved.row !== member.row || resolved.col !== member.col) {
        onPositionChange(member.id, resolved.row, resolved.col);
      }
    },
    [
      member.col,
      member.id,
      member.row,
      members,
      onDragEnd,
      onPositionChange,
      translateX,
      translateY,
    ]
  );

  const reportDrag = useCallback(
    (x: number, y: number) => {
      onDragMove?.(member.id, x, y);
    },
    [member.id, onDragMove]
  );

  const cancelDrag = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    onDragEnd?.(member.id);
  }, [member.id, onDragEnd, translateX, translateY]);

  const handleTap = useCallback(() => {
    onTap();
  }, [onTap]);

  const handleLongPress = useCallback(() => {
    onLongPress();
  }, [onLongPress]);

  const composedGesture = useMemo(() => {
    const baseLeft = basePosition.left;
    const baseTop = basePosition.top;
    const nodeSize = RELATIONSHIP_MAP_NODE_SIZE;

    const panGesture = Gesture.Pan()
      .activeOffsetX([-10, 10])
      .activeOffsetY([-10, 10])
      .onBegin(() => {
        dragStartX.value = translateX.value;
        dragStartY.value = translateY.value;
      })
      .onUpdate((event) => {
        const nextX = dragStartX.value + event.translationX;
        const nextY = dragStartY.value + event.translationY;
        translateX.value = nextX;
        translateY.value = nextY;
        runOnJS(reportDrag)(nextX, nextY);
      })
      .onEnd(() => {
        const centerX = baseLeft + nodeSize / 2 + translateX.value;
        const centerY = baseTop + nodeSize / 2 + translateY.value;
        runOnJS(commitDrag)(centerX, centerY);
      })
      .onFinalize((_event, success) => {
        if (!success) {
          runOnJS(cancelDrag)();
        }
      });

    const tapGesture = Gesture.Tap().maxDuration(250).onEnd(() => {
      runOnJS(handleTap)();
    });

    const longPressGesture = Gesture.LongPress()
      .minDuration(500)
      .onStart(() => {
        runOnJS(handleLongPress)();
      });

    return Gesture.Exclusive(panGesture, longPressGesture, tapGesture);
  }, [
    basePosition.left,
    basePosition.top,
    cancelDrag,
    commitDrag,
    dragStartX,
    dragStartY,
    handleLongPress,
    handleTap,
    reportDrag,
    translateX,
    translateY,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const initial = (friend.name.trim().charAt(0) || '?').toUpperCase();
  const photoUri = friend.photoUri?.trim() || null;

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.node,
          {
            left: basePosition.left,
            top: basePosition.top,
            width: RELATIONSHIP_MAP_NODE_SIZE,
          },
          animatedStyle,
        ]}
      >
        <View style={styles.hitArea}>
          <View
            style={[
              styles.avatarRing,
              { borderColor: selected ? content.contentText : content.contentBorder },
              selected && styles.avatarRingSelected,
            ]}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: content.contentInputBg }]}>
                <Text style={[styles.initial, contentTextStyle(content)]}>{initial}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.name, contentTextStyle(content)]} numberOfLines={1}>
            {friend.name}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const AVATAR_SIZE = RELATIONSHIP_MAP_AVATAR_SIZE;

const styles = StyleSheet.create({
  node: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 2,
  },
  hitArea: {
    alignItems: 'center',
    width: RELATIONSHIP_MAP_NODE_SIZE,
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatarRingSelected: {
    borderWidth: 3,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 18,
    fontWeight: '700',
  },
  name: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    maxWidth: RELATIONSHIP_MAP_NODE_SIZE + 8,
    textAlign: 'center',
  },
});
