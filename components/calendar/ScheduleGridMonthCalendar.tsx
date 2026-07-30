import { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Radius, Theme } from '@/constants/theme';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useContentColors } from '@/utils/useContentColors';
import type { Event } from '@/types';
import {
  buildScheduleGridChipsForDate,
  buildScheduleGridWeeks,
  getScheduleGridBarSpanWidthPx,
  getScheduleGridWeekdayLabels,
  SCHEDULE_GRID_CELL_BLEED,
  SCHEDULE_GRID_EVENT_SLOTS,
  type ScheduleGridDay,
  type ScheduleGridEventChip,
} from '@/utils/scheduleGridCalendar';

const GRID_BORDER = Theme.inputBorder;
/** 当日セルの薄い黄オレンジ背景（テーマ非依存・視認性優先） */
const TODAY_BG = '#FFF8E6';
/** 当日日付バッジ（画像参考のオレンジ） */
const TODAY_BADGE_BG = '#F5A623';
const SELECTED_RING = Theme.accent;
const SATURDAY_COLOR = '#2563eb';
const SUNDAY_COLOR = '#dc2626';
const CHIP_HEIGHT = 14;
const CHIP_GAP = 2;
const DATE_ROW_HEIGHT = 18;
const ROW_PADDING = 3;
/** セル内 padding + 隣接セルへのバー連結用 */
const CELL_BLEED = SCHEDULE_GRID_CELL_BLEED;
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

function getChipBarStyles(chip: ScheduleGridEventChip, barWidthPx: number | null): ViewStyle[] {
  const barStyles: ViewStyle[] = [styles.eventChip, { backgroundColor: chip.color }];

  if (barWidthPx != null) {
    barStyles.push({
      width: barWidthPx,
      alignSelf: 'flex-start',
      overflow: 'hidden',
      zIndex: 2,
    });
  }

  switch (chip.span) {
    case 'start':
      barStyles.push(styles.eventChipStart, styles.eventChipRadiusLeft);
      if (chip.spanDaysInWeek <= 1) {
        barStyles.push(styles.eventChipConnectRight);
      } else {
        barStyles.push(styles.eventChipRadiusRight);
      }
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

function EventChip({ chip, cellWidth }: { chip: ScheduleGridEventChip; cellWidth: number }) {
  const spansMultipleDays = chip.label != null && chip.spanDaysInWeek > 1;
  const barWidthPx = spansMultipleDays
    ? getScheduleGridBarSpanWidthPx(cellWidth, chip.spanDaysInWeek)
    : null;

  return (
    <View style={getChipBarStyles(chip, barWidthPx)}>
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
  week,
  cellWidth,
  selectedDate,
  todayKey,
  events,
  onDayPress,
  isLastColumn,
}: {
  day: ScheduleGridDay;
  week: ScheduleGridDay[];
  cellWidth: number;
  selectedDate: string;
  todayKey: string;
  events: Event[];
  onDayPress: (dateKey: string) => void;
  isLastColumn: boolean;
}) {
  const isSelected = day.dateKey === selectedDate;
  const isToday = day.dateKey === todayKey;
  const chips = useMemo(
    () => buildScheduleGridChipsForDate(events, day.dateKey, week, cellWidth),
    [cellWidth, day.dateKey, events, week]
  );

  const content = useContentColors();
  const dateColor = useMemo(() => {
    if (!day.inCurrentMonth) {
      return content.contentTextSecondary;
    }
    if (day.dayOfWeek === 0) {
      return SUNDAY_COLOR;
    }
    if (day.dayOfWeek === 6) {
      return SATURDAY_COLOR;
    }
    return content.contentText;
  }, [content.contentText, content.contentTextSecondary, day.dayOfWeek, day.inCurrentMonth]);

  const emptySlots = Math.max(0, SCHEDULE_GRID_EVENT_SLOTS - chips.length);
  const hasSpanningLabel = chips.some((chip) => chip.label != null && chip.spanDaysInWeek > 1);

  return (
    <Pressable
      style={[
        styles.dayCell,
        !isLastColumn ? styles.dayCellBorderRight : null,
        {
          backgroundColor: isToday
            ? TODAY_BG
            : day.inCurrentMonth
              ? content.contentCalendarInMonth
              : content.contentCalendarOutMonth,
        },
        hasSpanningLabel ? styles.dayCellSpanningLabel : null,
      ]}
      onPress={() => onDayPress(day.dateKey)}
    >
      {isSelected ? <View pointerEvents="none" style={styles.selectedFrame} /> : null}
      <View style={styles.dateRow}>
        {isToday ? (
          <View style={styles.todayBadge}>
            <Text style={styles.todayBadgeText} allowFontScaling={false}>
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
          <EventChip key={`${chip.eventId}-${day.dateKey}`} chip={chip} cellWidth={cellWidth} />
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
  const [cellWidth, setCellWidth] = useState(() => Dimensions.get('window').width / 7);
  const appTheme = useAppThemeOptional();
  const content = useContentColors();
  const outerBorderColor = appTheme?.colors.calendarOuterBorder ?? GRID_BORDER;
  const bottomSeparatorColor = appTheme?.colors.tabBarBorder ?? outerBorderColor;
  const isMonochrome = isMonochromeAppTheme(appTheme?.variant);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      setCellWidth(width / 7);
    }
  }, []);

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    onMonthChange(next.getFullYear(), next.getMonth() + 1);
  };

  return (
    <View
      style={[
        styles.root,
        {
          borderColor: outerBorderColor,
          backgroundColor: content.contentCalendarInMonth,
          /** モノクロ: 上はヘッダー下線と接するので不要。下は薄いセパレーターだけ残す */
          borderTopWidth: isMonochrome ? 0 : StyleSheet.hairlineWidth,
          borderBottomWidth: isMonochrome ? 1.5 : 0,
          borderBottomColor: isMonochrome ? bottomSeparatorColor : outerBorderColor,
        },
        edgeToEdge ? styles.rootEdgeToEdge : null,
      ]}
    >
      <View style={[styles.header, { backgroundColor: content.contentCalendarInMonth }]}>
        <Pressable style={styles.navButton} onPress={() => shiftMonth(-1)} hitSlop={8}>
          <Text style={[styles.navButtonText, { color: content.contentText }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: content.contentText }]}>
          {year}年{month}月
        </Text>
        <Pressable style={styles.navButton} onPress={() => shiftMonth(1)} hitSlop={8}>
          <Text style={[styles.navButtonText, { color: content.contentText }]}>›</Text>
        </Pressable>
      </View>

      <View style={[styles.weekdayRow, { backgroundColor: content.contentCalendarInMonth }]}>
        {weekdayLabels.map((label, index) => (
          <View key={label} style={[styles.weekdayCell, index < 6 ? styles.dayCellBorderRight : null]}>
            <Text
              style={[
                styles.weekdayText,
                { color: content.contentTextSecondary },
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

      <View style={styles.grid} onLayout={handleGridLayout}>
        {weeks.map((week, weekIndex) => (
          <View
            key={`week-${weekIndex}`}
            style={[styles.weekRow, weekIndex < weeks.length - 1 ? styles.weekRowBorderBottom : null]}
          >
            {week.map((day, dayIndex) => (
              <DayCell
                key={day.dateKey}
                day={day}
                week={week}
                cellWidth={cellWidth}
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
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    overflow: 'hidden',
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
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
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
    lineHeight: 24,
  },
  weekdayRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GRID_BORDER,
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
  selectedFrame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: SELECTED_RING,
    zIndex: 4,
  },
  dateRow: {
    height: DATE_ROW_HEIGHT,
    paddingHorizontal: 2,
    alignItems: 'flex-start',
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
  todayBadge: {
    alignSelf: 'flex-start',
    minWidth: 16,
    height: 16,
    paddingHorizontal: 2,
    borderRadius: 2,
    backgroundColor: TODAY_BADGE_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 12,
  },
  chipColumn: {
    gap: CHIP_GAP,
    overflow: 'visible',
  },
  dayCellSpanningLabel: {
    zIndex: 3,
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
