import {
  getDefaultProfile,
  getEvent,
  getEventParticipants,
  getFriendById,
  getMyself,
  initializeDatabase,
} from '@/db';
import type { EpisodeParticipant, Event, ProfileMemo } from '@/types';
import { deleteFormDraft, readFormDraftRecord } from '@/utils/formDraftStore';
import { cloneProfileMemo, savedProfileMemos } from '@/utils/eventParticipantMemos';
import { profileIdsToFriendIds } from '@/utils/eventParticipantHelpers';
import {
  formatDateKey,
  formatTimeFromDate,
  getAllDayDateKeysFromEvent,
} from '@/utils/eventHelpers';
import {
  DEFAULT_NOTIFY_TIMING_PRESET,
  type EventNotifyTimingPreset,
  inferNotifyTimingPreset,
} from '@/utils/eventNotifyTiming';

const NEW_KEY = 'draft.event.new';
const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '09:00';

const NOTIFY_PRESETS: EventNotifyTimingPreset[] = [
  'day_before_22',
  'day_before_18',
  'morning_of_8',
  'one_hour_before',
];

export type EventFormDraft = {
  title: string;
  memo: string;
  episodeTag: string;
  allDay: boolean;
  startDateKey: string;
  endDateKey: string;
  startTime: string;
  endTime: string;
  participants: EpisodeParticipant[];
  /** 予定を開いた時点の人物メモ。予定画面で消した行を人物カードから外す判定に使う */
  participantMemoBaselines: Record<string, ProfileMemo[]> | null;
  /** 予定画面で編集中の人物メモ。無い下書きは null で、開いたときに人物カードから読む */
  participantMemos: Record<string, ProfileMemo[]> | null;
  notifyEnabled: boolean;
  notifyTimingPreset: EventNotifyTimingPreset;
  initialDate: string;
};

export function eventDraftKey(eventId: string | null): string {
  return eventId ? `draft.event.${eventId}` : NEW_KEY;
}

export function serializeEventForm(fields: EventFormDraft): string {
  return JSON.stringify(fields);
}

const isParticipants = (value: unknown): value is EpisodeParticipant[] =>
  Array.isArray(value) &&
  value.every((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const entry = item as Partial<EpisodeParticipant>;
    return (entry.kind === 'individual' || entry.kind === 'group') && typeof entry.value === 'string';
  });

const isProfileMemoDraft = (value: unknown): value is ProfileMemo => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const memo = value as Partial<ProfileMemo>;
  if (typeof memo.id !== 'string' || typeof memo.text !== 'string') {
    return false;
  }
  if (memo.date != null && typeof memo.date !== 'string') {
    return false;
  }
  if (memo.tags != null && !Array.isArray(memo.tags)) {
    return false;
  }
  return true;
};

/** 古い下書きに欄が無いときは null。壊れた形も null にして、予定自体の下書きは残す */
const parseParticipantMemoRecord = (value: unknown): Record<string, ProfileMemo[]> | null => {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record: Record<string, ProfileMemo[]> = {};
  for (const [friendId, rows] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rows) || !rows.every(isProfileMemoDraft)) {
      return null;
    }
    record[friendId] = rows.map((row) => cloneProfileMemo(row));
  }
  return record;
};

export function parseEventFormDraft(raw: string): EventFormDraft | null {
  try {
    const value = JSON.parse(raw) as Partial<EventFormDraft>;
    if (
      typeof value.title !== 'string' ||
      typeof value.memo !== 'string' ||
      typeof value.episodeTag !== 'string' ||
      typeof value.allDay !== 'boolean' ||
      typeof value.startDateKey !== 'string' ||
      typeof value.endDateKey !== 'string' ||
      typeof value.startTime !== 'string' ||
      typeof value.endTime !== 'string' ||
      !isParticipants(value.participants) ||
      typeof value.notifyEnabled !== 'boolean' ||
      !NOTIFY_PRESETS.includes(value.notifyTimingPreset as EventNotifyTimingPreset) ||
      typeof value.initialDate !== 'string'
    ) {
      return null;
    }
    return {
      title: value.title,
      memo: value.memo,
      episodeTag: value.episodeTag,
      allDay: value.allDay,
      startDateKey: value.startDateKey,
      endDateKey: value.endDateKey,
      startTime: value.startTime,
      endTime: value.endTime,
      participants: value.participants,
      participantMemoBaselines: parseParticipantMemoRecord(value.participantMemoBaselines),
      participantMemos: parseParticipantMemoRecord(value.participantMemos),
      notifyEnabled: value.notifyEnabled,
      notifyTimingPreset: value.notifyTimingPreset as EventNotifyTimingPreset,
      initialDate: value.initialDate,
    };
  } catch {
    return null;
  }
}

export function readEventFormDraft(eventId: string | null): { base: string; fields: EventFormDraft } | null {
  const record = readFormDraftRecord(eventDraftKey(eventId));
  if (!record) {
    return null;
  }
  const fields = parseEventFormDraft(record.fields);
  if (!fields) {
    deleteFormDraft(eventDraftKey(eventId));
    return null;
  }
  return { base: record.base, fields };
}

export function deleteEventFormDraft(eventId: string | null): void {
  deleteFormDraft(eventDraftKey(eventId));
}

function profileMemosForParticipants(
  entries: EpisodeParticipant[],
  eventId: string
): Record<string, ProfileMemo[]> {
  const record: Record<string, ProfileMemo[]> = {};
  for (const entry of entries) {
    if (entry.kind !== 'individual') {
      continue;
    }
    const friendId = entry.value.trim();
    if (!friendId || record[friendId]) {
      continue;
    }
    record[friendId] = savedProfileMemos(getFriendById(friendId)?.notes ?? []).filter(
      (memo) => memo.eventId === eventId
    );
  }
  return record;
}

function participantsForEvent(eventId: string, myselfId: string | null): EpisodeParticipant[] {
  const excludeProfileId = myselfId ? getDefaultProfile(myselfId)?.id ?? null : null;
  const participantIds = getEventParticipants(eventId).map((participant) => participant.profileId);
  const profileIds = excludeProfileId
    ? participantIds.filter((profileId) => profileId !== excludeProfileId)
    : participantIds;
  return profileIdsToFriendIds(profileIds)
    .filter((friendId) => friendId !== myselfId)
    .map((friendId) => ({ kind: 'individual' as const, value: friendId }));
}

export function buildNewEventForm(initialDate: string): EventFormDraft {
  const baseDate = initialDate || formatDateKey(new Date());
  return {
    title: '',
    memo: '',
    episodeTag: '',
    allDay: false,
    startDateKey: baseDate,
    endDateKey: baseDate,
    startTime: DEFAULT_START_TIME,
    endTime: DEFAULT_END_TIME,
    participants: [],
    participantMemoBaselines: {},
    participantMemos: {},
    notifyEnabled: true,
    notifyTimingPreset: DEFAULT_NOTIFY_TIMING_PRESET,
    initialDate,
  };
}

export function buildSavedEventForm(event: Event, initialDate: string): EventFormDraft {
  initializeDatabase();
  const myselfId = getMyself();
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;
  let startDateKey = formatDateKey(start);
  let endDateKey = formatDateKey(end ?? start);
  let startTime = formatTimeFromDate(start);
  let endTime = formatTimeFromDate(end ?? start);
  if (event.allDay) {
    const keys = getAllDayDateKeysFromEvent(event);
    startDateKey = keys.startDateKey;
    endDateKey = keys.endDateKey;
    startTime = '00:00';
    endTime = '23:59';
  }
  const timingInput = event.allDay
    ? { startDateKey, startTime: '00:00', allDay: true as const }
    : { startDateKey, startTime, allDay: false as const };
  const participants = participantsForEvent(event.id, myselfId);
  const participantMemos = profileMemosForParticipants(participants, event.id);
  return {
    title: event.title,
    memo: event.memo ?? '',
    episodeTag: event.episodeTag ?? '',
    allDay: event.allDay,
    startDateKey,
    endDateKey,
    startTime,
    endTime,
    participants,
    participantMemoBaselines: participantMemos,
    participantMemos,
    notifyEnabled: event.notifyEnabled,
    notifyTimingPreset: inferNotifyTimingPreset(event.notifyAt, timingInput),
    initialDate,
  };
}

/** 人物メモ欄が増える前の下書きでも、予定本体が同じなら下書きを捨てない */
export function eventDraftBaseMatches(storedBase: string, loadedBody: string): boolean {
  if (storedBase === loadedBody) {
    return true;
  }
  const stored = parseEventFormDraft(storedBase);
  const loaded = parseEventFormDraft(loadedBody);
  if (!stored || !loaded) {
    return false;
  }
  const withoutMemos = (fields: EventFormDraft): EventFormDraft => ({
    ...fields,
    participantMemoBaselines: {},
    participantMemos: {},
  });
  return serializeEventForm(withoutMemos(stored)) === serializeEventForm(withoutMemos(loaded));
}

export function savedEventBaselineBody(eventId: string): string | null {
  initializeDatabase();
  const event = getEvent(eventId);
  if (!event) {
    return null;
  }
  return serializeEventForm(buildSavedEventForm(event, ''));
}
