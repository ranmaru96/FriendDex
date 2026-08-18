import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import type { DateData } from 'react-native-calendars';
import type { DayProps } from 'react-native-calendars/src/calendar/day';
import { Theme as AppTheme } from '@/constants/theme';
import type { CalendarDayMarking, CalendarPeriodMark } from '@/utils/calendarMarking';
import { JAPANESE_HOLIDAY_TEXT_COLOR } from '@/utils/japaneseHolidays';

type CalendarDayCellProps = DayProps & {
  date?: DateData;
  children?: React.ReactNode;
};

function PeriodBar({ period }: { period: CalendarPeriodMark }) {
  const isSingle = period.startingDay && period.endingDay;
  const isStart = period.startingDay && !period.endingDay;
  const isEnd = period.endingDay && !period.startingDay;

  const barStyles: ViewStyle[] = [styles.periodBar, { backgroundColor: period.color }];

  if (isSingle) {
    barStyles.push(styles.periodMiddle);
  } else if (isStart) {
    barStyles.push(styles.periodStart);
  } else if (isEnd) {
    barStyles.push(styles.periodEnd);
  } else {
    barStyles.push(styles.periodMiddle);
  }

  if (period.startingDay) {
    barStyles.push(styles.periodStarting);
  }
  if (period.endingDay) {
    barStyles.push(styles.periodEnding);
  }

  return (
    <View style={barStyles}>
      {period.showTitle ? (
        <Text style={styles.periodTitle} numberOfLines={1} allowFontScaling={false}>
          {period.title}
        </Text>
      ) : null}
    </View>
  );
}

function toDayMarking(marking: DayProps['marking']): CalendarDayMarking | undefined {
  if (!marking || !('totalCount' in marking)) {
    return undefined;
  }
  return marking as CalendarDayMarking;
}

export const CalendarDayCell = React.memo(function CalendarDayCell({
  date,
  state,
  marking,
  onPress,
  children,
  theme,
  disableAllTouchEventsForDisabledDays,
  disableAllTouchEventsForInactiveDays,
}: CalendarDayCellProps) {
  const dayMark = toDayMarking(marking);
  const isSelected = dayMark?.selected === true || state === 'selected';
  const isDisabled = state === 'disabled';
  const isInactive = state === 'inactive';
  const isToday = state === 'today';

  const textColor = useMemo(() => {
    if (isSelected) {
      return theme?.selectedDayTextColor ?? AppTheme.onAccent;
    }
    if (isDisabled) {
      return theme?.textDisabledColor ?? AppTheme.textSecondary;
    }
    if (isInactive) {
      return theme?.textInactiveColor ?? AppTheme.textSecondary;
    }
    if (isToday) {
      return theme?.todayTextColor ?? AppTheme.accent;
    }
    if (dayMark?.isHoliday) {
      return JAPANESE_HOLIDAY_TEXT_COLOR;
    }
    return theme?.dayTextColor ?? AppTheme.textPrimary;
  }, [dayMark?.isHoliday, isDisabled, isInactive, isSelected, isToday, theme]);

  const dayCircleStyle = useMemo(() => {
    const circle: ViewStyle[] = [styles.dayCircle];
    if (isSelected) {
      circle.push({
        backgroundColor:
          dayMark?.selectedColor ?? theme?.selectedDayBackgroundColor ?? AppTheme.accent,
      });
    } else if (isToday) {
      circle.push({
        backgroundColor: theme?.todayBackgroundColor ?? 'transparent',
      });
    }
    return circle;
  }, [dayMark?.selectedColor, isSelected, isToday, theme]);

  const shouldDisableTouch =
    (disableAllTouchEventsForDisabledDays && isDisabled) ||
    (disableAllTouchEventsForInactiveDays && isInactive);

  const handlePress = useCallback(() => {
    if (!shouldDisableTouch) {
      onPress?.(date);
    }
  }, [date, onPress, shouldDisableTouch]);

  const periods: CalendarPeriodMark[] = dayMark?.periods ?? [];
  const overflowCount = dayMark?.overflowCount ?? 0;

  return (
    <View style={styles.container}>
      {overflowCount > 0 ? (
        <Text
          style={styles.overflowBadge}
          allowFontScaling={false}
          accessibilityLabel={`他${overflowCount}件の予定`}
        >
          +{overflowCount}
        </Text>
      ) : null}
      <TouchableOpacity
        style={dayCircleStyle}
        activeOpacity={0.7}
        disabled={shouldDisableTouch}
        onPress={handlePress}
        accessibilityRole="button"
      >
        <Text style={[styles.dayText, { color: textColor }]} allowFontScaling={false}>
          {children}
        </Text>
      </TouchableOpacity>

      {periods.length > 0 ? (
        <View style={styles.periods}>
          {periods.map((period, index) => (
            <PeriodBar key={`${period.title}-${index}`} period={period} />
          ))}
        </View>
      ) : (
        <View style={styles.periodsPlaceholder} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
    minHeight: 92,
    paddingBottom: 2,
    position: 'relative',
  },
  overflowBadge: {
    position: 'absolute',
    top: 0,
    right: 1,
    zIndex: 2,
    fontSize: 9,
    fontWeight: '700',
    color: AppTheme.textSecondary,
    lineHeight: 11,
  },
  dayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
  },
  periods: {
    alignSelf: 'stretch',
    marginTop: 2,
    minHeight: 54,
  },
  periodsPlaceholder: {
    minHeight: 54,
    marginTop: 2,
  },
  periodBar: {
    height: 16,
    marginBottom: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  periodTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
    paddingHorizontal: 4,
  },
  periodStart: {
    width: '75%',
    marginLeft: '25%',
  },
  periodMiddle: {
    width: '100%',
    marginLeft: 0,
  },
  periodEnd: {
    width: '75%',
    marginLeft: 0,
  },
  periodStarting: {
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  periodEnding: {
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
});
