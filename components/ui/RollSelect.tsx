import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useContentColors } from '@/utils/useContentColors';

const DEFAULT_ITEM_HEIGHT = 36;
const VISIBLE_ROWS = 5;

type RollScrollLockContextValue = {
  setRollScrolling: (active: boolean) => void;
};

const RollScrollLockContext = createContext<RollScrollLockContextValue | null>(null);

/** ロール操作中だけ親フォームの縦スクロールを止める */
export function useRollScrollLock(): [boolean, RollScrollLockContextValue['setRollScrolling']] {
  const [formScrollEnabled, setFormScrollEnabled] = useState(true);
  const activeCountRef = useRef(0);

  const setRollScrolling = useCallback((active: boolean) => {
    if (active) {
      activeCountRef.current += 1;
      setFormScrollEnabled(false);
      return;
    }
    activeCountRef.current = Math.max(0, activeCountRef.current - 1);
    if (activeCountRef.current === 0) {
      setFormScrollEnabled(true);
    }
  }, []);

  return [formScrollEnabled, setRollScrolling];
}

export function RollScrollLockProvider({
  setRollScrolling,
  children,
}: {
  setRollScrolling: (active: boolean) => void;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ setRollScrolling }), [setRollScrolling]);
  return <RollScrollLockContext.Provider value={value}>{children}</RollScrollLockContext.Provider>;
}

type RollColumnProps = {
  values: number[];
  value: number;
  onChange: (value: number) => void;
  formatLabel?: (value: number) => string;
  itemHeight?: number;
  style?: StyleProp<ViewStyle>;
};

export function RollColumn({
  values,
  value,
  onChange,
  formatLabel = (v) => String(v),
  itemHeight = DEFAULT_ITEM_HEIGHT,
  style,
}: RollColumnProps) {
  const content = useContentColors();
  const scrollRef = useRef<ScrollView>(null);
  const pad = Math.floor(VISIBLE_ROWS / 2) * itemHeight;
  const selectedIndex = Math.max(0, values.indexOf(value));

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * itemHeight, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [itemHeight, selectedIndex, values]);

  const settleToNearest = (offsetY: number) => {
    const index = Math.round(offsetY / itemHeight);
    const clamped = Math.min(values.length - 1, Math.max(0, index));
    const next = values[clamped];
    if (next != null && next !== value) {
      onChange(next);
    }
    scrollRef.current?.scrollTo({ y: clamped * itemHeight, animated: true });
  };

  return (
    <View style={[styles.column, { height: itemHeight * VISIBLE_ROWS }, style]}>
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            top: pad,
            height: itemHeight,
            borderColor: content.contentBorder,
          },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        nestedScrollEnabled
        bounces={false}
        disallowInterruption
        onMomentumScrollEnd={(event) => settleToNearest(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => settleToNearest(event.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: pad }}
        style={styles.scroll}
      >
        {values.map((item) => {
          const selected = item === value;
          return (
            <View key={item} style={[styles.item, { height: itemHeight }]}>
              <Text
                style={[
                  styles.itemText,
                  {
                    color: selected ? content.contentText : content.contentTextSecondary,
                    fontWeight: selected ? '700' : '500',
                    opacity: selected ? 1 : 0.55,
                  },
                ]}
              >
                {formatLabel(item)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** 帯全体（左右含む）をロール操作領域にし、接触中は親スクロールを止める */
function RollGestureZone({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const lock = useContext(RollScrollLockContext);
  const holdingRef = useRef(false);

  const release = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    lock?.setRollScrolling(false);
  }, [lock]);

  useEffect(() => () => release(), [release]);

  return (
    <View
      collapsable={false}
      style={[styles.zone, style]}
      onTouchStart={() => {
        if (holdingRef.current) return;
        holdingRef.current = true;
        lock?.setRollScrolling(true);
      }}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      {children}
    </View>
  );
}

type DayRollPickerProps = {
  day: number;
  onChange: (day: number) => void;
  style?: StyleProp<ViewStyle>;
};

export function DayRollPicker({ day, onChange, style }: DayRollPickerProps) {
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);
  return (
    <RollGestureZone style={style}>
      <View style={styles.row}>
        <RollColumn values={days} value={day} onChange={onChange} formatLabel={(v) => `${v}日`} />
      </View>
    </RollGestureZone>
  );
}

type MonthDayRollPickerProps = {
  month: number;
  day: number;
  onChange: (next: { month: number; day: number }) => void;
  style?: StyleProp<ViewStyle>;
};

function daysInMonth(month: number): number {
  // Use leap year so Feb allows 29
  return new Date(2024, month, 0).getDate();
}

export function MonthDayRollPicker({ month, day, onChange, style }: MonthDayRollPickerProps) {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const maxDay = daysInMonth(month);
  const days = useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay]);
  const safeDay = Math.min(day, maxDay);

  return (
    <RollGestureZone style={style}>
      <View style={styles.row}>
        <RollColumn
          values={months}
          value={month}
          onChange={(nextMonth) => {
            const nextMax = daysInMonth(nextMonth);
            onChange({ month: nextMonth, day: Math.min(day, nextMax) });
          }}
          formatLabel={(v) => `${v}月`}
        />
        <RollColumn
          values={days}
          value={safeDay}
          onChange={(nextDay) => onChange({ month, day: nextDay })}
          formatLabel={(v) => `${v}日`}
        />
      </View>
    </RollGestureZone>
  );
}

type YearMonthRollPickerProps = {
  year: number;
  month: number;
  onChange: (next: { year: number; month: number }) => void;
  /** Inclusive year range. Defaults to currentYear-20 … currentYear+5 */
  yearRange?: { min: number; max: number };
  style?: StyleProp<ViewStyle>;
};

export function YearMonthRollPicker({
  year,
  month,
  onChange,
  yearRange,
  style,
}: YearMonthRollPickerProps) {
  const nowYear = new Date().getFullYear();
  const minYear = yearRange?.min ?? nowYear - 20;
  const maxYear = yearRange?.max ?? nowYear + 5;
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = minYear; y <= maxYear; y += 1) {
      list.push(y);
    }
    return list;
  }, [maxYear, minYear]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const safeYear = Math.min(maxYear, Math.max(minYear, year));
  const safeMonth = Math.min(12, Math.max(1, month));

  return (
    <RollGestureZone style={style}>
      <View style={styles.row}>
        <RollColumn
          values={years}
          value={safeYear}
          onChange={(nextYear) => onChange({ year: nextYear, month: safeMonth })}
          formatLabel={(v) => `${v}年`}
        />
        <RollColumn
          values={months}
          value={safeMonth}
          onChange={(nextMonth) => onChange({ year: safeYear, month: nextMonth })}
          formatLabel={(v) => `${v}月`}
        />
      </View>
    </RollGestureZone>
  );
}

const styles = StyleSheet.create({
  zone: {
    width: '100%',
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    alignSelf: 'stretch',
  },
  column: {
    flex: 1,
    overflow: 'hidden',
  },
  selectionBand: {
    position: 'absolute',
    left: 8,
    right: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
    zIndex: 0,
  },
  scroll: {
    zIndex: 1,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 18,
  },
});
