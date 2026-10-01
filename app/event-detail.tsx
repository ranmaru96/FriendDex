import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EpisodeListCard, episodeDetailTopBarButtonStyles } from '@/components/episode/EpisodeListCard';
import { EpisodeTagChip } from '@/components/episode/EpisodeTagChip';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { PanelSection, SectionDivider } from '@/components/ui/Panel';
import { NoteBlockView } from '@/components/ui/NoteBlockView';
import { Radius, Theme } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useBottomNavScrollClearance } from '@/hooks/useBottomNavScrollClearance';
import {
  getDefaultProfile,
  getEpisodeListPhotoUrisMap,
  getEpisodesByEventId,
  getEvent,
  getEventParticipants,
  getMyself,
  getTasksByEventId,
  initializeDatabase,
} from '../db';
import type { Episode, EpisodeParticipant, Event, Friend, Task } from '../types';
import { buildParticipantChipDisplays, buildParticipantChips } from '../utils/episodeHelpers';
import { buildFriendPhotoById } from '@/utils/friendPhoto';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import {
  formatDateKey,
  formatEventScheduleLabel,
  formatTimeFromDate,
  getAllDayDateKeysFromEvent,
} from '../utils/eventHelpers';
import { profileIdsToFriendIds } from '../utils/eventParticipantHelpers';
import {
  NOTIFY_TIMING_OPTIONS,
  inferNotifyTimingPreset,
} from '../utils/eventNotifyTiming';
import { formatTaskDueDateLabel } from '@/utils/taskHelpers';
import { formatNotePreview, noteBlocksHaveContent } from '@/utils/noteBlocks';
import { popCurrentTabScreen } from '@/utils/tabNavigation';
import { contentMutedTextStyle, contentSurfaceStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const parseRouteParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
};

const buildFriendNameById = (friendList: Friend[]): Map<string, string> =>
  new Map(friendList.map((friend) => [friend.id, friend.name]));

export default function EventDetailScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const appTheme = useAppThemeOptional();
  const content = useContentColors();
  const editButtonBorderColor = appTheme?.colors.topBarBorder ?? Theme.topBarBorder;
  const bottomNavClearance = useBottomNavScrollClearance();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const eventId = parseRouteParam(params.eventId);
  const missingPoppedRef = useRef(false);

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
      if (!missingPoppedRef.current) {
        missingPoppedRef.current = true;
        popCurrentTabScreen();
      }
      return;
    }
    missingPoppedRef.current = false;
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

  const headerRight = (
    <Pressable
      style={[episodeDetailTopBarButtonStyles.button, { borderColor: editButtonBorderColor }]}
      onPress={() => {
        if (!event) {
          return;
        }
        router.push({ pathname: '/event', params: { eventId: event.id } });
      }}
      accessibilityLabel="編集"
      hitSlop={8}
    >
      <Ionicons name="pencil-outline" size={18} color={kit.topBarText} />
    </Pressable>
  );

  return (
    <SubToolScreenTemplate
      title="予定"
      onBack={() => popCurrentTabScreen()}
      right={event ? headerRight : undefined}
      titleFramed={false}
      useScreenPadding={false}
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
                      router.push({ pathname: '/detail', params: { id: friendId } })
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

          {event.notifyEnabled ? (
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

          {linkedTasks.length > 0 ? (
            <>
              <SectionDivider />
              <PanelSection style={styles.section}>
                <View style={styles.iconRow} accessibilityLabel="タスク">
                  <View style={[styles.mark, styles.markText]}>
                    <Ionicons name="checkbox-outline" size={18} color={content.contentTextSecondary} />
                  </View>
                  <View style={styles.iconBody}>
                    {linkedTasks.map((task) => (
                      <Pressable
                        key={task.id}
                        style={[styles.taskRow, contentSurfaceStyle(content), { borderColor: content.contentBorder }]}
                        onPress={() => router.push({ pathname: '/task-detail', params: { taskId: task.id } })}
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
                    ))}
                  </View>
                </View>
              </PanelSection>
            </>
          ) : null}

          <SectionDivider />
          <PanelSection style={styles.section}>
            <View
              style={[styles.iconRow, linkedEpisodes.length === 0 ? styles.iconRowCenter : null]}
              accessibilityLabel="登録済みエピソード"
            >
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
                        router.push({
                          pathname: '/episode-detail',
                          params: { episodeId: episode.id, ownerId },
                        });
                      }}
                    />
                  ))}
                </View>
              ) : (
                <Text style={[styles.iconText, contentMutedTextStyle(content)]}>
                  登録済みのエピソードはありません
                </Text>
              )}
            </View>
          </PanelSection>
        </>
      )}
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
