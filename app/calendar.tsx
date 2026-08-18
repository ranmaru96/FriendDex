import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AddCircleButton } from '@/components/AddCircleButton';
import { CalendarDayCell } from '@/components/calendar/CalendarDayCell';
import {
  BIRTHDAY_ICON_COLOR,
  ScheduleGridMonthCalendar,
} from '@/components/calendar/ScheduleGridMonthCalendar';
import { EpisodeTagsModal } from '@/components/episode/EpisodeTagsModal';
import { EventParticipantChipList } from '@/components/event/EventParticipantChipList';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { OffsetCard } from '@/components/ui/OffsetCard';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { CompactSectionHeader } from '@/components/ui/CompactSectionHeader';
import { MetaTitleRow, type MetaTitleRowLayout } from '@/components/ui/MetaTitleRow';
import { HomeCardElevation, Radius, Spacing, Theme } from '@/constants/theme';
import type { CalendarEventMemoDisplay } from '@/constants/uiKit/types';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useJapaneseHolidays } from '@/hooks/useJapaneseHolidays';
import { useTapUnlessHorizontalScroll } from '@/hooks/useTapUnlessHorizontalScroll';
import { useContentColors } from '@/utils/useContentColors';
import {
  getAllFriends,
  getEpisodesByEventIds,
  getEventParticipantsForEvents,
  getEventsByDateRange,
  initializeDatabase,
} from '../db';
import type { Episode, Event } from '../types';
import { buildCalendarMarkedDates } from '../utils/calendarMarking';
import {
  buildBirthdayFriendsByMonthDay,
  getBirthdayFriendsForDateKey,
  type BirthdayFriendDisplay,
} from '@/utils/birthdayCalendar';
import {
  filterEventsByLocalDate,
  formatDateKey,
  formatEventScheduleLabelForCard,
  getMonthRangeIso,
  parseDateKey,
} from '../utils/eventHelpers';
import { toEventParticipantDisplays } from '../utils/eventParticipantHelpers';
import {
  contentPersonTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
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

type CalendarEventCardBodyProps = {
  event: Event;
  participants: ReturnType<typeof toEventParticipantDisplays>;
  episodeCount: number;
  selectedDate: string;
  metaLayout: MetaTitleRowLayout;
  isCompactEventCard: boolean;
  memoDisplay: CalendarEventMemoDisplay;
  onOpen: () => void;
  style?: StyleProp<ViewStyle>;
};

function CalendarEventCardBody({
  event,
  participants,
  episodeCount,
  selectedDate,
  metaLayout,
  isCompactEventCard,
  memoDisplay,
  onOpen,
  style,
}: CalendarEventCardBodyProps) {
  const content = useContentColors();
  const memoLineLimit = getCalendarMemoLineLimit(memoDisplay);
  const participantTap = useTapUnlessHorizontalScroll(onOpen);

  const episodeCountTag =
    episodeCount > 0 ? (
      <View style={[styles.episodeCountTag, contentPersonTagStyle(content)]}>
        <Text style={[styles.episodeCountTagText, contentTextStyle(content)]}>
          {episodeCount} eps
        </Text>
      </View>
    ) : null;

  return (
    <View style={style}>
      <Pressable onPress={onOpen}>
        <MetaTitleRow
          meta={formatEventScheduleLabelForCard(event, selectedDate)}
          title={event.title}
          layout={metaLayout}
          titleTrailing={episodeCountTag}
        />
      </Pressable>
      {participants.length > 0 ? (
        <Pressable
          style={styles.eventCardParticipantRow}
          onPress={participantTap.onPress}
        >
          <EventParticipantChipList
            participants={participants}
            compact
            layout="scroll"
            onChipPress={participantTap.onChipPress}
            onScrollBeginDrag={participantTap.onScrollBeginDrag}
            onScrollEndDrag={participantTap.onScrollEndDrag}
            onMomentumScrollEnd={participantTap.onMomentumScrollEnd}
          />
        </Pressable>
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
  const isOffsetPattern = usesOffsetChrome(appTheme?.patternId);
  const isMonochrome = isMonochromeAppTheme(appTheme?.variant);
  const content = useContentColors();
  const flushTop = isMonochrome;
  const whiteCalendarSeparator = appTheme?.colors.tabBarBorder ?? Theme.border;
  const isCompactEventCard = kit.calendarEventMemoDisplay === 'oneLine';
  const isScheduleGrid = kit.calendarMonthLayout === 'scheduleGrid';
  const isEdgeToEdge = kit.calendarScreenPaddingHorizontal === 0;
  const eventMetaLayout: MetaTitleRowLayout = isScheduleGrid ? 'column' : 'stacked';
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
  const [episodesByEventId, setEpisodesByEventId] = useState<Map<string, Episode[]>>(new Map());
  const [birthdayFriendsByMonthDay, setBirthdayFriendsByMonthDay] = useState<
    Map<string, BirthdayFriendDisplay[]>
  >(new Map());
  const [episodeTagsModalVisible, setEpisodeTagsModalVisible] = useState(false);
  /** 予定タグの色・名称変更をカレンダー表示へ即時反映するためのカウンタ */
  const [episodeTagStyleEpoch, setEpisodeTagStyleEpoch] = useState(0);

  const birthdayMonthDays = useMemo(
    () => new Set(birthdayFriendsByMonthDay.keys()),
    [birthdayFriendsByMonthDay]
  );
  const birthdayFriendsForSelectedDate = useMemo(
    () => getBirthdayFriendsForDateKey(birthdayFriendsByMonthDay, selectedDate),
    [birthdayFriendsByMonthDay, selectedDate]
  );
  const { holidays, holidayNameFor, refresh: refreshHolidays } = useJapaneseHolidays();

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
      setEpisodesByEventId(getEpisodesByEventIds(events.map((event) => event.id)));
    },
    [isScheduleGrid]
  );

  const refreshCalendarAfterEpisodeTagChange = useCallback(() => {
    loadMonthEvents(visibleMonth.year, visibleMonth.month);
    setEpisodeTagStyleEpoch((n) => n + 1);
  }, [loadMonthEvents, visibleMonth.month, visibleMonth.year]);

  useFocusEffect(
    useCallback(() => {
      loadMonthEvents(visibleMonth.year, visibleMonth.month);
      setBirthdayFriendsByMonthDay(buildBirthdayFriendsByMonthDay(getAllFriends()));
      refreshHolidays();
    }, [loadMonthEvents, refreshHolidays, visibleMonth.month, visibleMonth.year])
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
    () => buildCalendarMarkedDates(monthEvents, selectedDate, holidays, visibleMonth),
    // episodeTagStyleEpoch: 色だけ変えたときも帯色を取り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthEvents, selectedDate, episodeTagStyleEpoch, holidays, visibleMonth]
  );

  const handleDayPress = (day: DateData) => {
    setSelectedDate(day.dateString);
  };

  const handleScheduleGridDayPress = (dateKey: string) => {
    setSelectedDate(dateKey);
  };

  const handleMonthChange = (month: DateData) => {
    setVisibleMonth({ year: month.year, month: month.month });
    loadMonthEvents(month.year, month.month);
  };

  const handleScheduleGridMonthChange = (year: number, month: number) => {
    setVisibleMonth({ year, month });
    loadMonthEvents(year, month);
  };

  const shiftVisibleMonth = useCallback(
    (delta: number) => {
      const next = new Date(visibleMonth.year, visibleMonth.month - 1 + delta, 1);
      const year = next.getFullYear();
      const month = next.getMonth() + 1;
      setVisibleMonth({ year, month });
      loadMonthEvents(year, month);
    },
    [loadMonthEvents, visibleMonth.month, visibleMonth.year]
  );

  const handleClassicCalendarSwipe = useCallback(
    (direction: 'prev' | 'next') => {
      shiftVisibleMonth(direction === 'next' ? 1 : -1);
    },
    [shiftVisibleMonth]
  );

  const classicCalendarSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          'worklet';
          if (event.translationX <= -48) {
            runOnJS(handleClassicCalendarSwipe)('next');
          } else if (event.translationX >= 48) {
            runOnJS(handleClassicCalendarSwipe)('prev');
          }
        }),
    [handleClassicCalendarSwipe]
  );

  const shiftSelectedDate = useCallback(
    (delta: number) => {
      const next = parseDateKey(selectedDate);
      next.setDate(next.getDate() + delta);
      const nextKey = formatDateKey(next);
      setSelectedDate(nextKey);
      const { year, month } = parseMonthFromDateKey(nextKey);
      if (year !== visibleMonth.year || month !== visibleMonth.month) {
        setVisibleMonth({ year, month });
        loadMonthEvents(year, month);
      }
    },
    [loadMonthEvents, selectedDate, visibleMonth.month, visibleMonth.year]
  );

  const handleEventAreaSwipe = useCallback(
    (direction: 'prev' | 'next') => {
      shiftSelectedDate(direction === 'next' ? 1 : -1);
    },
    [shiftSelectedDate]
  );

  const eventAreaSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          'worklet';
          if (event.translationX <= -48) {
            runOnJS(handleEventAreaSwipe)('next');
          } else if (event.translationX >= 48) {
            runOnJS(handleEventAreaSwipe)('prev');
          }
        }),
    [handleEventAreaSwipe]
  );

  const classicCalendarCurrent = useMemo(
    () =>
      `${visibleMonth.year}-${String(visibleMonth.month).padStart(2, '0')}-01`,
    [visibleMonth.month, visibleMonth.year]
  );

  const handleCreateEvent = () => {
    router.push({ pathname: '/event', params: { date: selectedDate } });
  };

  const handleOpenEvent = (eventId: string) => {
    router.push({ pathname: '/event', params: { eventId } });
  };

  const handleOpenFriendDetail = (friendId: string) => {
    router.push({ pathname: '/detail', params: { id: friendId } });
  };

  const selectedDateLabel = useMemo(() => {
    const holidayName = holidayNameFor(selectedDate);
    if (isScheduleGrid) {
      return formatScheduleGridSelectedLabel(selectedDate, holidayName);
    }
    const [year, month, day] = selectedDate.split('-').map(Number);
    const base = `${year}年${month}月${day}日`;
    return holidayName ? `${base}（${holidayName}）` : base;
  }, [holidayNameFor, isScheduleGrid, selectedDate]);

  return (
    <>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      <ScrollView
        style={styles.scrollView}
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
            key={`schedule-grid-${episodeTagStyleEpoch}`}
            year={visibleMonth.year}
            month={visibleMonth.month}
            selectedDate={selectedDate}
            todayKey={todayKey}
            events={monthEvents}
            onDayPress={handleScheduleGridDayPress}
            onMonthChange={handleScheduleGridMonthChange}
            edgeToEdge={isEdgeToEdge}
            birthdayMonthDays={birthdayMonthDays}
            holidays={holidays}
            onPressEpisodeTags={() => setEpisodeTagsModalVisible(true)}
          />
        ) : (
          <GestureDetector gesture={classicCalendarSwipeGesture}>
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
                key={classicCalendarCurrent}
                current={classicCalendarCurrent}
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
          </GestureDetector>
        )}

        <GestureDetector gesture={eventAreaSwipeGesture}>
          <View
            style={[
              styles.eventArea,
              isEdgeToEdge || isCompactEventCard ? styles.eventAreaTight : null,
            ]}
          >
            <CompactSectionHeader
              title={selectedDateLabel}
              count={eventsForSelectedDate.length}
              variant={isScheduleGrid ? 'compact' : 'classic'}
              edgeToEdge={isEdgeToEdge}
              middle={
                birthdayFriendsForSelectedDate.length > 0 ? (
                  <View style={styles.birthdayRow}>
                    <Ionicons name="gift" size={14} color={BIRTHDAY_ICON_COLOR} />
                    <ParticipantChipList
                      chips={birthdayFriendsForSelectedDate.map((friend) => ({
                        id: `birthday-${friend.friendId}`,
                        kind: 'individual' as const,
                        label: friend.name,
                        friendId: friend.friendId,
                        photoUri: friend.photoUri,
                      }))}
                      compact
                      layout="scroll"
                      onPressProfile={handleOpenFriendDetail}
                    />
                  </View>
                ) : null
              }
              right={
                <AddCircleButton
                  size={28}
                  onPress={handleCreateEvent}
                  accessibilityLabel="予定を追加"
                />
              }
            />

            {eventsForSelectedDate.length === 0 ? (
              <View style={[styles.eventListEdgeToEdge, styles.roundedEventList]}>
                {isOffsetPattern ? (
                  <OffsetCard>
                    <View style={styles.emptyCardCodex}>
                      <Text style={[styles.emptyTitle, contentTextStyles.title]}>予定はありません</Text>
                      <Text style={[styles.emptyText, contentTextStyles.secondary]}>この日に登録された予定はまだありません。</Text>
                    </View>
                  </OffsetCard>
                ) : (
                  <View style={[styles.eventShadow, roundedEventCardElevation]}>
                    <View
                      style={[
                        styles.emptyCard,
                        contentCardSurface,
                        styles.roundedEventCard,
                      ]}
                    >
                      <Text style={[styles.emptyTitle, contentTextStyles.title]}>予定はありません</Text>
                      <Text style={[styles.emptyText, contentTextStyles.secondary]}>この日に登録された予定はまだありません。</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.eventListEdgeToEdge, styles.roundedEventList]}>
                {eventsForSelectedDate.map((event) => {
                  const participants = participantsByEventId.get(event.id) ?? [];
                  const body = (
                    <CalendarEventCardBody
                      event={event}
                      participants={participants}
                      episodeCount={(episodesByEventId.get(event.id) ?? []).length}
                      selectedDate={selectedDate}
                      metaLayout={eventMetaLayout}
                      isCompactEventCard={isCompactEventCard}
                      memoDisplay={kit.calendarEventMemoDisplay}
                      onOpen={() => handleOpenEvent(event.id)}
                      style={[
                        styles.eventCard,
                        contentCardSurface,
                        isCompactEventCard ? styles.eventCardCompact : null,
                        styles.roundedEventCard,
                        isOffsetPattern
                          ? { borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent' }
                          : null,
                      ]}
                    />
                  );
                  return isOffsetPattern ? (
                    <OffsetCard key={event.id}>{body}</OffsetCard>
                  ) : (
                    <View key={event.id} style={[styles.eventShadow, roundedEventCardElevation]}>
                      {body}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </GestureDetector>
      </ScrollView>
    </SafeAreaView>
    <EpisodeTagsModal
      visible={episodeTagsModalVisible}
      onClose={() => {
        setEpisodeTagsModalVisible(false);
        refreshCalendarAfterEpisodeTagChange();
      }}
      onTagsChanged={refreshCalendarAfterEpisodeTagChange}
    />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
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
  eventArea: {
    flex: 1,
    gap: Spacing.md,
  },
  eventAreaTight: {
    gap: Spacing.sm,
  },
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  episodeCountTag: {
    flexShrink: 0,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  episodeCountTagText: {
    fontSize: 11,
    fontWeight: '700',
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
  emptyCardCodex: {
    padding: Spacing.md,
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
});
