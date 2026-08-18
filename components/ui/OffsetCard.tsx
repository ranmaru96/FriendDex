import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useContentColors } from '@/utils/useContentColors';

type OffsetCardProps = {
  children: ReactNode;
  brackets?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  borderColor?: string;
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
      <View
        style={[styles.bracket, arm, styles.bracketTL, { borderTopWidth: borderWidth, borderLeftWidth: borderWidth }]}
      />
      <View
        style={[styles.bracket, arm, styles.bracketTR, { borderTopWidth: borderWidth, borderRightWidth: borderWidth }]}
      />
      <View
        style={[styles.bracket, arm, styles.bracketBL, { borderBottomWidth: borderWidth, borderLeftWidth: borderWidth }]}
      />
      <View
        style={[styles.bracket, arm, styles.bracketBR, { borderBottomWidth: borderWidth, borderRightWidth: borderWidth }]}
      />
    </>
  );
}

export function OffsetCard({
  children,
  brackets = false,
  style,
  contentStyle,
  borderColor,
}: OffsetCardProps) {
  const { shape, patternColors } = useAppTheme();
  const content = useContentColors();
  const offset = shape.offsetDistance;
  const edge = borderColor ?? content.contentBorder;
  const showBrackets = brackets && shape.cornerBrackets;

  return (
    <View
      style={[
        styles.wrap,
        offset > 0 ? { paddingRight: offset, paddingBottom: offset } : null,
        style,
      ]}
    >
      <View style={styles.inner}>
        {offset > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.offset,
              {
                backgroundColor: patternColors.offset,
                borderRadius: shape.cardBorderRadius,
                top: offset,
                left: offset,
                right: -offset,
                bottom: -offset,
              },
            ]}
          />
        ) : null}
        <View
          style={[
            styles.card,
            {
              backgroundColor: content.contentCard,
              borderColor: edge,
              borderWidth: shape.cardBorderWidth,
              borderRadius: shape.cardBorderRadius,
            },
            contentStyle,
          ]}
        >
          {showBrackets ? (
            <CornerBrackets color={edge} size={shape.bracketSize} borderWidth={shape.cardBorderWidth} />
          ) : null}
          {children}
        </View>
      </View>
    </View>
  );
}

export function OptionalOffsetCard({
  enabled,
  children,
  ...props
}: OffsetCardProps & { enabled: boolean }) {
  if (!enabled) return <>{children}</>;
  return <OffsetCard {...props}>{children}</OffsetCard>;
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'visible',
  },
  inner: {
    position: 'relative',
  },
  offset: {
    position: 'absolute',
  },
  card: {
    overflow: 'hidden',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  bracket: {
    position: 'absolute',
    zIndex: 2,
  },
  bracketTL: { top: 4, left: 4 },
  bracketTR: { top: 4, right: 4 },
  bracketBL: { bottom: 4, left: 4 },
  bracketBR: { bottom: 4, right: 4 },
});
