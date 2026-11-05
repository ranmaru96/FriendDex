import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { DetailMenuSheet } from '@/components/screen/DetailMenuSheet';
import { detailHrefFromPathname } from '@/utils/detailPaths';
import {
  deleteEventFormDraft,
  eventDraftBaseMatches,
  readEventFormDraft,
  savedEventBaselineBody,
} from '@/utils/eventFormDraft';
import { promptFormDraftRestore } from '@/utils/promptFormDraftRestore';
import { Ionicons } from '@expo/vector-icons';
import { EpisodeListCard, episodeDetailTopBarButtonStyles } from '@/components/episode/EpisodeListCard';
import { EpisodeTagChip } from '@/components/episode/EpisodeTagChip';
import { EventParticipantMemoList } from '@/components/event/EventParticipantMemoList';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { PanelSection, SectionDivider } from '@/components/ui/Panel';
import { NoteBlockView } from '@/components/ui/NoteBlockView';
import { Radius } from '@/constants/theme';
import { useBottomNavScrollClearance } from '@/hooks/useBottomNavScrollClearance';
import {
  deleteEvent,
  deleteTasksByIds,
  getDefaultProfile,
  getEpisodeListPhotoUrisMap,
  getEpisodesByEventId,
  getEvent,
  getEventParticipants,
  getMyself,
  getTasksByEventId,
  initializeDatabase,
  unlinkTasksFromEvent,
} from './db';
import type { Episode, EpisodeParticipant, Event, Friend, ProfileMemo, Task } from './types';
import { buildParticipantChipDisplays, buildParticipantChips } from './utils/episodeHelpers';
import { buildFriendPhotoById } from '@/utils/friendPhoto';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import {
  formatDateKey,
  formatEventScheduleLabel,
  formatTimeFromDate,
  getAllDayDateKeysFromEvent,
  isEventStartInFuture,
} from './utils/eventHelpers';
import { profileIdsToFriendIds } from './utils/eventParticipantHelpers';
import {
  NOTIFY_TIMING_OPTIONS,
  inferNotifyTimingPreset,
} from './utils/eventNotifyTiming';
import { formatTaskDueDateLabel } from '@/utils/taskHelpers';
import { formatNotePreview, noteBlocksHaveContent } from '@/utils/noteBlocks';
import { eventHrefMatch } from '@/utils/detailRouteMemory';
import { leaveForgottenDetail, popCurrentTabScreen } from '@/utils/tabNavigation';
import { cancelEventNotification } from '@/utils/eventNotifications';
import {
  holdGoogleCalendarDelete,
  releaseGoogleCalendarDelete,
  scheduleGoogleCalendarDelete,
} from '@/utils/googleCalendarSync';
import { markOwnedEventDeleted } from '@/lib/ownedEventSync';
import { eventLinkedMemos, eventMemoDateRange, memoTargetFriendIds } from '@/utils/eventParticipantMemos';
import {
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const parseRouteParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};

const buildFriendNameById = (friendList: Friend[]): Map<string, string> =>
  new Map(friendList.map((friend) => [friend.id, friend.name]));

const eventLastDateKey = (event: Event): string => {
  if (event.allDay) {
    return getAllDayDateKeysFromEvent(event).endDateKey;
  }
  return formatDateKey(new Date(event.endAt ?? event.startAt));
};

/** 終了時刻を過ぎていれば true。終了が無い予定は開始時刻を過ぎたとき */
const eventEndHasPassed = (event: Event | null): boolean => {
  if (!event) {
    return false;
  }
  const endSource = event.endAt ?? event.startAt;
  const end = new Date(endSource);
  if (Number.isNaN(end.getTime())) {
    return false;
  }
  return Date.now() > end.getTime();
};

export default function EventDetailScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const content = useContentColors();
  const bottomNavClearance = useBottomNavScrollClearance();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const eventId = parseRouteParam(params.eventId);
  const missingPoppedRef = useRef('');

  const [event, setEvent] = useState<Event | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [participantEntries, setParticipantEntries] = useState<EpisodeParticipant[]>([]);
  const [linkedEpisodes, setLinkedEpisodes] = useState<Episode[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
  const [episodePhotoUrisById, setEpisodePhotoUrisById] = useState<Map<string, string[]>>(
    () => new Map()
  );

  const loadData = useCallback(() => {
    initializeDatabase();
    const id = eventId.trim();
    if (!id) {
      setEvent(null);
      return;
    }
    const loaded = getEvent(id);
    if (!loaded) {
      setEvent(null);
      if (id && missingPoppedRef.current !== id) {
        missingPoppedRef.current = id;
        leaveForgottenDetail(eventHrefMatch(id));
      }
      return;
    }
    missingPoppedRef.current = '';
    const currentMyselfId = getMyself();
    const nextFriends = getAllFriendsInDefaultOrder();
    setEvent(loaded);
    setMyselfId(currentMyselfId);
    setFriends(nextFriends);
    const excludeProfileId = currentMyselfId ? getDefaultProfile(currentMyselfId)?.id ?? null : null;
    const participantIds = getEventParticipants(id).map((participant) => participant.profileId);
    const profileIds = excludeProfileId
      ? participantIds.filter((profileId) => profileId !== excludeProfileId)
      : participantIds;
    setParticipantEntries(
      profileIdsToFriendIds(profileIds)
        .filter((friendId) => friendId !== currentMyselfId)
        .map((friendId) => ({ kind: 'individual' as const, value: friendId }))
    );
    const episodes = getEpisodesByEventId(id);
    setLinkedEpisodes(episodes);
    setEpisodePhotoUrisById(getEpisodeListPhotoUrisMap(episodes.map((episode) => episode.id)));
    setLinkedTasks(getTasksByEventId(id));
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const eventEditDraftPromptLock = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const id = eventId.trim();
      if (!id || eventEditDraftPromptLock.current) {
        return;
      }
      const loadedBody = savedEventBaselineBody(id);
      const stored = readEventFormDraft(id);
      if (!loadedBody || !stored) {
        return;
      }
      if (!eventDraftBaseMatches(stored.base, loadedBody)) {
        deleteEventFormDraft(id);
        return;
      }
      eventEditDraftPromptLock.current = true;
      promptFormDraftRestore({
        onRestore: () => {
          eventEditDraftPromptLock.current = false;
          router.push({ pathname: '/event', params: { eventId: id, draft: '1' } });
        },
        onDecline: () => {
          eventEditDraftPromptLock.current = false;
          deleteEventFormDraft(id);
        },
        onDismiss: () => {
          eventEditDraftPromptLock.current = false;
        },
      });
    }, [eventId, router])
  );

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);
  const participantChips = useMemo(
    () =>
      buildParticipantChipDisplays(participantEntries, friendNameById, {
        excludeFriendIds: myselfId ? [myselfId] : [],
        friendPhotoById,
      }),
    [friendNameById, friendPhotoById, myselfId, participantEntries]
  );

  const participantMemoPeople = useMemo(() => {
    if (!event) {
      return [];
    }
    const people: {
      friendId: string;
      name: string;
      photoUri: string | null;
      memos: ProfileMemo[];
    }[] = [];
    for (const friendId of memoTargetFriendIds(participantEntries, myselfId)) {
      const friend = friends.find((item) => item.id === friendId);
      const memos = eventLinkedMemos(friend?.notes ?? [], event.id);
      if (memos.length === 0) {
        continue;
      }
      people.push({
        friendId,
        name: friendNameById.get(friendId) ?? friend?.name ?? '',
        photoUri: friendPhotoById.get(friendId) ?? null,
        memos,
      });
    }
    return people;
  }, [event, friendNameById, friendPhotoById, friends, myselfId, participantEntries]);

  const participantMemoDateRange = useMemo(() => {
    if (!event) {
      return eventMemoDateRange('', '');
    }
    if (event.allDay) {
      const keys = getAllDayDateKeysFromEvent(event);
      return eventMemoDateRange(keys.startDateKey, keys.endDateKey);
    }
    const start = formatDateKey(new Date(event.startAt));
    const end = event.endAt ? formatDateKey(new Date(event.endAt)) : start;
    return eventMemoDateRange(start, end);
  }, [event]);

  const notifyLabel = useMemo(() => {
    if (!event) {
      return '';
    }
    if (!event.notifyEnabled) {
      return 'オフ';
    }
    const timingInput = event.allDay
      ? {
          startDateKey: getAllDayDateKeysFromEvent(event).startDateKey,
          startTime: '00:00',
          allDay: true as const,
        }
      : {
          startDateKey: formatDateKey(new Date(event.startAt)),
          startTime: formatTimeFromDate(new Date(event.startAt)),
          allDay: false as const,
        };
    const preset = inferNotifyTimingPreset(event.notifyAt, timingInput);
    return NOTIFY_TIMING_OPTIONS.find((option) => option.value === preset)?.label ?? 'オン';
  }, [event]);

  const hasMemo = Boolean(event && noteBlocksHaveContent(event.memo));
  const tagLabel = event?.episodeTag?.trim() ?? '';
  const showNotification = Boolean(event?.notifyEnabled) && !eventEndHasPassed(event);

  const todayKey = formatDateKey(new Date());
  const canAddEpisode = event != null && !isEventStartInFuture(event, todayKey);
  const deleteLockRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [taskMigrateVisible, setTaskMigrateVisible] = useState(false);
  const [taskMigrateTasks, setTaskMigrateTasks] = useState<Task[]>([]);
  const [taskMigrateIds, setTaskMigrateIds] = useState<Set<string>>(new Set());

  const performEventDelete = useCallback(async () => {
    const id = eventId.trim();
    if (!id || deleteLockRef.current) {
      return;
    }
    deleteLockRef.current = true;
    initializeDatabase();
    const existing = getEvent(id);
    await cancelEventNotification(existing?.notificationId);
    const googleEventId = existing?.googleEventId ?? null;
    holdGoogleCalendarDelete(googleEventId);
    const ok = deleteEvent(id);
    if (!ok) {
      releaseGoogleCalendarDelete(googleEventId);
      deleteLockRef.current = false;
      Alert.alert('エラー', '予定の削除に失敗しました。');
      return;
    }
    scheduleGoogleCalendarDelete(googleEventId);
    void markOwnedEventDeleted(id);
    deleteEventFormDraft(id);
    leaveForgottenDetail(eventHrefMatch(id));
  }, [eventId]);

  const confirmTaskMigrateAndDeleteEvent = () => {
    const allIds = taskMigrateTasks.map((task) => task.id);
    const deleteIds = allIds.filter((id) => !taskMigrateIds.has(id));
    unlinkTasksFromEvent([...taskMigrateIds]);
    if (deleteIds.length > 0) {
      deleteTasksByIds(deleteIds);
    }
    setTaskMigrateVisible(false);
    void performEventDelete();
  };

  const handleDelete = () => {
    const id = eventId.trim();
    if (!id || deleteLockRef.current) {
      return;
    }
    Alert.alert('予定を削除', 'この予定を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          initializeDatabase();
          const tasks = getTasksByEventId(id);
          if (tasks.length === 0) {
            void performEventDelete();
            return;
          }
          Alert.alert(
            '紐づきタスク',
            `この予定に紐づくタスクが${tasks.length}件あります。タスクも削除しますか？`,
            [
              { text: 'キャンセル', style: 'cancel' },
              {
                text: 'タスクも削除',
                style: 'destructive',
                onPress: () => {
                  deleteTasksByIds(tasks.map((task) => task.id));
                  void performEventDelete();
                },
              },
              {
                text: '選んで残す',
                onPress: () => {
                  setTaskMigrateIds(new Set(tasks.map((task) => task.id)));
                  setTaskMigrateTasks(tasks);
                  setTaskMigrateVisible(true);
                },
              },
            ]
          );
        },
      },
    ]);
  };
  const canAddTask = event != null && eventLastDateKey(event) >= todayKey;

  return (
    <SubToolScreenTemplate
      title="予定"
      onBack={() => popCurrentTabScreen()}
      titleFramed={false}
      useScreenPadding={false}
      right={
        event ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="メニュー"
            hitSlop={8}
            style={styles.menuButton}
          >
            <View style={styles.menuMark}>
              <View style={[styles.menuLine, styles.menuLineLong, { backgroundColor: content.contentText }]} />
              <View style={[styles.menuLine, styles.menuLineShort, { backgroundColor: content.contentText }]} />
            </View>
          </Pressable>
        ) : null
      }
      scrollContentStyle={[
        styles.scrollContent,
        bottomNavClearance > 0 ? { paddingBottom: bottomNavClearance } : null,
      ]}
    >
      {!event ? (
        <View style={styles.missingContainer}>
          <Text style={[styles.missingText, contentMutedTextStyle(content)]}>
            予定が見つかりませんでした。
          </Text>
        </View>
      ) : (
        <>
          <PanelSection style={styles.headerSection}>
            <View style={styles.iconRow} accessibilityLabel="タイトル">
              <View style={[styles.mark, styles.markText]}>
                <Ionicons name="calendar-outline" size={18} color={content.contentTextSecondary} />
              </View>
              <View style={styles.titleRow}>
                <View style={[styles.titleUnderline, { borderBottomColor: content.contentText }]}>
                  <Text style={[styles.title, contentTextStyle(content)]}>{event.title.trim() || '無題'}</Text>
                </View>
                {tagLabel ? <EpisodeTagChip label={tagLabel} style={styles.titleTag} /> : null}
                <Pressable
                  style={[
                    episodeDetailTopBarButtonStyles.button,
                    styles.titleEditButton,
                    { borderColor: content.contentBorder },
                  ]}
                  onPress={() => router.push({ pathname: '/event', params: { eventId: event.id } })}
                  accessibilityLabel="編集"
                  hitSlop={8}
                >
                  <Ionicons name="pencil-outline" size={14} color={content.contentText} />
                </Pressable>
              </View>
            </View>
            <View style={[styles.iconRow, styles.iconRowCenter]} accessibilityLabel="日時">
              <View style={styles.mark}>
                <Ionicons name="time-outline" size={18} color={content.contentTextSecondary} />
              </View>
              <Text style={[styles.dateLine, contentTextStyle(content)]}>
                {formatEventScheduleLabel(event)}
              </Text>
            </View>
            {participantChips.length > 0 ? (
              <View style={styles.iconRow} accessibilityLabel="会う人">
                <View style={[styles.mark, styles.markChips]}>
                  <Ionicons name="people-outline" size={18} color={content.contentTextSecondary} />
                </View>
                <View style={styles.iconBody}>
                  <ParticipantChipList
                    chips={participantChips}
                    layout="wrap"
                    onPressProfile={(friendId) =>
                      router.push(detailHrefFromPathname('person', pathname, { id: friendId }))
                    }
                  />
                </View>
              </View>
            ) : null}
          </PanelSection>

          {hasMemo ? (
            <>
              <SectionDivider />
              <PanelSection style={styles.section}>
                <View style={styles.iconRow} accessibilityLabel="メモ">
                  <View style={[styles.mark, styles.markText]}>
                    <Ionicons name="document-text-outline" size={18} color={content.contentTextSecondary} />
                  </View>
                  <View style={styles.iconBody}>
                    <NoteBlockView
                      value={event.memo ?? ''}
                      textStyle={[styles.memoText, contentTextStyle(content)]}
                    />
                  </View>
                </View>
              </PanelSection>
            </>
          ) : null}

          {showNotification ? (
            <>
              <SectionDivider />
              <PanelSection style={styles.section}>
                <View style={[styles.iconRow, styles.iconRowCenter]} accessibilityLabel="通知">
                  <View style={styles.mark}>
                    <Ionicons name="notifications-outline" size={18} color={content.contentTextSecondary} />
                  </View>
                  <Text style={[styles.iconText, contentTextStyle(content)]}>{notifyLabel}</Text>
                </View>
              </PanelSection>
            </>
          ) : null}

          <SectionDivider />
          <PanelSection style={styles.section}>
            <View style={styles.iconRow} accessibilityLabel="タスク">
              <View style={[styles.mark, styles.markText]}>
                <Ionicons name="checkbox-outline" size={18} color={content.contentTextSecondary} />
              </View>
              <View style={styles.iconBody}>
                {linkedTasks.length > 0 ? (
                  linkedTasks.map((task) => (
                    <Pressable
                      key={task.id}
                      style={[styles.taskRow, contentSurfaceStyle(content), { borderColor: content.contentBorder }]}
                      onPress={() =>
                        router.push(detailHrefFromPathname('task', pathname, { taskId: task.id }))
                      }
                      accessibilityRole="button"
                      accessibilityLabel={task.title || 'タスク'}
                    >
                      <Text style={[styles.taskTitle, contentTextStyle(content)]}>{task.title || '無題'}</Text>
                      <Text style={[styles.taskMeta, contentMutedTextStyle(content)]}>
                        {task.completedAt
                          ? '完了'
                          : task.dueDate
                            ? `期限 ${formatTaskDueDateLabel(task.dueDate)}`
                            : '期限なし'}
                        {task.memo?.trim() ? ` · ${formatNotePreview(task.memo)}` : ''}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={[styles.iconText, contentMutedTextStyle(content)]}>タスクはありません</Text>
                )}
              </View>
              {canAddTask ? (
                <Pressable
                  style={styles.sectionAdd}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="タスクを追加"
                  onPress={() => router.push({ pathname: '/task-edit', params: { eventId: event.id } })}
                >
                  <Ionicons name="add" size={18} color={content.contentTextSecondary} />
                </Pressable>
              ) : null}
            </View>
          </PanelSection>

          <SectionDivider />
          <PanelSection style={styles.section}>
            <View style={styles.iconRow} accessibilityLabel="登録済みエピソード">
              <View style={[styles.mark, linkedEpisodes.length > 0 ? styles.markText : null]}>
                <Ionicons name="book-outline" size={18} color={content.contentTextSecondary} />
              </View>
              {linkedEpisodes.length > 0 ? (
                <View style={styles.iconBody}>
                  {linkedEpisodes.map((episode) => (
                    <EpisodeListCard
                      key={episode.id}
                      title={episode.title}
                      date={episode.date}
                      episodeTag={episode.tag}
                      chips={buildParticipantChips(episode, friendNameById, {
                        friendPhotoById,
                        excludeFriendIds: myselfId ? [myselfId] : [],
                      })}
                      visibilityMode={episode.visibilityMode}
                      photoUris={episodePhotoUrisById.get(episode.id)}
                      unfilled={episode.pendingReview === true}
                      onPress={() => {
                        const ownerId = episode.authorFriendId.trim() || myselfId || '';
                        if (!ownerId) {
                          return;
                        }
                        router.push(
                          detailHrefFromPathname('episode', pathname, {
                            episodeId: episode.id,
                            ownerId,
                          })
                        );
                      }}
                    />
                  ))}
                </View>
              ) : (
                <Text style={[styles.iconText, contentMutedTextStyle(content)]}>
                  登録済みのエピソードはありません
                </Text>
              )}
              {canAddEpisode ? (
                <Pressable
                  style={styles.sectionAdd}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="エピソードを追加"
                  onPress={() =>
                    router.push({ pathname: '/event-episode', params: { eventId: event.id } })
                  }
                >
                  <Ionicons name="add" size={18} color={content.contentTextSecondary} />
                </Pressable>
              ) : null}
            </View>
          </PanelSection>

          <SectionDivider />
          <PanelSection style={styles.section}>
            <View style={styles.iconRow} accessibilityLabel="参加者のメモ">
              <View style={[styles.mark, styles.markText]}>
                <Ionicons name="chatbox-ellipses-outline" size={18} color={content.contentTextSecondary} />
              </View>
              <View style={styles.iconBody}>
                {participantMemoPeople.length > 0 ? (
                  <EventParticipantMemoList
                    people={participantMemoPeople}
                    dateRange={participantMemoDateRange}
                    readOnly
                  />
                ) : (
                  <Text style={[styles.iconText, contentMutedTextStyle(content)]}>
                    人物メモはありません
                  </Text>
                )}
              </View>
              <Pressable
                style={styles.sectionAdd}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="参加者のメモを追加"
                onPress={() =>
                  router.push({ pathname: '/event', params: { eventId: event.id, section: 'memos' } })
                }
              >
                <Ionicons name="add" size={18} color={content.contentTextSecondary} />
              </Pressable>
            </View>
          </PanelSection>
        </>
      )}
      <DetailMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onEdit={() => {
          if (!event) {
            return;
          }
          router.push({ pathname: '/event', params: { eventId: event.id } });
        }}
        onDelete={handleDelete}
      />
      <Modal
        visible={taskMigrateVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTaskMigrateVisible(false)}
      >
        <Pressable
          style={styles.migrateBackdrop}
          onPress={() => setTaskMigrateVisible(false)}
        >
          <Pressable
            style={[styles.migrateCard, contentSurfaceStyle(content)]}
            onPress={(pressEvent) => pressEvent.stopPropagation()}
          >
            <Text style={[styles.migrateTitle, contentTextStyle(content)]}>残すタスクを選択</Text>
            <Text style={[styles.migrateHint, contentMutedTextStyle(content)]}>
              選択したタスクは予定なしの臨時へ移します。未選択は削除されます。
            </Text>
            <ScrollView style={styles.migrateOptions}>
              {taskMigrateTasks.map((task) => {
                const selected = taskMigrateIds.has(task.id);
                return (
                  <Pressable
                    key={task.id}
                    style={[
                      styles.migrateOption,
                      selected ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => {
                      setTaskMigrateIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(task.id)) {
                          next.delete(task.id);
                        } else {
                          next.add(task.id);
                        }
                        return next;
                      });
                    }}
                  >
                    <Text style={contentTextStyle(content)}>
                      {selected ? '✓ ' : ''}
                      {task.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={[styles.migrateConfirm, contentTagStyle(content)]}
              onPress={confirmTaskMigrateAndDeleteEvent}
            >
              <Text style={[styles.migrateConfirmText, contentTextStyle(content)]}>
                実行して予定を削除
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SubToolScreenTemplate>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  missingContainer: {
    paddingHorizontal: 12,
    paddingTop: 24,
  },
  missingText: {
    fontSize: 15,
    textAlign: 'center',
  },
  headerSection: {
    paddingTop: 14,
    paddingBottom: 12,
    gap: 8,
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleUnderline: {
    flexShrink: 1,
    minWidth: 0,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  titleTag: {
    flexShrink: 0,
    marginTop: 1,
  },
  titleEditButton: {
    marginLeft: 'auto',
    width: 22,
    height: 22,
    backgroundColor: 'transparent',
  },
  sectionAdd: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    width: 44,
    height: 44,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuMark: {
    width: 20,
    alignItems: 'flex-start',
  },
  menuLine: {
    height: 2,
    borderRadius: 1,
  },
  menuLineLong: {
    width: 20,
  },
  menuLineShort: {
    width: 14,
    marginTop: 8,
  },
  migrateBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  migrateCard: {
    borderRadius: Radius.md,
    padding: 14,
    maxHeight: '70%',
    borderWidth: 1,
  },
  migrateTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  migrateHint: {
    fontSize: 14,
    marginBottom: 10,
  },
  migrateOptions: {
    marginBottom: 10,
  },
  migrateOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  migrateConfirm: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
  },
  migrateConfirmText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dateLine: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconRowCenter: {
    alignItems: 'center',
  },
  mark: {
    width: 22,
    alignItems: 'center',
  },
  markChips: {
    marginTop: 8,
  },
  markText: {
    marginTop: 2,
  },
  iconBody: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  iconText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
  },
  memoText: {
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    paddingVertical: 12,
  },
  taskRow: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  taskMeta: {
    fontSize: 12,
  },
});
