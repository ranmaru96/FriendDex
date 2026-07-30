import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
import type {
  CalendarEventCardStyle,
  CalendarEventMemoDisplay,
  CalendarEventTimeDisplay,
} from '@/constants/uiKit/types';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useContentColors } from '@/utils/useContentColors';
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

type CalendarEventCardBodyProps = {
  event: Event;
  participants: ReturnType<typeof toEventParticipantDisplays>;
  selectedDate: string;
  metaLayout: MetaTitleRowLayout;
  isCompactEventCard: boolean;
  memoDisplay: CalendarEventMemoDisplay;
  onOpen: () => void;
  style?: StyleProp<ViewStyle>;
};

const isRoundedCalendarEventCardStyle = (
  style: CalendarEventCardStyle,
  isMonochrome: boolean
): boolean => isMonochrome && style === 'roundedCards';

function CalendarEventCardBody({
  event,
  participants,
  selectedDate,
  metaLayout,
  isCompactEventCard,
  memoDisplay,
  onOpen,
  style,
}: CalendarEventCardBodyProps) {
  const content = useContentColors();
  const memoLineLimit = getCalendarMemoLineLimit(memoDisplay);

  return (
    <View style={style}>
      <Pressable onPress={onOpen}>
        <MetaTitleRow
          meta={formatEventScheduleLabelForCard(event, selectedDate)}
          title={event.title}
          layout={metaLayout}
        />
      </Pressable>
      {participants.length > 0 ? (
        <View style={styles.eventCardParticipantRow}>
          <EventParticipantChipList
            participants={participants}
            compact
            layout="scroll"
          />
        </View>
      ) : null}
      {event.memo ? (
        <Pressable onPress={onOpen}>
          <Text
            style={[
              styles.eventMemo,
              { color: content.contentTextSecondary },
              isCompactEventCard ? styles.eventMemoCompact : null,
            ]}
            numberOfLines={memoLineLimit}
            ellipsizeMode={memoLineLimit ? 'tail' : undefined}
          >
            {event.memo}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function CalendarScreen() {
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const isMonochrome = isMonochromeAppTheme(appTheme?.variant);
  const content = useContentColors();
  const flushTop = isMonochrome;
  const whiteCalendarSeparator = appTheme?.colors.tabBarBorder ?? Theme.border;
  const roundedEventCards = isRoundedCalendarEventCardStyle(
    kit.calendarEventCardStyle,
    isMonochrome
  );
  const isCompactEventCard = kit.calendarEventMemoDisplay === 'oneLine';
  const isScheduleGrid = kit.calendarMonthLayout === 'scheduleGrid';
  const isEdgeToEdge = kit.calendarScreenPaddingHorizontal === 0;
  const isColumnPanelList =
    isEdgeToEdge && isScheduleGrid && kit.calendarEventTimeDisplay === 'column';
  const useBadgeInsetEventCards =
    kit.calendarEventTimeDisplay === 'badge' && kit.calendarEventListPaddingHorizontal > 0;
  const useRoundedCardEventList = roundedEventCards && !useBadgeInsetEventCards;
  const roundedEventCardElevation = {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  };
  const contentCardSurface = {
    backgroundColor: content.contentCard,
    borderColor: content.contentBorder,
  };
  const contentTextStyles = {
    title: { color: content.contentText },
    secondary: { color: content.contentTextSecondary },
  };
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: kit.calendarScreenPaddingHorizontal },
          flushTop ? styles.scrollContentFlushTop : null,
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
            <View
              style={[
                styles.calendarCard,
                contentCardSurface,
                flushTop ? { borderBottomWidth: 1.5, borderBottomColor: whiteCalendarSeparator } : null,
                isEdgeToEdge ? styles.calendarCardEdgeToEdge : null,
                flushTop ? styles.calendarCardFlushTop : null,
              ]}
            >
              <Calendar
                current={selectedDate}
                onDayPress={handleDayPress}
                onMonthChange={handleMonthChange}
                markedDates={markedDates}
                dayComponent={CalendarDayCell}
                theme={{
                  backgroundColor: content.contentCard,
                  calendarBackground: content.contentCard,
                  textSectionTitleColor: content.contentText,
                  selectedDayBackgroundColor: Theme.accent,
                  selectedDayTextColor: Theme.onAccent,
                  todayTextColor: Theme.accent,
                  dayTextColor: content.contentText,
                  textDisabledColor: content.contentTextSecondary,
                  arrowColor: content.contentText,
                  monthTextColor: content.contentText,
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

        {useBadgeInsetEventCards ? (
          <View style={{ paddingHorizontal: kit.calendarEventListPaddingHorizontal }}>
            <CompactSectionHeader
              title={selectedDateLabel}
              count={eventsForSelectedDate.length}
              variant={isScheduleGrid ? 'compact' : 'classic'}
            />
            {eventsForSelectedDate.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  contentCardSurface,
                  { borderRadius: kit.calendarEventCardBorderRadius },
                ]}
              >
                <Text style={[styles.emptyTitle, contentTextStyles.title]}>予定はありません</Text>
                <Text style={[styles.emptyText, contentTextStyles.secondary]}>この日に登録された予定はまだありません。</Text>
              </View>
            ) : (
              <View style={{ gap: kit.calendarEventCardGap }}>
                {eventsForSelectedDate.map((event) => {
                  const participants = participantsByEventId.get(event.id) ?? [];
                  return (
                    <CalendarEventCardBody
                      key={event.id}
                      event={event}
                      participants={participants}
                      selectedDate={selectedDate}
                      metaLayout="column"
                      isCompactEventCard={isCompactEventCard}
                      memoDisplay={kit.calendarEventMemoDisplay}
                      onOpen={() => handleOpenEvent(event.id)}
                      style={[
                        styles.eventCard,
                        contentCardSurface,
                        isCompactEventCard ? styles.eventCardCompact : null,
                        { borderRadius: kit.calendarEventCardBorderRadius },
                      ]}
                    />
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <>
            <CompactSectionHeader
              title={selectedDateLabel}
              count={eventsForSelectedDate.length}
              variant={isScheduleGrid ? 'compact' : 'classic'}
              edgeToEdge={isEdgeToEdge}
            />

            {eventsForSelectedDate.length === 0 ? (
              <View style={[styles.eventShadow, isEdgeToEdge ? styles.eventShadowEdgeToEdge : null]}>
                <View style={[styles.emptyCard, contentCardSurface, isEdgeToEdge ? styles.eventCardEdgeToEdge : null]}>
                  <Text style={[styles.emptyTitle, contentTextStyles.title]}>予定はありません</Text>
                  <Text style={[styles.emptyText, contentTextStyles.secondary]}>この日に登録された予定はまだありません。</Text>
                </View>
              </View>
            ) : isColumnPanelList && !useRoundedCardEventList ? (
          <EdgePanelList>
            {eventsForSelectedDate.map((event) => {
              const participants = participantsByEventId.get(event.id) ?? [];
              return (
                <CalendarEventCardBody
                  key={event.id}
                  event={event}
                  participants={participants}
                  selectedDate={selectedDate}
                  metaLayout={toMetaTitleRowLayout(kit.calendarEventTimeDisplay, false)}
                  isCompactEventCard={isCompactEventCard}
                  memoDisplay={kit.calendarEventMemoDisplay}
                  onOpen={() => handleOpenEvent(event.id)}
                  style={[
                    styles.eventCard,
                    contentCardSurface,
                    isCompactEventCard ? styles.eventCardCompact : null,
                    styles.eventCardPanelItem,
                  ]}
                />
              );
            })}
          </EdgePanelList>
        ) : (
          <View
            style={[
              isEdgeToEdge ? styles.eventListEdgeToEdge : undefined,
              useRoundedCardEventList ? styles.roundedEventList : undefined,
            ]}
          >
            {eventsForSelectedDate.map((event) => {
            const participants = participantsByEventId.get(event.id) ?? [];
            return (
              <View
                key={event.id}
                style={[
                  styles.eventShadow,
                  isEdgeToEdge && !useRoundedCardEventList ? styles.eventShadowEdgeToEdge : null,
                  useRoundedCardEventList ? roundedEventCardElevation : null,
                ]}
              >
                <CalendarEventCardBody
                  event={event}
                  participants={participants}
                  selectedDate={selectedDate}
                  metaLayout={toMetaTitleRowLayout(
                    kit.calendarEventTimeDisplay,
                    !isScheduleGrid
                  )}
                  isCompactEventCard={isCompactEventCard}
                  memoDisplay={kit.calendarEventMemoDisplay}
                  onOpen={() => handleOpenEvent(event.id)}
                  style={[
                    styles.eventCard,
                    contentCardSurface,
                    isCompactEventCard ? styles.eventCardCompact : null,
                    isEdgeToEdge && !useRoundedCardEventList ? styles.eventCardEdgeToEdge : null,
                    useRoundedCardEventList ? styles.roundedEventCard : null,
                  ]}
                />
              </View>
            );
          })}
          </View>
        )}
          </>
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
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    paddingBottom: 100,
    gap: Spacing.md,
  },
  scrollContentFlushTop: {
    paddingTop: 0,
  },
  scrollContentCompact: {
    gap: Spacing.sm,
  },
  scrollContentEdgeToEdge: {
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
  calendarCardFlushTop: {
    borderTopWidth: 0,
    borderBottomWidth: 0,
  },
  calendar: {
    borderRadius: Radius.md,
  },
  eventListEdgeToEdge: {
    gap: 0,
  },
  roundedEventList: {
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
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
  roundedEventCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  eventCardCompact: {
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  eventCardParticipantRow: {
    alignSelf: 'stretch',
    minWidth: 0,
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
