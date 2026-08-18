import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DesignPatternColors, DesignPatternShape } from '@/constants/designPatterns';
import type { WishlistItem } from '@/types';

type WishlistPlaceCardProps = {
  item: WishlistItem;
  indexLabel: string;
  colors: DesignPatternColors;
  shape: DesignPatternShape;
  onPress: () => void;
  onLongPress: () => void;
  onPressLink?: () => void;
};

function CornerBrackets({
  color,
  size,
  borderWidth,
}: {
  color: string;
  size: number;
  borderWidth: number;
}) {
  const arm = { width: size, height: size, borderColor: color };
  return (
    <>
      <View style={[styles.bracket, arm, styles.bracketTL, { borderTopWidth: borderWidth, borderLeftWidth: borderWidth }]} />
      <View style={[styles.bracket, arm, styles.bracketTR, { borderTopWidth: borderWidth, borderRightWidth: borderWidth }]} />
      <View style={[styles.bracket, arm, styles.bracketBL, { borderBottomWidth: borderWidth, borderLeftWidth: borderWidth }]} />
      <View style={[styles.bracket, arm, styles.bracketBR, { borderBottomWidth: borderWidth, borderRightWidth: borderWidth }]} />
    </>
  );
}

export function WishlistPlaceCard({
  item,
  indexLabel,
  colors,
  shape,
  onPress,
  onLongPress,
  onPressLink,
}: WishlistPlaceCardProps) {
  const tags = item.kind === 'visit' ? item.purposeTags : item.cuisine ? [item.cuisine] : [];
  const offset = shape.offsetDistance;

  return (
    <View style={styles.wrap}>
      {offset > 0 ? (
        <View
          style={[
            styles.offset,
            {
              backgroundColor: colors.offset,
              borderRadius: shape.cardBorderRadius,
              top: offset,
              left: offset,
              right: -offset,
              bottom: -offset,
            },
          ]}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.cyan,
            borderRadius: shape.cardBorderRadius,
            borderWidth: shape.cardBorderWidth,
            padding: shape.cardPadding,
          },
        ]}
        accessibilityLabel={`${item.name}を編集`}
      >
        {shape.cornerBrackets ? (
          <CornerBrackets color={colors.cyan} size={shape.bracketSize} borderWidth={shape.cardBorderWidth} />
        ) : null}
        <View style={styles.metaRow}>
          <Text
            style={[
              styles.indexLabel,
              { color: colors.cyan, letterSpacing: shape.kickerLetterSpacing },
            ]}
          >
            {indexLabel}
          </Text>
          {tags.length > 0 ? (
            <View style={styles.tagRow}>
              {tags.slice(0, 3).map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tag,
                    {
                      backgroundColor: colors.accentSoft,
                      borderColor: colors.accent,
                      borderRadius: Math.max(2, shape.innerRadius / 2),
                    },
                  ]}
                >
                  <Text style={[styles.tagText, { color: colors.accent }]} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Text style={[styles.title, { color: colors.cardInk }]}>{item.name}</Text>
        {item.memo ? (
          <View
            style={[
              styles.memoWell,
              {
                backgroundColor: colors.logBg,
                borderColor: colors.cyan,
                borderRadius: shape.innerRadius,
              },
            ]}
          >
            <Text style={[styles.memoText, { color: colors.quote }]} numberOfLines={3}>
              {item.memo}
            </Text>
          </View>
        ) : null}
        {item.link && onPressLink ? (
          <Pressable
            onPress={onPressLink}
            style={[
              styles.linkBtn,
              { borderColor: colors.accent, borderRadius: shape.innerRadius },
            ]}
            accessibilityRole="link"
            accessibilityLabel="リンクを開く"
          >
            <Ionicons name="open-outline" size={14} color={colors.accent} />
            <Text style={[styles.linkBtnText, { color: colors.accent }]}>リンクを開く</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginBottom: 4,
  },
  offset: {
    position: 'absolute',
  },
  card: {
    overflow: 'hidden',
    gap: 10,
  },
  bracket: {
    position: 'absolute',
  },
  bracketTL: { top: 4, left: 4 },
  bracketTR: { top: 4, right: 4 },
  bracketBL: { bottom: 4, left: 4 },
  bracketBR: { bottom: 4, right: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  indexLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  tagRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 120,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    letterSpacing: 0.3,
  },
  memoWell: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  memoText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  linkBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
