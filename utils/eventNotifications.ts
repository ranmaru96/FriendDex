import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { parseEpisodeDateString } from '@/components/episode/types';
import { getFriendById } from '../db';
import type { Event } from '../types';
import type { EventParticipantDisplay } from './eventParticipantHelpers';
import { formatDateKey } from './eventHelpers';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ANDROID_CHANNEL_ID = 'frienddex-events';

export type EventNotificationData = {
  eventId: string;
  calendarDate: string;
  friendId?: string;
};

// 診断用: 起動時の通知セットアップを一時的に無効化
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: false,
//     shouldShowBanner: true,
//     shouldShowList: true,
//   }),
// });

const ensureAndroidChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: '予定',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
};

export const ensureNotificationInfrastructure = async (): Promise<void> => {
  await ensureAndroidChannel();
};

export const canScheduleNotifications = async (): Promise<boolean> => {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
};

/** 初回予定作成時のみ権限をリクエスト（拒否済みなら再リクエストしない） */
export const requestNotificationPermissionOnFirstCreate = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') {
    return true;
  }
  if (current.status !== 'undetermined') {
    return false;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
};

const formatEpisodeDateLabel = (date: string): string => {
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
    return date;
  }
  const [, month, day] = parts;
  return `${month}月${day}日`;
};

const getLatestEpisodeDate = (friendId: string): string | null => {
  const friend = getFriendById(friendId);
  if (!friend || friend.episodes.length === 0) {
    return null;
  }
  const dates = friend.episodes
    .map((episode) => episode.date.trim())
    .filter((value) => value.length > 0)
    .sort((a, b) => b.localeCompare(a));
  return dates[0] ?? null;
};

const isStaleRelationship = (friendId: string): { stale: boolean; latestDate: string | null } => {
  const latestDate = getLatestEpisodeDate(friendId);
  if (!latestDate) {
    return { stale: true, latestDate: null };
  }
  const latest = parseEpisodeDateString(latestDate);
  const stale = Date.now() - latest.getTime() >= THIRTY_DAYS_MS;
  return { stale, latestDate };
};

const getMeetingDayWord = (notifyAtIso: string, eventStartIso: string): string => {
  const notifyDay = formatDateKey(new Date(notifyAtIso));
  const eventDay = formatDateKey(new Date(eventStartIso));
  return notifyDay === eventDay ? '今日' : '明日';
};

const buildStaleNotes = (participants: EventParticipantDisplay[]): string[] => {
  const notes: string[] = [];
  participants.forEach((participant) => {
    const { stale, latestDate } = isStaleRelationship(participant.friendId);
    if (!stale) {
      return;
    }
    if (!latestDate) {
      notes.push(`${participant.name}さんとはまだエピソードがありません`);
      return;
    }
    notes.push(`${participant.name}さんとは${formatEpisodeDateLabel(latestDate)}以来ですね`);
  });
  return notes;
};

export const buildEventNotificationBody = (
  event: Pick<Event, 'startAt' | 'notifyAt'>,
  participants: EventParticipantDisplay[]
): string => {
  const notifyAt = event.notifyAt ?? '';
  const dayWord = notifyAt ? getMeetingDayWord(notifyAt, event.startAt) : '明日';

  let mainLine = '予定のリマインダーです';
  if (participants.length === 1) {
    mainLine = `${dayWord}${participants[0].name}に会いますね`;
  } else if (participants.length > 1) {
    mainLine = `${dayWord}${participants[0].name}さんたちに会いますね`;
  }

  const staleNotes = buildStaleNotes(participants);
  if (staleNotes.length === 0) {
    return mainLine;
  }
  return `${mainLine}\n${staleNotes.join('\n')}`;
};

export const cancelEventNotification = async (notificationId: string | null | undefined): Promise<void> => {
  const normalized = notificationId?.trim();
  if (!normalized) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(normalized);
  } catch {
    // 既に発火済み・削除済みの場合は無視
  }
};

export const scheduleEventNotification = async (
  event: Event,
  participants: EventParticipantDisplay[]
): Promise<string | null> => {
  if (!event.notifyEnabled || !event.notifyAt) {
    return null;
  }

  const notifyDate = new Date(event.notifyAt);
  if (Number.isNaN(notifyDate.getTime()) || notifyDate.getTime() <= Date.now()) {
    return null;
  }

  const granted = await canScheduleNotifications();
  if (!granted) {
    return null;
  }

  await ensureNotificationInfrastructure();

  const calendarDate = formatDateKey(new Date(event.startAt));
  const data: EventNotificationData = {
    eventId: event.id,
    calendarDate,
    ...(participants.length === 1 ? { friendId: participants[0].friendId } : {}),
  };

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: event.title,
      body: buildEventNotificationBody(event, participants),
      data,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: notifyDate,
    },
  });

  return notificationId;
};
