import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Radius, Theme } from '@/constants/theme';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useContentColors } from '@/utils/useContentColors';
import { YearMonthRollPicker } from '@/components/ui/RollSelect';
import type { Event } from '@/types';
import {
  buildScheduleGridChipsForDate,
  buildScheduleGridWeeks,
  getScheduleGridBarSpanWidthPx,
  getScheduleGridWeekdayLabels,
  SCHEDULE_GRID_CELL_BLEED,
  SCHEDULE_GRID_EVENT_SLOTS,
  SCHEDULE_GRID_MAX_EVENTS,
  type ScheduleGridDay,
  type ScheduleGridEventChip,
} from '@/utils/scheduleGridCalendar';
import { filterEventsByLocalDate } from '@/utils/eventHelpers';

const GRID_BORDER = Theme.inputBorder;
/** 当日日付バッジ（オレンジ） */
const TODAY_BADGE_BG = '#F5A623';
/** 選択枠（オレンジ）: 格子線の上に乗せる */
const SELECTED_RING = '#F5A623';
const SELECTED_RING_WIDTH = 2;
/** 誕生日アイコン（日付の右） */
export const BIRTHDAY_ICON_COLOR = '#F2789F';
const SATURDAY_COLOR = '#2563eb';
const SUNDAY_COLOR = '#dc2626';
const CHIP_HEIGHT = 14;
const CHIP_GAP = 2;
const DATE_ROW_HEIGHT = 18;
const ROW_PADDING = 3;
/** セル内 padding + 隣接セルへのバー連結用 */
const CELL_BLEED = SCHEDULE_GRID_CELL_BLEED;
/** 横フリックで月移動と判定する最小移動量 */
const MONTH_SWIPE_THRESHOLD = 48;
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
  /** 誕生日がある月日（MM-DD）。年は問わない */
  birthdayMonthDays?: Set<string>;
  /** 予定タグ（共通項目）編集へ */
  onPressEpisodeTags?: () => void;
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
  gridLineColor,
  gridLineWidth,
  hasBirthday,
}: {
  day: ScheduleGridDay;
  week: ScheduleGridDay[];
  cellWidth: number;
  selectedDate: string;
  todayKey: string;
  events: Event[];
  onDayPress: (dateKey: string) => void;
  isLastColumn: boolean;
  gridLineColor: string;
  gridLineWidth: number;
  hasBirthday: boolean;
}) {
  const isSelected = day.dateKey === selectedDate;
  const isToday = day.dateKey === todayKey;
  const chips = useMemo(
    () => buildScheduleGridChipsForDate(events, day.dateKey, week, cellWidth),
    [cellWidth, day.dateKey, events, week]
  );
  const overflowCount = useMemo(() => {
    const total = filterEventsByLocalDate(events, day.dateKey).length;
    return Math.max(0, total - SCHEDULE_GRID_MAX_EVENTS);
  }, [day.dateKey, events]);

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
        !isLastColumn
          ? { borderRightWidth: gridLineWidth, borderRightColor: gridLineColor }
          : null,
        {
          backgroundColor: day.inCurrentMonth
            ? content.contentCalendarInMonth
            : content.contentCalendarOutMonth,
        },
        hasSpanningLabel ? styles.dayCellSpanningLabel : null,
        isSelected ? styles.dayCellSelected : null,
      ]}
      onPress={() => onDayPress(day.dateKey)}
    >
      {isSelected ? (
        <View
          pointerEvents="none"
          style={[
            styles.selectedFrame,
            {
              top: -gridLineWidth,
              bottom: -gridLineWidth,
              left: -gridLineWidth,
              right: -gridLineWidth,
            },
          ]}
        />
      ) : null}
      {overflowCount > 0 ? (
        <Text
          style={[styles.overflowBadge, { color: content.contentTextSecondary }]}
          allowFontScaling={false}
          accessibilityLabel={`他${overflowCount}件の予定`}
        >
          +{overflowCount}
        </Text>
      ) : null}
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
        {hasBirthday ? (
          <Ionicons
            name="gift"
            size={10}
            color={BIRTHDAY_ICON_COLOR}
            style={styles.birthdayIcon}
          />
        ) : null}
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
  birthdayMonthDays,
  onPressEpisodeTags,
}: ScheduleGridMonthCalendarProps) {
  const weeks = useMemo(() => buildScheduleGridWeeks(year, month), [month, year]);
  const weekdayLabels = getScheduleGridWeekdayLabels();
  const [cellWidth, setCellWidth] = useState(() => Dimensions.get('window').width / 7);
  const [yearMonthPickerOpen, setYearMonthPickerOpen] = useState(false);
  const [draftYear, setDraftYear] = useState(year);
  const [draftMonth, setDraftMonth] = useState(month);
  const appTheme = useAppThemeOptional();
  const content = useContentColors();
  const outerBorderColor = appTheme?.colors.calendarOuterBorder ?? GRID_BORDER;
  const bottomSeparatorColor = appTheme?.colors.tabBarBorder ?? outerBorderColor;
  const isMonochrome = isMonochromeAppTheme(appTheme?.variant);
  const gridLineColor = content.contentBorder;
  const gridLineWidth = isMonochrome ? 1 : StyleSheet.hairlineWidth;

  useEffect(() => {
    if (!yearMonthPickerOpen) {
      setDraftYear(year);
      setDraftMonth(month);
    }
  }, [month, year, yearMonthPickerOpen]);

  const openYearMonthPicker = useCallback(() => {
    setDraftYear(year);
    setDraftMonth(month);
    setYearMonthPickerOpen(true);
  }, [month, year]);

  const confirmYearMonthPicker = useCallback(() => {
    setYearMonthPickerOpen(false);
    if (draftYear !== year || draftMonth !== month) {
      onMonthChange(draftYear, draftMonth);
    }
  }, [draftMonth, draftYear, month, onMonthChange, year]);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      setCellWidth(width / 7);
    }
  }, []);

  const shiftMonth = useCallback(
    (delta: number) => {
      setYearMonthPickerOpen(false);
      const next = new Date(year, month - 1 + delta, 1);
      onMonthChange(next.getFullYear(), next.getMonth() + 1);
    },
    [month, onMonthChange, year]
  );

  const handleSwipeMonth = useCallback(
    (direction: 'prev' | 'next') => {
      shiftMonth(direction === 'next' ? 1 : -1);
    },
    [shiftMonth]
  );

  const monthSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          'worklet';
          if (event.translationX <= -MONTH_SWIPE_THRESHOLD) {
            runOnJS(handleSwipeMonth)('next');
          } else if (event.translationX >= MONTH_SWIPE_THRESHOLD) {
            runOnJS(handleSwipeMonth)('prev');
          }
        }),
    [handleSwipeMonth]
  );

  return (
    <GestureDetector gesture={monthSwipeGesture}>
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
      <View
        style={[
          styles.header,
          {
            backgroundColor: content.contentCalendarInMonth,
            borderBottomWidth: gridLineWidth,
            borderBottomColor: gridLineColor,
          },
        ]}
      >
        {/* 左右対称: 外側スロット（タグボタン幅）＋内側の月送り */}
        <View style={styles.headerSide}>
          <View style={styles.headerOuterSlot} />
          <Pressable style={styles.navButton} onPress={() => shiftMonth(-1)} hitSlop={8}>
            <Text style={[styles.navButtonText, { color: content.contentText }]}>‹</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.headerTitleButton}
          onPress={openYearMonthPicker}
          accessibilityRole="button"
          accessibilityLabel={`${year}年${month}月。タップで年月を選択`}
        >
          <Text style={[styles.headerTitle, { color: content.contentText }]}>
            {year}年{month}月
          </Text>
        </Pressable>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <Pressable style={styles.navButton} onPress={() => shiftMonth(1)} hitSlop={8}>
            <Text style={[styles.navButtonText, { color: content.contentText }]}>›</Text>
          </Pressable>
          {onPressEpisodeTags ? (
            <Pressable
              style={styles.headerOuterSlot}
              onPress={onPressEpisodeTags}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="予定タグを編集"
            >
              <Ionicons name="pricetags-outline" size={18} color={content.contentText} />
            </Pressable>
          ) : (
            <View style={styles.headerOuterSlot} />
          )}
        </View>
      </View>

      {yearMonthPickerOpen ? (
        <View
          style={[
            styles.yearMonthPicker,
            {
              backgroundColor: content.contentCalendarInMonth,
              borderBottomWidth: gridLineWidth,
              borderBottomColor: gridLineColor,
            },
          ]}
        >
          <YearMonthRollPicker
            year={draftYear}
            month={draftMonth}
            onChange={({ year: nextYear, month: nextMonth }) => {
              setDraftYear(nextYear);
              setDraftMonth(nextMonth);
            }}
          />
          <Pressable
            style={[styles.yearMonthDone, { borderColor: content.contentBorder }]}
            onPress={confirmYearMonthPicker}
            accessibilityRole="button"
            accessibilityLabel="年月選択を完了"
          >
            <Text style={[styles.yearMonthDoneText, { color: content.contentText }]}>完了</Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.weekdayRow,
          {
            backgroundColor: content.contentCalendarInMonth,
            borderBottomWidth: gridLineWidth,
            borderBottomColor: gridLineColor,
          },
        ]}
      >
        {weekdayLabels.map((label, index) => (
          <View
            key={label}
            style={[
              styles.weekdayCell,
              index < 6
                ? { borderRightWidth: gridLineWidth, borderRightColor: gridLineColor }
                : null,
            ]}
          >
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

      <View style={[styles.grid, { backgroundColor: gridLineColor }]} onLayout={handleGridLayout}>
        {weeks.map((week, weekIndex) => (
          <View
            key={`week-${weekIndex}`}
            style={[
              styles.weekRow,
              { backgroundColor: gridLineColor },
              weekIndex < weeks.length - 1
                ? { borderBottomWidth: gridLineWidth, borderBottomColor: gridLineColor }
                : null,
            ]}
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
                gridLineColor={gridLineColor}
                gridLineWidth={gridLineWidth}
                hasBirthday={birthdayMonthDays?.has(day.dateKey.slice(5)) ?? false}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
    </GestureDetector>
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
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  headerSide: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 84,
    gap: 10,
  },
  headerSideRight: {
    justifyContent: 'flex-end',
  },
  headerOuterSlot: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
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
  yearMonthPicker: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 8,
  },
  yearMonthDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  yearMonthDoneText: {
    fontSize: 13,
    fontWeight: '700',
  },
  weekdayRow: {
    flexDirection: 'row',
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
    overflow: 'visible',
  },
  weekRow: {
    flexDirection: 'row',
    overflow: 'visible',
  },
  dayCell: {
    flex: 1,
    height: DAY_CELL_HEIGHT,
    paddingHorizontal: 2,
    paddingTop: ROW_PADDING,
    paddingBottom: ROW_PADDING,
    overflow: 'visible',
  },
  overflowBadge: {
    position: 'absolute',
    top: 1,
    right: 2,
    zIndex: 3,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  /** 格子線の上に重ねるので、上下左右へ線幅ぶんはみ出させる */
  selectedFrame: {
    position: 'absolute',
    borderWidth: SELECTED_RING_WIDTH,
    borderColor: SELECTED_RING,
    zIndex: 4,
  },
  dayCellSelected: {
    zIndex: 6,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: DATE_ROW_HEIGHT,
    paddingHorizontal: 2,
    justifyContent: 'flex-start',
    gap: 2,
    zIndex: 1,
  },
  birthdayIcon: {
    marginTop: 1,
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
