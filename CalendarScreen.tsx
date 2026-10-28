import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { detailHref } from '@/utils/detailPaths';
import { deleteEventFormDraft, readEventFormDraft } from '@/utils/eventFormDraft';
import { promptFormDraftRestore } from '@/utils/promptFormDraftRestore';
import { Ionicons } from '@expo/vector-icons';
import { AddCircleButton } from '@/components/AddCircleButton';
import { CalendarDayCell } from '@/components/calendar/CalendarDayCell';
import {
  BIRTHDAY_ICON_COLOR,
  ScheduleGridMonthCalendar,
  TODAY_BADGE_BG,
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
import { listCardBackgroundColor, listCardShadowStyle } from '@/utils/listCardSurface';
import { useContentColors } from '@/utils/useContentColors';
import {
  getAllFriends,
  getAppSetting,
  getEpisodesByEventIds,
  getEventParticipantsForEvents,
  getEventsByDateRange,
  initializeDatabase,
  setAppSetting,
} from './db';
import type { Episode, Event } from './types';
import { buildCalendarMarkedDates } from './utils/calendarMarking';
import {
  buildBirthdayFriendsByMonthDay,
  getBirthdayFriendsForDateKey,
  type BirthdayFriendDisplay,
} from '@/utils/birthdayCalendar';
import { formatNotePreview } from '@/utils/noteBlocks';
import {
  filterEventsByLocalDate,
  formatDateKey,
  formatEventScheduleLabelForCard,
  getMonthRangeIso,
  parseDateKey,
} from './utils/eventHelpers';
import { toEventParticipantDisplays } from './utils/eventParticipantHelpers';
import {
  contentPersonTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import {
  formatScheduleGridSelectedLabel,
  getScheduleGridMonthRangeIso,
} from './utils/scheduleGridCalendar';

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

const CALENDAR_VIEW_MODE_KEY = 'calendar.view_mode';

type CalendarViewMode = 'month' | 'agenda';

type AgendaScrollRequest = {
  id: number;
  kind: 'today' | 'firstEvent' | 'date';
  dateKey?: string;
  /** この読み込み回数の予定が画面に乗ってからスクロールする。0 は初回ロード待ち */
  afterLoadId: number;
};

type AgendaDay = {
  dateKey: string;
  events: Event[];
};

const readCalendarViewMode = (): CalendarViewMode => {
  initializeDatabase();
  return getAppSetting(CALENDAR_VIEW_MODE_KEY) === 'agenda' ? 'agenda' : 'month';
};

const dateKeyInMonth = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const buildAgendaDays = (
  year: number,
  month: number,
  events: Event[],
  birthdayFriendsByMonthDay: Map<string, BirthdayFriendDisplay[]>,
  todayKey: string,
  pinnedDateKey?: string,
): AgendaDay[] => {
  const lastDay = new Date(year, month, 0).getDate();
  const days: AgendaDay[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const dateKey = dateKeyInMonth(year, month, day);
    const dayEvents = filterEventsByLocalDate(events, dateKey);
    const birthdays = getBirthdayFriendsForDateKey(birthdayFriendsByMonthDay, dateKey);
    const pinned = pinnedDateKey === dateKey;
    if (dayEvents.length === 0 && birthdays.length === 0 && dateKey !== todayKey && !pinned) {
      continue;
    }
    days.push({ dateKey, events: dayEvents });
  }
  return days;
};

const resolveAgendaScrollKey = (
  request: AgendaScrollRequest,
  days: AgendaDay[],
  todayKey: string,
): string => {
  if (request.kind === 'date' && request.dateKey) {
    if (days.some((day) => day.dateKey === request.dateKey)) {
      return request.dateKey;
    }
    return days.find((day) => day.dateKey >= request.dateKey)?.dateKey ?? 'top';
  }
  if (request.kind === 'today') {
    return days.some((day) => day.dateKey === todayKey) ? todayKey : 'top';
  }
  return days.find((day) => day.events.length > 0)?.dateKey ?? 'top';
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
  const memoPreview = formatNotePreview(event.memo);
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
      {memoPreview ? (
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
            {memoPreview}
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
  const eventCardFill = listCardBackgroundColor(appTheme?.variant, content.contentCard);
  const eventCardShadow = isOffsetPattern ? null : listCardShadowStyle(appTheme?.variant);
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
  const [viewMode, setViewMode] = useState<CalendarViewMode>(readCalendarViewMode);
  const [agendaScroll, setAgendaScroll] = useState<AgendaScrollRequest | null>(() => {
    if (readCalendarViewMode() !== 'agenda') {
      return null;
    }
    const validRouteDate = /^\d{4}-\d{2}-\d{2}$/.test(routeDate);
    return {
      id: 1,
      kind: validRouteDate ? 'date' : 'today',
      dateKey: validRouteDate ? routeDate : undefined,
      afterLoadId: 0,
    };
  });
  const [eventLoadId, setEventLoadId] = useState(0);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const agendaScrollRef = useRef<ScrollView>(null);
  const agendaOffsetsRef = useRef<Record<string, number>>({});
  const agendaPendingKeyRef = useRef<string | null>(null);
  const eventLoadIdRef = useRef(0);
  const appliedAgendaScrollIdRef = useRef(0);
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
  const { holidays, holidayNameFor, refresh: refreshHolidays } = useJapaneseHolidays();

  const loadMonthEvents = useCallback(
    (year: number, month: number) => {
      eventLoadIdRef.current += 1;
      setEventLoadId(eventLoadIdRef.current);
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
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) {
          return;
        }
        loadMonthEvents(visibleMonth.year, visibleMonth.month);
        setBirthdayFriendsByMonthDay(buildBirthdayFriendsByMonthDay(getAllFriends()));
        refreshHolidays();
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [loadMonthEvents, refreshHolidays, visibleMonth.month, visibleMonth.year])
  );

  const eventDraftPromptLock = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (eventDraftPromptLock.current) {
        return;
      }
      const stored = readEventFormDraft(null);
      if (!stored) {
        return;
      }
      eventDraftPromptLock.current = true;
      const initialDate = stored.fields.initialDate;
      promptFormDraftRestore({
        onRestore: () => {
          eventDraftPromptLock.current = false;
          router.push({
            pathname: '/event',
            params: {
              draft: '1',
              ...(initialDate ? { date: initialDate } : {}),
            },
          });
        },
        onDecline: () => {
          eventDraftPromptLock.current = false;
          deleteEventFormDraft(null);
        },
        onDismiss: () => {
          eventDraftPromptLock.current = false;
        },
      });
    }, [router])
  );

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(routeDate)) {
      return;
    }
    setSelectedDate(routeDate);
    const nextMonth = parseMonthFromDateKey(routeDate);
    setVisibleMonth(nextMonth);
    if (viewModeRef.current === 'agenda') {
      loadMonthEvents(nextMonth.year, nextMonth.month);
      const afterLoadId = eventLoadIdRef.current;
      setAgendaScroll((prev) => ({
        id: (prev?.id ?? 0) + 1,
        kind: 'date',
        dateKey: routeDate,
        afterLoadId,
      }));
    }
  }, [loadMonthEvents, routeDate]);

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
    if (viewModeRef.current === 'agenda') {
      const afterLoadId = eventLoadIdRef.current;
      setAgendaScroll((prev) => ({ id: (prev?.id ?? 0) + 1, kind: 'firstEvent', afterLoadId }));
    }
  };

  const handlePressToday = useCallback(() => {
    setSelectedDate(todayKey);
    const nextMonth = parseMonthFromDateKey(todayKey);
    setVisibleMonth(nextMonth);
    loadMonthEvents(nextMonth.year, nextMonth.month);
    if (viewModeRef.current === 'agenda') {
      const afterLoadId = eventLoadIdRef.current;
      setAgendaScroll((prev) => ({ id: (prev?.id ?? 0) + 1, kind: 'today', afterLoadId }));
    }
  }, [loadMonthEvents, todayKey]);

  const handleCalendarViewChange = useCallback(
    (next: CalendarViewMode) => {
      setViewMode(next);
      initializeDatabase();
      setAppSetting(CALENDAR_VIEW_MODE_KEY, next);
      if (next === 'month') {
        setSelectedDate(todayKey);
        const nextMonth = parseMonthFromDateKey(todayKey);
        setVisibleMonth(nextMonth);
        loadMonthEvents(nextMonth.year, nextMonth.month);
        agendaScrollRef.current?.scrollTo({ y: 0, animated: false });
        return;
      }
      const afterLoadId = eventLoadIdRef.current;
      setAgendaScroll((prev) => ({ id: (prev?.id ?? 0) + 1, kind: 'firstEvent', afterLoadId }));
    },
    [loadMonthEvents, todayKey],
  );

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

  const handleOpenEvent = (eventId: string) => {
    router.push(detailHref('event', 'calendar', { eventId }));
  };

  const handleOpenFriendDetail = (friendId: string) => {
    router.push(detailHref('person', 'calendar', { id: friendId }));
  };

  const dateLabelFor = useCallback(
    (dateKey: string) => {
      const holidayName = holidayNameFor(dateKey);
      if (isScheduleGrid) {
        return formatScheduleGridSelectedLabel(dateKey, holidayName);
      }
      const [year, month, day] = dateKey.split('-').map(Number);
      const base = `${year}年${month}月${day}日`;
      return holidayName ? `${base}（${holidayName}）` : base;
    },
    [holidayNameFor, isScheduleGrid],
  );

  const agendaDays = useMemo(
    () =>
      buildAgendaDays(
        visibleMonth.year,
        visibleMonth.month,
        monthEvents,
        birthdayFriendsByMonthDay,
        todayKey,
        agendaScroll?.kind === 'date' ? agendaScroll.dateKey : undefined,
      ),
    [agendaScroll, birthdayFriendsByMonthDay, monthEvents, todayKey, visibleMonth.month, visibleMonth.year],
  );

  useEffect(() => {
    if (viewMode !== 'agenda' || agendaScroll == null) {
      return;
    }
    if (eventLoadId < Math.max(1, agendaScroll.afterLoadId)) {
      return;
    }
    if (appliedAgendaScrollIdRef.current === agendaScroll.id) {
      return;
    }
    appliedAgendaScrollIdRef.current = agendaScroll.id;
    const key = resolveAgendaScrollKey(agendaScroll, agendaDays, todayKey);
    agendaOffsetsRef.current = {};
    agendaPendingKeyRef.current = key;
    if (key === 'top') {
      agendaScrollRef.current?.scrollTo({ y: 0, animated: false });
      agendaPendingKeyRef.current = null;
    }
  }, [agendaDays, agendaScroll, eventLoadId, todayKey, viewMode]);

  const rememberAgendaOffset = (dateKey: string, y: number) => {
    agendaOffsetsRef.current[dateKey] = y;
    if (agendaPendingKeyRef.current !== dateKey) {
      return;
    }
    agendaScrollRef.current?.scrollTo({ y, animated: false });
    agendaPendingKeyRef.current = null;
  };

  const renderDaySection = (
    dateKey: string,
    events: Event[],
    options: { showAdd: boolean; showEmpty: boolean },
  ) => {
    const birthdays = getBirthdayFriendsForDateKey(birthdayFriendsByMonthDay, dateKey);
    return (
      <View style={[styles.eventArea, isEdgeToEdge || isCompactEventCard ? styles.eventAreaTight : null]}>
        <CompactSectionHeader
          title={dateLabelFor(dateKey)}
          count={events.length}
          variant={isScheduleGrid ? 'compact' : 'classic'}
          edgeToEdge={isEdgeToEdge}
          middle={
            birthdays.length > 0 ? (
              <View style={styles.birthdayRow}>
                <Ionicons name="gift" size={14} color={BIRTHDAY_ICON_COLOR} />
                <ParticipantChipList
                  chips={birthdays.map((friend) => ({
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
            options.showAdd ? (
              <AddCircleButton
                size={28}
                onPress={() => router.push({ pathname: '/event', params: { date: dateKey } })}
                accessibilityLabel="予定を追加"
              />
            ) : null
          }
        />
        {options.showEmpty ? (
          <View style={[styles.eventListEdgeToEdge, styles.roundedEventList]}>
            {isOffsetPattern ? (
              <OffsetCard contentStyle={{ backgroundColor: eventCardFill }}>
                <View style={styles.emptyCardCodex}>
                  <Text style={[styles.emptyTitle, contentTextStyles.title]}>予定はありません</Text>
                  <Text style={[styles.emptyText, contentTextStyles.secondary]}>この日に登録された予定はまだありません。</Text>
                </View>
              </OffsetCard>
            ) : (
              <View
                style={[
                  styles.emptyCard,
                  contentCardSurface,
                  styles.roundedEventCard,
                  { backgroundColor: eventCardFill },
                  eventCardShadow,
                ]}
              >
                <Text style={[styles.emptyTitle, contentTextStyles.title]}>予定はありません</Text>
                <Text style={[styles.emptyText, contentTextStyles.secondary]}>この日に登録された予定はまだありません。</Text>
              </View>
            )}
          </View>
        ) : events.length > 0 ? (
          <View style={[styles.eventListEdgeToEdge, styles.roundedEventList]}>
            {events.map((event) => {
              const participants = participantsByEventId.get(event.id) ?? [];
              const body = (
                <CalendarEventCardBody
                  event={event}
                  participants={participants}
                  episodeCount={(episodesByEventId.get(event.id) ?? []).length}
                  selectedDate={dateKey}
                  metaLayout={eventMetaLayout}
                  isCompactEventCard={isCompactEventCard}
                  memoDisplay={kit.calendarEventMemoDisplay}
                  onOpen={() => handleOpenEvent(event.id)}
                  style={[
                    styles.eventCard,
                    contentCardSurface,
                    { backgroundColor: eventCardFill },
                    isCompactEventCard ? styles.eventCardCompact : null,
                    styles.roundedEventCard,
                    eventCardShadow,
                    isOffsetPattern
                      ? {
                          borderWidth: 0,
                          borderRadius: 0,
                          backgroundColor: 'transparent',
                          shadowOpacity: 0,
                          elevation: 0,
                        }
                      : null,
                  ]}
                />
              );
              return isOffsetPattern ? (
                <OffsetCard key={event.id} contentStyle={{ backgroundColor: eventCardFill }}>
                  {body}
                </OffsetCard>
              ) : (
                <View key={event.id}>{body}</View>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  const scheduleGridCalendar = (headerOnly: boolean) => (
    <ScheduleGridMonthCalendar
      key={headerOnly ? 'schedule-grid-header' : `schedule-grid-${episodeTagStyleEpoch}`}
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
      onPressToday={handlePressToday}
      calendarView={viewMode}
      onCalendarViewChange={handleCalendarViewChange}
      headerOnly={headerOnly}
    />
  );

  const showAgenda = isScheduleGrid && viewMode === 'agenda';

  return (
    <>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
      {showAgenda ? (
        <View style={{ paddingHorizontal: kit.calendarScreenPaddingHorizontal }}>
          {scheduleGridCalendar(true)}
        </View>
      ) : null}
      <ScrollView
        ref={agendaScrollRef}
        style={styles.scrollView}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: kit.calendarScreenPaddingHorizontal },
          flushTop || showAgenda ? styles.scrollContentFlushTop : null,
          isEdgeToEdge ? styles.scrollContentEdgeToEdge : null,
          isCompactEventCard ? styles.scrollContentCompact : null,
        ]}
      >
        {isScheduleGrid ? (
          showAgenda ? null : scheduleGridCalendar(false)
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
                  selectedDayBackgroundColor: content.contentText,
                  selectedDayTextColor: content.contentCard,
                  todayTextColor: content.contentText,
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

        {showAgenda ? (
          <View style={styles.agendaList}>
            <View style={[styles.monthLabel, isEdgeToEdge ? styles.monthLabelEdge : null]}>
              <View style={[styles.monthLabelMark, { backgroundColor: TODAY_BADGE_BG }]} />
              <Text style={[styles.monthLabelText, { color: appTheme?.colors.onScreenText ?? content.contentText }]}>
                {visibleMonth.month}月
              </Text>
            </View>
            {agendaDays.length === 0 ? (
              <View style={[styles.eventListEdgeToEdge, styles.roundedEventList]}>
                {isOffsetPattern ? (
                  <OffsetCard contentStyle={{ backgroundColor: eventCardFill }}>
                    <View style={styles.emptyCardCodex}>
                      <Text style={[styles.emptyTitle, contentTextStyles.title]}>予定はありません</Text>
                      <Text style={[styles.emptyText, contentTextStyles.secondary]}>この月に登録された予定はまだありません。</Text>
                    </View>
                  </OffsetCard>
                ) : (
                  <View
                    style={[
                      styles.emptyCard,
                      contentCardSurface,
                      styles.roundedEventCard,
                      { backgroundColor: eventCardFill },
                      eventCardShadow,
                    ]}
                  >
                    <Text style={[styles.emptyTitle, contentTextStyles.title]}>予定はありません</Text>
                    <Text style={[styles.emptyText, contentTextStyles.secondary]}>この月に登録された予定はまだありません。</Text>
                  </View>
                )}
              </View>
            ) : (
              agendaDays.map((day) => {
                const birthdays = getBirthdayFriendsForDateKey(birthdayFriendsByMonthDay, day.dateKey);
                return (
                  <View
                    key={day.dateKey}
                    collapsable={false}
                    onLayout={(event) => rememberAgendaOffset(day.dateKey, event.nativeEvent.layout.y)}
                  >
                    {renderDaySection(day.dateKey, day.events, {
                      showAdd: false,
                      showEmpty: day.events.length === 0 && birthdays.length === 0,
                    })}
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <GestureDetector gesture={eventAreaSwipeGesture}>
            {renderDaySection(selectedDate, eventsForSelectedDate, {
              showAdd: true,
              showEmpty: eventsForSelectedDate.length === 0,
            })}
          </GestureDetector>
        )}
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
  agendaList: {
    gap: Spacing.md,
  },
  monthLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    paddingHorizontal: 2,
  },
  monthLabelEdge: {
    paddingHorizontal: Spacing.sm,
  },
  monthLabelMark: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  monthLabelText: {
    fontSize: 20,
    fontWeight: '800',
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
