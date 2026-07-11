import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Radius, Theme } from '@/constants/theme';
import type { Event } from '@/types';
import {
  buildScheduleGridChipsForDate,
  buildScheduleGridWeeks,
  getScheduleGridWeekdayLabels,
  SCHEDULE_GRID_EVENT_SLOTS,
  type ScheduleGridDay,
  type ScheduleGridEventChip,
} from '@/utils/scheduleGridCalendar';

const GRID_BORDER = Theme.inputBorder;
const IN_MONTH_BG = Theme.card;
const OUT_MONTH_BG = '#f1f5f9';
const SELECTED_BG = '#e8f4f1';
const TODAY_RING = Theme.accent;
const SATURDAY_COLOR = '#2563eb';
const SUNDAY_COLOR = '#dc2626';
const CHIP_HEIGHT = 14;
const CHIP_GAP = 2;
const DATE_ROW_HEIGHT = 18;
const ROW_PADDING = 3;
/** セル内 padding + 隣接セルへのバー連結用 */
const CELL_BLEED = 3;
const DAY_CELL_HEIGHT =
  DATE_ROW_HEIGHT +
  ROW_PADDING * 2 +
  SCHEDULE_GRID_EVENT_SLOTS * CHIP_HEIGHT +
  Math.max(0, SCHEDULE_GRID_EVENT_SLOTS - 1) * CHIP_GAP;

type ScheduleGridMonthCalendarProps = {
  year: number;
  month: number;
  selectedDate: string;
  todayKey: string;
  events: Event[];
  onDayPress: (dateKey: string) => void;
  onMonthChange: (year: number, month: number) => void;
  edgeToEdge?: boolean;
};

function getChipBarStyles(chip: ScheduleGridEventChip): ViewStyle[] {
  const barStyles: ViewStyle[] = [styles.eventChip, { backgroundColor: chip.color }];

  switch (chip.span) {
    case 'start':
      barStyles.push(
        styles.eventChipStart,
        styles.eventChipConnectRight,
        styles.eventChipRadiusLeft
      );
      break;
    case 'middle':
      barStyles.push(styles.eventChipMiddle, styles.eventChipConnectBoth);
      break;
    case 'end':
      barStyles.push(styles.eventChipEnd, styles.eventChipConnectLeft, styles.eventChipRadiusRight);
      break;
    default:
      barStyles.push(styles.eventChipSingle);
      break;
  }

  return barStyles;
}

function EventChip({ chip }: { chip: ScheduleGridEventChip }) {
  return (
    <View style={getChipBarStyles(chip)}>
      {chip.label ? (
        <Text style={styles.eventChipText} numberOfLines={1} allowFontScaling={false}>
          {chip.label}
        </Text>
      ) : null}
    </View>
  );
}

function DayCell({
  day,
  selectedDate,
  todayKey,
  events,
  onDayPress,
  isLastColumn,
}: {
  day: ScheduleGridDay;
  selectedDate: string;
  todayKey: string;
  events: Event[];
  onDayPress: (dateKey: string) => void;
  isLastColumn: boolean;
}) {
  const isSelected = day.dateKey === selectedDate;
  const isToday = day.dateKey === todayKey;
  const chips = useMemo(
    () => buildScheduleGridChipsForDate(events, day.dateKey),
    [day.dateKey, events]
  );

  const dateColor = useMemo(() => {
    if (!day.inCurrentMonth) {
      return Theme.textSecondary;
    }
    if (day.dayOfWeek === 0) {
      return SUNDAY_COLOR;
    }
    if (day.dayOfWeek === 6) {
      return SATURDAY_COLOR;
    }
    return Theme.textPrimary;
  }, [day.dayOfWeek, day.inCurrentMonth]);

  const emptySlots = Math.max(0, SCHEDULE_GRID_EVENT_SLOTS - chips.length);

  return (
    <Pressable
      style={[
        styles.dayCell,
        !isLastColumn ? styles.dayCellBorderRight : null,
        { backgroundColor: day.inCurrentMonth ? IN_MONTH_BG : OUT_MONTH_BG },
        isSelected ? styles.dayCellSelected : null,
      ]}
      onPress={() => onDayPress(day.dateKey)}
    >
      <View style={styles.dateRow}>
        {isToday ? (
          <View style={[styles.todayCircle, isSelected ? styles.todayCircleSelected : null]}>
            <Text
              style={[
                styles.dateText,
                styles.todayDateText,
                isSelected ? styles.selectedDateText : null,
                { color: isSelected ? Theme.onAccent : dateColor },
              ]}
              allowFontScaling={false}
            >
              {day.day}
            </Text>
          </View>
        ) : (
          <Text
            style={[
              styles.dateText,
              isSelected ? styles.selectedDateText : null,
              { color: isSelected ? Theme.accent : dateColor },
            ]}
            allowFontScaling={false}
          >
            {day.day}
          </Text>
        )}
      </View>

      <View style={styles.chipColumn}>
        {chips.map((chip) => (
          <EventChip key={`${chip.eventId}-${day.dateKey}`} chip={chip} />
        ))}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <View key={`slot-${index}`} style={styles.chipPlaceholder} />
        ))}
      </View>
    </Pressable>
  );
}

export function ScheduleGridMonthCalendar({
  year,
  month,
  selectedDate,
  todayKey,
  events,
  onDayPress,
  onMonthChange,
  edgeToEdge = false,
}: ScheduleGridMonthCalendarProps) {
  const weeks = useMemo(() => buildScheduleGridWeeks(year, month), [month, year]);
  const weekdayLabels = getScheduleGridWeekdayLabels();

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    onMonthChange(next.getFullYear(), next.getMonth() + 1);
  };

  return (
    <View style={[styles.root, edgeToEdge ? styles.rootEdgeToEdge : null]}>
      <View style={styles.header}>
        <Pressable style={styles.navButton} onPress={() => shiftMonth(-1)} hitSlop={8}>
          <Text style={styles.navButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {year}年{month}月
        </Text>
        <Pressable style={styles.navButton} onPress={() => shiftMonth(1)} hitSlop={8}>
          <Text style={styles.navButtonText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label, index) => (
          <View key={label} style={[styles.weekdayCell, index < 6 ? styles.dayCellBorderRight : null]}>
            <Text
              style={[
                styles.weekdayText,
                index === 0 ? styles.sundayWeekday : null,
                index === 6 ? styles.saturdayWeekday : null,
              ]}
              allowFontScaling={false}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {weeks.map((week, weekIndex) => (
          <View
            key={`week-${weekIndex}`}
            style={[styles.weekRow, weekIndex < weeks.length - 1 ? styles.weekRowBorderBottom : null]}
          >
            {week.map((day, dayIndex) => (
              <DayCell
                key={day.dateKey}
                day={day}
                selectedDate={selectedDate}
                todayKey={todayKey}
                events={events}
                onDayPress={onDayPress}
                isLastColumn={dayIndex === 6}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GRID_BORDER,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: IN_MONTH_BG,
  },
  rootEdgeToEdge: {
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRID_BORDER,
    backgroundColor: IN_MONTH_BG,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  navButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    fontSize: 22,
    fontWeight: '600',
    color: Theme.textPrimary,
    lineHeight: 24,
  },
  weekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRID_BORDER,
    backgroundColor: '#f8fafc',
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
  sundayWeekday: {
    color: SUNDAY_COLOR,
  },
  saturdayWeekday: {
    color: SATURDAY_COLOR,
  },
  grid: {
    backgroundColor: GRID_BORDER,
    overflow: 'visible',
  },
  weekRow: {
    flexDirection: 'row',
    backgroundColor: GRID_BORDER,
    overflow: 'visible',
  },
  weekRowBorderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRID_BORDER,
  },
  dayCell: {
    flex: 1,
    height: DAY_CELL_HEIGHT,
    paddingHorizontal: 2,
    paddingTop: ROW_PADDING,
    paddingBottom: ROW_PADDING,
    overflow: 'visible',
  },
  dayCellBorderRight: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: GRID_BORDER,
  },
  dayCellSelected: {
    backgroundColor: SELECTED_BG,
  },
  dateRow: {
    height: DATE_ROW_HEIGHT,
    paddingHorizontal: 2,
    justifyContent: 'flex-start',
    zIndex: 1,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  selectedDateText: {
    fontWeight: '700',
  },
  todayCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: TODAY_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayCircleSelected: {
    backgroundColor: Theme.accent,
    borderColor: Theme.accent,
  },
  todayDateText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  chipColumn: {
    gap: CHIP_GAP,
    overflow: 'visible',
  },
  eventChip: {
    height: CHIP_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 3,
  },
  eventChipSingle: {
    borderRadius: 2,
  },
  eventChipRadiusLeft: {
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  eventChipRadiusRight: {
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  eventChipStart: {},
  eventChipMiddle: {},
  eventChipEnd: {},
  eventChipConnectRight: {
    marginRight: -CELL_BLEED,
  },
  eventChipConnectLeft: {
    marginLeft: -CELL_BLEED,
  },
  eventChipConnectBoth: {
    marginLeft: -CELL_BLEED,
    marginRight: -CELL_BLEED,
  },
  eventChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 11,
  },
  chipPlaceholder: {
    height: CHIP_HEIGHT,
  },
});
