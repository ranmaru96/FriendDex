import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ShuffleMode } from '@/utils/shuffleSession';
import { ShuffleModeInfoButton } from './ShuffleModeInfoButton';
import { ShuffleRunButton } from './ShuffleRunButton';

type ShufflePanelHeaderProps = {
  mode: ShuffleMode;
  onShuffle?: () => void;
  accessory?: ReactNode;
  children?: ReactNode;
};

export function ShufflePanelHeader({
  mode,
  onShuffle,
  accessory,
  children,
}: ShufflePanelHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.main}>{children}</View>
      {accessory}
      <ShuffleModeInfoButton mode={mode} />
      <ShuffleRunButton onPress={() => onShuffle?.()} disabled={!onShuffle} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -6,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    minWidth: 0,
  },
});
