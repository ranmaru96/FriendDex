import { StyleSheet, Text, View } from 'react-native';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import type { RecentSevenDayItem } from '@/utils/taskHelpers';
import type { AppThemeContentColorFields } from '@/constants/appThemes/contentColors';

/** 完了塗り: ホワイト=オレンジ / ブラック=緑 */
export function taskCompletionFillColor(isBlack: boolean): string {
  return isBlack ? '#9ae635' : '#f0a040';
}

/** 当日の外リング用アクセント */
function todayAccentColor(isBlack: boolean): string {
  return isBlack ? '#9ae635' : '#f0a040';
}

type TaskRecentSevenDayDotsProps = {
  days: RecentSevenDayItem[];
  content: AppThemeContentColorFields;
  /** 一覧向けは小さく、詳細向けは通常 */
  compact?: boolean;
  showCaptions?: boolean;
};

/** 完了はテーマ色で塗り、当日スロットだけ二重丸（未完了は薄い外リング） */
export function TaskRecentSevenDayDots({
  days,
  content,
  compact = true,
  showCaptions = false,
}: TaskRecentSevenDayDotsProps) {
  const isBlack = useAppThemeOptional()?.variant === 'black';
  const fill = taskCompletionFillColor(Boolean(isBlack));
  const todayAccent = todayAccentColor(Boolean(isBlack));
  const size = compact ? 12 : 28;
  const outerSize = size + (compact ? 6 : 8);

  if (days.length === 0) {
    return null;
  }

  return (
    <View style={[styles.row, compact ? styles.rowCompact : styles.rowDetail]}>
      {days.map((item) => {
        const done = item.done;
        const today = item.isToday;
        return (
          <View key={item.ymd} style={styles.item}>
            <View style={[styles.dotStack, { width: outerSize, height: outerSize }]}>
              {today ? (
                <View
                  style={[
                    styles.outerRing,
                    {
                      width: outerSize,
                      height: outerSize,
                      borderRadius: outerSize / 2,
                      borderColor: todayAccent,
                      borderWidth: compact ? 1.5 : 2,
                      opacity: done ? 1 : 0.4,
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.dot,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderWidth: compact ? 1 : 1.5,
                    borderColor: done ? fill : content.contentBorder,
                    backgroundColor: done ? fill : 'transparent',
                  },
                ]}
              >
                {done && !compact ? <Text style={styles.check}>✓</Text> : null}
              </View>
            </View>
            {showCaptions ? (
              <Text style={[styles.caption, { color: content.contentTextSecondary }]}>{item.label}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  rowCompact: {
    justifyContent: 'flex-start',
    gap: 5,
    marginTop: 0,
  },
  rowDetail: {
    justifyContent: 'space-between',
    width: '100%',
  },
  item: {
    alignItems: 'center',
    gap: 4,
  },
  dotStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
  },
  dot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 16,
    textAlign: 'center',
    includeFontPadding: false,
  },
  caption: {
    fontSize: 10,
  },
});
