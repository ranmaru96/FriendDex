import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DesignPatternColors, DesignPatternShape } from '@/constants/designPatterns';
import { AnswerPersonCell } from '@/components/your-answer/AnswerPersonCell';
import { answerRowStyles } from '@/components/your-answer/answerRowStyles';

export type CodexAnswerRow = {
  id: string;
  name: string;
  photoUri: string | null;
  body: string;
};

type CodexQuestionCardProps = {
  indexLabel: string;
  title: string;
  answerCount: number;
  expanded: boolean;
  answers: CodexAnswerRow[];
  colors: DesignPatternColors;
  shape: DesignPatternShape;
  onToggle: () => void;
  onLongPressQuestion: () => void;
  onPressAnswer: (answerId: string) => void;
  onLongPressAnswer: (answerId: string) => void;
  onAddAnswers: () => void;
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

export function CodexQuestionCard({
  indexLabel,
  title,
  answerCount,
  expanded,
  answers,
  colors,
  shape,
  onToggle,
  onLongPressQuestion,
  onPressAnswer,
  onLongPressAnswer,
  onAddAnswers,
}: CodexQuestionCardProps) {
  const edge = expanded ? colors.accent : colors.cyan;
  const offset = shape.offsetDistance;
  const isCodexVoice = shape.cornerBrackets;

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
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: edge,
            borderRadius: shape.cardBorderRadius,
            borderWidth: shape.cardBorderWidth,
            paddingHorizontal: shape.cardPadding,
            paddingTop: 10,
            paddingBottom: 8,
          },
        ]}
      >
        {shape.cornerBrackets ? (
          <CornerBrackets color={edge} size={shape.bracketSize} borderWidth={shape.cardBorderWidth} />
        ) : null}
        <Pressable
          onPress={onToggle}
          onLongPress={onLongPressQuestion}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}を${expanded ? '閉じる' : '開く'}`}
          style={styles.header}
        >
          <View style={styles.metaRow}>
            <Text
              style={[
                styles.indexLabel,
                { color: colors.cyan, letterSpacing: shape.kickerLetterSpacing },
              ]}
            >
              {indexLabel}
            </Text>
            <View
              style={[
                styles.logBadge,
                {
                  backgroundColor: colors.accentSoft,
                  borderColor: colors.accent,
                  borderRadius: Math.max(2, shape.innerRadius / 2),
                },
              ]}
            >
              <Text style={[styles.logBadgeText, { color: colors.accent }]}>
                {isCodexVoice
                  ? `${answerCount} LOG${answerCount === 1 ? '' : 'S'}`
                  : `回答 ${answerCount}件`}
              </Text>
            </View>
          </View>
          <Text style={[styles.title, { color: colors.cardInk }]}>{title}</Text>
        </Pressable>

        {expanded ? (
          <View style={[styles.logPanel, { borderTopColor: colors.cyan }]}>
            <Text
              style={[
                styles.logHeading,
                { color: colors.gold, letterSpacing: shape.kickerLetterSpacing },
              ]}
            >
              {isCodexVoice ? 'TRANSMISSION' : '回答'}
            </Text>
            {answers.length === 0 ? (
              <Text style={[styles.emptyLogs, { color: colors.cardMuted }]}>まだ記録がありません</Text>
            ) : (
              <View style={answerRowStyles.list}>
                {answers.map((answer) => (
                  <Pressable
                    key={answer.id}
                    style={answerRowStyles.row}
                    onPress={() => onPressAnswer(answer.id)}
                    onLongPress={() => onLongPressAnswer(answer.id)}
                  >
                    <AnswerPersonCell name={answer.name} photoUri={answer.photoUri} colors={colors} />
                    <View
                      style={[
                        answerRowStyles.well,
                        {
                          backgroundColor: colors.logBg,
                          borderColor: colors.cyan,
                          borderRadius: shape.innerRadius,
                        },
                      ]}
                    >
                      <Text style={[answerRowStyles.body, { color: colors.quote }]} numberOfLines={1}>
                        {answer.body}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable
              style={[
                styles.addLogs,
                { backgroundColor: colors.addBtn, borderRadius: shape.innerRadius },
              ]}
              onPress={onAddAnswers}
            >
              <Text style={[styles.addLogsText, { color: colors.addBtnInk }]}>＋ 記録する</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={onToggle}
          onLongPress={onLongPressQuestion}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}を${expanded ? '閉じる' : '開く'}`}
          style={styles.promptRow}
        >
          <Text style={[styles.prompt, { color: colors.cardMuted }]}>
            {isCodexVoice
              ? expanded
                ? 'CLOSE TRANSMISSION'
                : 'TAP TO DECODE'
              : expanded
                ? '閉じる'
                : '開く'}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={colors.cyan}
          />
        </Pressable>
      </View>
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
  },
  bracket: {
    position: 'absolute',
  },
  bracketTL: { top: 4, left: 4 },
  bracketTR: { top: 4, right: 4 },
  bracketBL: { bottom: 4, left: 4 },
  bracketBR: { bottom: 4, right: 4 },
  header: {
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  indexLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  logBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  logBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
    letterSpacing: 0.3,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 2,
    marginTop: 4,
  },
  prompt: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  logPanel: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  logHeading: {
    fontSize: 10,
    fontWeight: '800',
  },
  emptyLogs: {
    fontSize: 13,
    paddingVertical: 4,
  },
  addLogs: {
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  addLogsText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
