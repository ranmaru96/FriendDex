import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme, Radius } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import { contentMutedTextStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
import { formatYen } from '@/utils/moneyLoanHelpers';
import type { SettlementTransferDisplay } from '@/utils/settlementTransferHelpers';

type SettlementTransferRowProps = {
  transfer: SettlementTransferDisplay;
  isCompleted: boolean;
  onToggle: () => void;
  canToggle?: boolean;
};

export function SettlementTransferRow({
  transfer,
  isCompleted,
  onToggle,
  canToggle = true,
}: SettlementTransferRowProps) {
  const content = useContentColors();

  return (
    <Pressable
      style={[
        styles.row,
        transfer.incomingFromPeer ? { backgroundColor: content.contentPersonTagBg, borderRadius: 8, paddingHorizontal: 6 } : null,
      ]}
      onPress={canToggle ? onToggle : undefined}
      disabled={!canToggle}
    >
      <View
        style={[
          styles.check,
          { borderColor: content.contentSearchFieldBorder, backgroundColor: content.contentInputBg },
          isCompleted
            ? {
                borderColor: content.contentText,
                backgroundColor: content.contentPersonTagBg,
              }
            : null,
        ]}
      >
        <Text
          style={[
            styles.checkText,
            contentMutedTextStyle(content),
            isCompleted ? contentTextStyle(content) : null,
          ]}
        >
          済
        </Text>
      </View>
      <View style={styles.body}>
        <Text
          style={[
            styles.line,
            contentTextStyle(content),
            isCompleted && styles.lineCompleted,
            isCompleted && contentMutedTextStyle(content),
          ]}
        >
          {transfer.fromName} → {transfer.toName} : {formatYen(transfer.amount)}
        </Text>
        <Text style={[styles.status, contentMutedTextStyle(content)]}>
          {isCompleted ? '完了' : '未完了'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
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
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  line: {
    fontSize: 14,
    fontWeight: '600',
  },
  lineCompleted: {
    textDecorationLine: 'line-through',
  },
  status: {
    fontSize: 11,
  },
});
