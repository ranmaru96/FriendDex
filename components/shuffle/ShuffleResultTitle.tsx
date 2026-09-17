import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radius } from '@/constants/theme';
import {
  contentMutedTextStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

type ShuffleResultTitleProps = {
  title: string;
  runLabel?: string | null;
  trailing?: ReactNode;
};

export function ShuffleResultTitle({ title, runLabel, trailing }: ShuffleResultTitleProps) {
  const content = useContentColors();

  return (
    <View style={styles.row}>
      <View style={[styles.lead, trailing ? styles.leadFill : null]}>
        <Text style={[styles.title, contentTextStyle(content)]}>{title}</Text>
        {runLabel ? (
          <View style={[styles.runTag, contentTagStyle(content)]}>
            <Text style={[styles.runTagText, contentMutedTextStyle(content)]}>{runLabel}</Text>
          </View>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
  },
  lead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  leadFill: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  runTag: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  runTagText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
