import {
  createEvent,
  getEpisodeParticipantFriendIds,
  getEventParticipants,
  getEventsByDateRange,
} from '../db';
import type { EpisodeParticipant, Event } from '../types';
import { buildAllDayEndAt, buildAllDayStartAt, eventOccursOnLocalDate, parseDateKey } from './eventHelpers';
import { normalizeEpisodeTag } from './episodeHelpers';
import { friendIdsToProfileIds, syncEventParticipants } from './eventParticipantHelpers';

export type EpisodeEventMatch = {
  event: Event;
  overlapCount: number;
};

type EpisodeEventSyncInput = {
  title: string;
  date: string;
  description: string;
  participantEntries: EpisodeParticipant[];
  episodeTag?: string | null;
};

const formatEpisodeDateLabel = (dateKey: string): string => {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
    return dateKey;
  }
  const [, month, day] = parts;
  return `${month}月${day}日`;
};

export const formatEpisodeEventMatchLabel = (event: Event, dateKey: string): string =>
  `${event.title}（${formatEpisodeDateLabel(dateKey)}）`;

const getDayRangeIso = (dateKey: string): { rangeStartAt: string; rangeEndAt: string } | null => {
  const normalized = dateKey.trim();
  if (!normalized) {
    return null;
  }
  const base = parseDateKey(normalized);
  const rangeStartAt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0).toISOString();
  const rangeEndAt = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + 1,
    0,
    0,
    0,
    0
  ).toISOString();
  return { rangeStartAt, rangeEndAt };
};

export const findMatchingEventsForEpisode = (
  episodeDate: string,
  participantEntries: EpisodeParticipant[]
): EpisodeEventMatch[] => {
  const dateKey = episodeDate.trim();
  const range = getDayRangeIso(dateKey);
  if (!range) {
    return [];
  }

  const participantFriendIds = getEpisodeParticipantFriendIds({ participantEntries });
  const episodeProfileIds = new Set(friendIdsToProfileIds(participantFriendIds));
  if (episodeProfileIds.size === 0) {
    return [];
  }

  const events = getEventsByDateRange(range.rangeStartAt, range.rangeEndAt);
  const matches: EpisodeEventMatch[] = [];

  events.forEach((event) => {
    if (!eventOccursOnLocalDate(event, dateKey)) {
      return;
    }

    const eventProfileIds = new Set(getEventParticipants(event.id).map((participant) => participant.profileId));
    let overlapCount = 0;
    episodeProfileIds.forEach((profileId) => {
      if (eventProfileIds.has(profileId)) {
        overlapCount += 1;
      }
    });

    if (overlapCount >= 1) {
      matches.push({ event, overlapCount });
    }
  });

  return matches.sort((left, right) => {
    if (right.overlapCount !== left.overlapCount) {
      return right.overlapCount - left.overlapCount;
    }
    return left.event.title.localeCompare(right.event.title, 'ja');
  });
};

export const createEventFromEpisode = (input: EpisodeEventSyncInput): Event | null => {
  const dateKey = input.date.trim();
  if (!dateKey) {
    return null;
  }

  const description = input.description.trim();
  const memo = description.length > 0 ? description.slice(0, 500) : null;
  const participantProfileIds = friendIdsToProfileIds(
    getEpisodeParticipantFriendIds({ participantEntries: input.participantEntries })
  );

  const created = createEvent({
    title: input.title.trim(),
    startAt: buildAllDayStartAt(dateKey),
    endAt: buildAllDayEndAt(dateKey),
    allDay: true,
    memo,
    notifyAt: null,
    notifyEnabled: false,
    autoEpisodeCreated: true,
    episodeTag: normalizeEpisodeTag(input.episodeTag),
  });

  if (!created) {
    return null;
  }

  syncEventParticipants(created.id, participantProfileIds);
  return created;
};
