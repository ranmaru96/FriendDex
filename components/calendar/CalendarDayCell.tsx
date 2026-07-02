import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import type { DateData } from 'react-native-calendars';
import type { DayProps } from 'react-native-calendars/src/calendar/day';
import { Theme as AppTheme } from '@/constants/theme';
import type { CalendarDayMarking } from '@/utils/calendarMarking';

type CalendarDayCellProps = DayProps & {
  date?: DateData;
  children?: React.ReactNode;
};

function PeriodBar({
  period,
}: {
  period: CalendarDayMarking['periods'][number];
}) {
  const isSingle = period.startingDay && period.endingDay;
  const isStart = period.startingDay && !period.endingDay;
  const isEnd = period.endingDay && !period.startingDay;

  const barStyles: ViewStyle[] = [styles.periodBar, { backgroundColor: period.color }];
  if (isSingle) {
    barStyles.push(styles.periodSingle);
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
  return <View style={barStyles} />;
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
    return theme?.dayTextColor ?? AppTheme.textPrimary;
  }, [isDisabled, isInactive, isSelected, isToday, theme]);

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

  const periods = dayMark?.periods ?? [];
  const showFooter = dayMark?.showCountLabel === true;

  return (
    <View style={styles.container}>
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
            <PeriodBar
              key={index}
              period={{
                color: period.color,
                startingDay: period.startingDay === true,
                endingDay: period.endingDay === true,
              }}
            />
          ))}
        </View>
      ) : (
        <View style={styles.periodsPlaceholder} />
      )}

      {showFooter && dayMark ? (
        <View style={styles.footer}>
          {dayMark.overflowCount > 0 ? (
            <Text style={styles.footerOverflow} allowFontScaling={false}>
              +{dayMark.overflowCount}
            </Text>
          ) : null}
          <Text style={styles.footerCount} allowFontScaling={false}>
            {dayMark.totalCount}件
          </Text>
        </View>
      ) : (
        <View style={styles.footerPlaceholder} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
    minHeight: 52,
    paddingBottom: 2,
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
    minHeight: 15,
  },
  periodsPlaceholder: {
    minHeight: 15,
    marginTop: 2,
  },
  periodBar: {
    height: 5,
    marginBottom: 2,
  },
  periodSingle: {
    width: '50%',
    marginLeft: '25%',
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
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  periodEnding: {
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    minHeight: 11,
  },
  footerPlaceholder: {
    minHeight: 11,
    marginTop: 1,
  },
  footerOverflow: {
    fontSize: 9,
    fontWeight: '700',
    color: AppTheme.accent,
    marginRight: 3,
  },
  footerCount: {
    fontSize: 9,
    fontWeight: '600',
    color: AppTheme.textSecondary,
  },
});
