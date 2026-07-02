import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AddCircleButton } from '@/components/AddCircleButton';
import { CalendarDayCell } from '@/components/calendar/CalendarDayCell';
import { EventParticipantChipList } from '@/components/event/EventParticipantChipList';
import { HomeCardElevation, Radius, ScreenHorizontalInset, Spacing, Theme } from '@/constants/theme';
import { getEventParticipantsForEvents, getEventsByDateRange, initializeDatabase } from '../db';
import type { Event } from '../types';
import {
  filterEventsByLocalDate,
  formatDateKey,
  formatEventScheduleLabel,
  getMonthRangeIso,
} from '../utils/eventHelpers';
import { buildCalendarMarkedDates } from '../utils/calendarMarking';
import { toEventParticipantDisplays } from '../utils/eventParticipantHelpers';

LocaleConfig.locales.ja = {
  monthNames: [
    '1月',
    '2月',
    '3月',
    '4月',
    '5月',
    '6月',
    '7月',
    '8月',
    '9月',
    '10月',
    '11月',
    '12月',
  ],
  monthNamesShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  dayNames: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  dayNamesShort: ['日', '月', '火', '水', '木', '金', '土'],
  today: '今日',
};
LocaleConfig.defaultLocale = 'ja';

const parseMonthFromDateKey = (dateKey: string): { year: number; month: number } => {
  const [year, month] = dateKey.split('-').map(Number);
  return { year, month };
};

export default function CalendarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const routeDate = typeof params.date === 'string' ? params.date.trim() : '';
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(routeDate) ? routeDate : todayKey
  );
  const [visibleMonth, setVisibleMonth] = useState(() =>
    parseMonthFromDateKey(/^\d{4}-\d{2}-\d{2}$/.test(routeDate) ? routeDate : todayKey)
  );
  const [monthEvents, setMonthEvents] = useState<Event[]>([]);
  const [participantsByEventId, setParticipantsByEventId] = useState<
    Map<string, ReturnType<typeof toEventParticipantDisplays>>
  >(new Map());

  const loadMonthEvents = useCallback((year: number, month: number) => {
    initializeDatabase();
    const { rangeStartAt, rangeEndAt } = getMonthRangeIso(year, month);
    const events = getEventsByDateRange(rangeStartAt, rangeEndAt);
    const participantMap = getEventParticipantsForEvents(events.map((event) => event.id));
    const displayMap = new Map<string, ReturnType<typeof toEventParticipantDisplays>>();
    participantMap.forEach((participants, eventId) => {
      displayMap.set(
        eventId,
        toEventParticipantDisplays(participants.map((participant) => participant.profileId))
      );
    });
    setMonthEvents(events);
    setParticipantsByEventId(displayMap);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMonthEvents(visibleMonth.year, visibleMonth.month);
    }, [loadMonthEvents, visibleMonth.month, visibleMonth.year])
  );

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(routeDate)) {
      return;
    }
    setSelectedDate(routeDate);
    setVisibleMonth(parseMonthFromDateKey(routeDate));
  }, [routeDate]);

  const eventsForSelectedDate = useMemo(
    () => filterEventsByLocalDate(monthEvents, selectedDate),
    [monthEvents, selectedDate]
  );

  const markedDates = useMemo(
    () => buildCalendarMarkedDates(monthEvents, selectedDate, Theme.accent),
    [monthEvents, selectedDate]
  );

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const handleMonthChange = (month: DateData) => {
    setVisibleMonth({ year: month.year, month: month.month });
    loadMonthEvents(month.year, month.month);
  };

  const handleCreateEvent = () => {
    router.push({ pathname: '/event', params: { date: selectedDate } });
  };

  const handleOpenEvent = (eventId: string) => {
    router.push({ pathname: '/event', params: { eventId } });
  };

  const selectedDateLabel = useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  }, [selectedDate]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.screenTitle}>カレンダー</Text>
        <Text style={styles.screenSubtitle}>予定やエピソードを日付で確認できます</Text>

        <View style={styles.calendarShadow}>
          <View style={styles.calendarCard}>
            <Calendar
              current={selectedDate}
              onDayPress={handleDayPress}
              onMonthChange={handleMonthChange}
              markedDates={markedDates}
              dayComponent={CalendarDayCell}
              enableSwipeMonths
              theme={{
                backgroundColor: Theme.card,
                calendarBackground: Theme.card,
                textSectionTitleColor: Theme.textPrimary,
                selectedDayBackgroundColor: Theme.accent,
                selectedDayTextColor: Theme.onAccent,
                todayTextColor: Theme.accent,
                dayTextColor: Theme.textPrimary,
                textDisabledColor: Theme.textSecondary,
                arrowColor: Theme.textPrimary,
                monthTextColor: Theme.textPrimary,
                textDayFontWeight: '500',
                textMonthFontWeight: '700',
                textDayHeaderFontWeight: '600',
                weekVerticalMargin: 2,
              }}
              style={styles.calendar}
            />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{selectedDateLabel}</Text>
          <Text style={styles.sectionCount}>{eventsForSelectedDate.length}件</Text>
        </View>

        {eventsForSelectedDate.length === 0 ? (
          <View style={styles.eventShadow}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>予定はありません</Text>
              <Text style={styles.emptyText}>この日に登録された予定はまだありません。</Text>
            </View>
          </View>
        ) : (
          eventsForSelectedDate.map((event) => {
            const participants = participantsByEventId.get(event.id) ?? [];
            return (
            <View key={event.id} style={styles.eventShadow}>
              <Pressable style={styles.eventCard} onPress={() => handleOpenEvent(event.id)}>
                <View style={styles.eventTimeBadge}>
                  <Text style={styles.eventTimeText}>{formatEventScheduleLabel(event)}</Text>
                </View>
                <Text style={styles.eventTitle}>{event.title}</Text>
                {participants.length > 0 ? (
                  <EventParticipantChipList participants={participants} compact />
                ) : null}
                {event.memo ? <Text style={styles.eventMemo}>{event.memo}</Text> : null}
              </Pressable>
            </View>
            );
          })
        )}
      </ScrollView>

      <AddCircleButton
        style={styles.fab}
        onPress={handleCreateEvent}
        accessibilityLabel="予定を追加"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.screenBase,
  },
  scrollContent: {
    paddingHorizontal: ScreenHorizontalInset,
    paddingTop: Spacing.sm,
    paddingBottom: 100,
    gap: Spacing.md,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Theme.card,
  },
  screenSubtitle: {
    fontSize: 13,
    color: Theme.textSecondary,
    marginBottom: Spacing.xs,
  },
  calendarShadow: {
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    ...HomeCardElevation,
  },
  calendarCard: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Theme.card,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  calendar: {
    borderRadius: Radius.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.card,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textSecondary,
  },
  eventShadow: {
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    ...HomeCardElevation,
  },
  eventCard: {
    backgroundColor: Theme.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  eventTimeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Theme.accentLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  eventTimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.accent,
    flexShrink: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  eventMemo: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: Theme.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  emptyText: {
    fontSize: 13,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 18,
  },
});
