import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Radius, Spacing } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import type { SettlementPersonAggregate } from '@/utils/settlementPersonAggregates';
import { formatSettlementNetSignedAmount } from '@/utils/settlementPersonAggregates';

type SettlementPersonAggregateCardProps = {
  aggregate: SettlementPersonAggregate;
  isItemCompleted: (key: string) => boolean;
  onToggleItem: (key: string) => void;
  canToggleItem?: (item: SettlementPersonAggregate['items'][number]) => boolean;
  /** 行テキスト側タップで編集（チェックは清算済トグルのまま） */
  onEditItem?: (key: string) => void;
  settled?: boolean;
};

export function SettlementPersonAggregateCard({
  aggregate,
  isItemCompleted,
  onToggleItem,
  canToggleItem,
  onEditItem,
  settled = false,
}: SettlementPersonAggregateCardProps) {
  const content = useContentColors();

  return (
    <View style={[styles.card, contentSurfaceStyle(content), settled && styles.cardSettled]}>
      <View style={styles.header}>
        <Text
          style={[
            styles.personName,
            contentTextStyle(content),
            settled && contentMutedTextStyle(content),
          ]}
          numberOfLines={1}
        >
          {aggregate.displayName}
        </Text>
        <Text
          style={[
            styles.personTotal,
            contentTextStyle(content),
            settled && contentMutedTextStyle(content),
          ]}
        >
          {formatSettlementNetSignedAmount(aggregate.netSignedAmount)}
        </Text>
      </View>
      {aggregate.items.length > 1 ? (
        <Text style={[styles.breakdownLabel, contentMutedTextStyle(content)]}>内訳</Text>
      ) : null}
      {aggregate.items.map((item) => {
        const completed = isItemCompleted(item.key);
        const allowToggle = canToggleItem ? canToggleItem(item) : true;
        const allowEdit = Boolean(onEditItem) && item.incomingFromPeer !== true;
        const body = (
          <View style={styles.breakdownBody}>
            <Text
              style={[
                styles.breakdownTitle,
                contentTextStyle(content),
                completed && styles.breakdownTitleCompleted,
                completed && contentMutedTextStyle(content),
              ]}
              numberOfLines={1}
            >
              {item.roomTitle}
            </Text>
            <Text style={[styles.breakdownMeta, contentMutedTextStyle(content)]}>{item.lineLabel}</Text>
            {allowEdit ? (
              <Text style={[styles.editHint, contentMutedTextStyle(content)]}>タップで編集</Text>
            ) : null}
          </View>
        );

        return (
          <View
            key={item.key}
            style={[
              styles.breakdownRow,
              item.incomingFromPeer ? { backgroundColor: content.contentPersonTagBg, borderRadius: 8 } : null,
            ]}
          >
            <Pressable
              style={[
                styles.check,
                { borderColor: content.contentSearchFieldBorder, backgroundColor: content.contentInputBg },
                completed
                  ? {
                      borderColor: content.contentText,
                      backgroundColor: content.contentPersonTagBg,
                    }
                  : null,
              ]}
              onPress={() => {
                if (allowToggle) {
                  onToggleItem(item.key);
                }
              }}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.checkText,
                  contentMutedTextStyle(content),
                  completed ? contentTextStyle(content) : null,
                ]}
              >
                済
              </Text>
            </Pressable>
            {allowEdit && onEditItem ? (
              <Pressable style={styles.breakdownBodyPressable} onPress={() => onEditItem(item.key)}>
                {body}
              </Pressable>
            ) : (
              <Pressable
                style={styles.breakdownBodyPressable}
                onPress={() => {
                  if (allowToggle) {
                    onToggleItem(item.key);
                  }
                }}
              >
                {body}
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
  },
  cardSettled: {
    opacity: 0.72,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  personName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  personTotal: {
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 0,
  },
  breakdownLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontSize: 11,
    fontWeight: '700',
  },
  breakdownBodyPressable: {
    flex: 1,
    minWidth: 0,
  },
  breakdownBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  breakdownTitleCompleted: {
    textDecorationLine: 'line-through',
  },
  breakdownMeta: {
    fontSize: 12,
  },
  editHint: {
    fontSize: 10,
    marginTop: 1,
  },
});
