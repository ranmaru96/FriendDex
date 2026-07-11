import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AddCircleButton } from '@/components/AddCircleButton';
import { CalendarDayCell } from '@/components/calendar/CalendarDayCell';
import { ScheduleGridMonthCalendar } from '@/components/calendar/ScheduleGridMonthCalendar';
import { EventParticipantChipList } from '@/components/event/EventParticipantChipList';
import { CompactSectionHeader } from '@/components/ui/CompactSectionHeader';
import { EdgePanelList } from '@/components/ui/EdgePanelList';
import { MetaTitleRow, type MetaTitleRowLayout } from '@/components/ui/MetaTitleRow';
import { HomeCardElevation, Radius, Spacing, Theme } from '@/constants/theme';
import type { CalendarEventMemoDisplay, CalendarEventTimeDisplay } from '@/constants/uiKit/types';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { getEventParticipantsForEvents, getEventsByDateRange, initializeDatabase } from '../db';
import type { Event } from '../types';
import { buildCalendarMarkedDates } from '../utils/calendarMarking';
import {
  filterEventsByLocalDate,
  formatDateKey,
  formatEventScheduleLabelForCard,
  getMonthRangeIso,
} from '../utils/eventHelpers';
import { toEventParticipantDisplays } from '../utils/eventParticipantHelpers';
import {
  formatScheduleGridSelectedLabel,
  getScheduleGridMonthRangeIso,
} from '../utils/scheduleGridCalendar';

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

const getCalendarMemoLineLimit = (display: CalendarEventMemoDisplay): number | undefined => {
  if (display === 'oneLine') {
    return 1;
  }
  if (display === 'twoLines') {
    return 2;
  }
  return undefined;
};

const toMetaTitleRowLayout = (
  timeDisplay: CalendarEventTimeDisplay,
  stacked: boolean
): MetaTitleRowLayout => {
  if (stacked) {
    return 'stacked';
  }
  return timeDisplay;
};

export default function CalendarScreen() {
  const kit = useUiKit();
  const isCompactEventCard = kit.calendarEventMemoDisplay === 'oneLine';
  const isScheduleGrid = kit.calendarMonthLayout === 'scheduleGrid';
  const isEdgeToEdge = kit.calendarScreenPaddingHorizontal === 0;
  const isColumnPanelList =
    isEdgeToEdge && isScheduleGrid && kit.calendarEventTimeDisplay === 'column';
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

  const loadMonthEvents = useCallback(
    (year: number, month: number) => {
      initializeDatabase();
      const { rangeStartAt, rangeEndAt } = isScheduleGrid
        ? getScheduleGridMonthRangeIso(year, month)
        : getMonthRangeIso(year, month);
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
    },
    [isScheduleGrid]
  );

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
    () => buildCalendarMarkedDates(monthEvents, selectedDate),
    [monthEvents, selectedDate]
  );

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const handleScheduleGridDayPress = (dateKey: string) => {
    setSelectedDate(dateKey);
    const { year, month } = parseMonthFromDateKey(dateKey);
    if (year !== visibleMonth.year || month !== visibleMonth.month) {
      setVisibleMonth({ year, month });
      loadMonthEvents(year, month);
    }
  };

  const handleMonthChange = (month: DateData) => {
    setVisibleMonth({ year: month.year, month: month.month });
    loadMonthEvents(month.year, month.month);
  };

  const handleScheduleGridMonthChange = (year: number, month: number) => {
    setVisibleMonth({ year, month });
    loadMonthEvents(year, month);
  };

  const handleCreateEvent = () => {
    router.push({ pathname: '/event', params: { date: selectedDate } });
  };

  const handleOpenEvent = (eventId: string) => {
    router.push({ pathname: '/event', params: { eventId } });
  };

  const selectedDateLabel = useMemo(() => {
    if (isScheduleGrid) {
      return formatScheduleGridSelectedLabel(selectedDate);
    }
    const [year, month, day] = selectedDate.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  }, [isScheduleGrid, selectedDate]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: kit.calendarScreenPaddingHorizontal },
          isEdgeToEdge ? styles.scrollContentEdgeToEdge : null,
          isCompactEventCard ? styles.scrollContentCompact : null,
        ]}
      >
        {isScheduleGrid ? (
          <ScheduleGridMonthCalendar
            year={visibleMonth.year}
            month={visibleMonth.month}
            selectedDate={selectedDate}
            todayKey={todayKey}
            events={monthEvents}
            onDayPress={handleScheduleGridDayPress}
            onMonthChange={handleScheduleGridMonthChange}
            edgeToEdge={isEdgeToEdge}
          />
        ) : (
          <View style={[styles.calendarShadow, isEdgeToEdge ? styles.calendarShadowEdgeToEdge : null]}>
            <View style={[styles.calendarCard, isEdgeToEdge ? styles.calendarCardEdgeToEdge : null]}>
              <Calendar
                current={selectedDate}
                onDayPress={handleDayPress}
                onMonthChange={handleMonthChange}
                markedDates={markedDates}
                dayComponent={CalendarDayCell}
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
        )}

        <CompactSectionHeader
          title={selectedDateLabel}
          count={eventsForSelectedDate.length}
          variant={isScheduleGrid ? 'compact' : 'classic'}
          edgeToEdge={isEdgeToEdge}
        />

        {eventsForSelectedDate.length === 0 ? (
          <View style={[styles.eventShadow, isEdgeToEdge ? styles.eventShadowEdgeToEdge : null]}>
            <View style={[styles.emptyCard, isEdgeToEdge ? styles.eventCardEdgeToEdge : null]}>
              <Text style={styles.emptyTitle}>予定はありません</Text>
              <Text style={styles.emptyText}>この日に登録された予定はまだありません。</Text>
            </View>
          </View>
        ) : isColumnPanelList ? (
          <EdgePanelList>
            {eventsForSelectedDate.map((event) => {
              const participants = participantsByEventId.get(event.id) ?? [];
              return (
                <Pressable
                  key={event.id}
                  style={[
                    styles.eventCard,
                    isCompactEventCard ? styles.eventCardCompact : null,
                    styles.eventCardPanelItem,
                  ]}
                  onPress={() => handleOpenEvent(event.id)}
                >
                  <MetaTitleRow
                    meta={formatEventScheduleLabelForCard(event, selectedDate)}
                    title={event.title}
                    layout={toMetaTitleRowLayout(kit.calendarEventTimeDisplay, false)}
                  />
                  {participants.length > 0 ? (
                    <EventParticipantChipList
                      participants={participants}
                      compact
                      chipBackgroundColor={kit.calendarParticipantChipBackground}
                      chipStyle={kit.calendarParticipantChipStyle}
                      layout="scroll"
                    />
                  ) : null}
                  {event.memo ? (
                    <Text
                      style={[styles.eventMemo, isCompactEventCard ? styles.eventMemoCompact : null]}
                      numberOfLines={getCalendarMemoLineLimit(kit.calendarEventMemoDisplay)}
                      ellipsizeMode={
                        getCalendarMemoLineLimit(kit.calendarEventMemoDisplay) ? 'tail' : undefined
                      }
                    >
                      {event.memo}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </EdgePanelList>
        ) : (
          <View style={isEdgeToEdge ? styles.eventListEdgeToEdge : undefined}>
            {eventsForSelectedDate.map((event) => {
            const participants = participantsByEventId.get(event.id) ?? [];
            return (
              <View
                key={event.id}
                style={[styles.eventShadow, isEdgeToEdge ? styles.eventShadowEdgeToEdge : null]}
              >
                <Pressable
                  style={[
                    styles.eventCard,
                    isCompactEventCard ? styles.eventCardCompact : null,
                    isEdgeToEdge ? styles.eventCardEdgeToEdge : null,
                  ]}
                  onPress={() => handleOpenEvent(event.id)}
                >
                  <MetaTitleRow
                    meta={formatEventScheduleLabelForCard(event, selectedDate)}
                    title={event.title}
                    layout={toMetaTitleRowLayout(
                      kit.calendarEventTimeDisplay,
                      !isScheduleGrid
                    )}
                  />
                  {participants.length > 0 ? (
                    <EventParticipantChipList
                      participants={participants}
                      compact
                      chipBackgroundColor={kit.calendarParticipantChipBackground}
                      chipStyle={kit.calendarParticipantChipStyle}
                      layout={isScheduleGrid ? 'scroll' : undefined}
                    />
                  ) : null}
                  {event.memo ? (
                    <Text
                      style={[styles.eventMemo, isCompactEventCard ? styles.eventMemoCompact : null]}
                      numberOfLines={getCalendarMemoLineLimit(kit.calendarEventMemoDisplay)}
                      ellipsizeMode={
                        getCalendarMemoLineLimit(kit.calendarEventMemoDisplay) ? 'tail' : undefined
                      }
                    >
                      {event.memo}
                    </Text>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
          </View>
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
    paddingTop: Spacing.sm,
    paddingBottom: 100,
    gap: Spacing.md,
  },
  scrollContentCompact: {
    gap: Spacing.sm,
  },
  scrollContentEdgeToEdge: {
    paddingTop: 0,
    gap: Spacing.sm,
  },
  calendarShadow: {
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    ...HomeCardElevation,
  },
  calendarShadowEdgeToEdge: {
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  calendarCard: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Theme.card,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  calendarCardEdgeToEdge: {
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  calendar: {
    borderRadius: Radius.md,
  },
  eventListEdgeToEdge: {
    gap: 0,
  },
  eventCardPanelItem: {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: Theme.card,
  },
  eventShadow: {
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    ...HomeCardElevation,
  },
  eventShadowEdgeToEdge: {
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  eventCard: {
    backgroundColor: Theme.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  eventCardEdgeToEdge: {
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomWidth: Math.max(1, StyleSheet.hairlineWidth * 2),
    borderBottomColor: Theme.textSecondary,
  },
  eventCardCompact: {
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  eventMemo: {
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  eventMemoCompact: {
    lineHeight: 16,
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
