import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import { PHOTO_LIMITS } from '@/constants';
import {
  deleteEpisodePhoto,
  getEpisodeParticipantFriendIds,
  getEpisodePhotos,
  getEvent,
  getEventParticipants,
  getFriendById,
  getMyself,
  insertEpisodePhoto,
} from '@/db';
import type {
  Episode,
  EpisodeParticipant,
  EpisodePhoto,
  EpisodeVisibilityEntry,
  EpisodeVisibilityMode,
  Friend,
} from '@/types';
import {
  excludeSelfIndividualEntries,
  friendsExcludingSelf,
  mergeParticipantEntries,
  normalizeEpisodeTag,
  normalizeEpisodeTime,
  toIndividualParticipantEntries,
} from '@/utils/episodeHelpers';
import { getLinkedEventDateBounds } from '@/utils/eventEpisodeBidirectionalSync';
import {
  formatDateKey,
  formatTimeFromDate,
  getLocalDateKeysForEvent,
  isEventStartInFuture,
  parseDateKey,
} from '@/utils/eventHelpers';
import { profileIdsToFriendIds } from '@/utils/eventParticipantHelpers';
import { deletePersistedImages } from '@/utils/persistImageFile';
import {
  deleteEpisodeDraft,
  forgetEpisodeDraft,
  readUsableEpisodeDraft,
  writeEpisodeDraft,
  type EpisodeDraft,
} from '@/utils/episodeDraft';
import { searchEventsForEpisodeLink } from '@/utils/eventEpisodeSync';
import { getRecentTogetherFriendIdsFromPastEvents } from '@/utils/eventRecencyHelpers';
import {
  getCachedAcceptedPeerIds,
  isPersonCardLockedByAcceptedConnection,
  listConnections,
} from '@/lib/connectionSync';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import {
  EpisodeParticipantDraft,
  EpisodeVisibilityDraft,
  formatEpisodeDateToYMD,
} from '@/components/episode/types';

export type EpisodeEventLinkMode = 'none' | 'existing' | 'create_new';

export type EpisodeSavePayload = {
  title: string;
  date: string;
  /** HH:mm。未設定は null */
  time: string | null;
  description: string;
  visibilityMode: EpisodeVisibilityMode;
  participantEntries: EpisodeParticipant[];
  visibilityEntries: EpisodeVisibilityEntry[];
  tag?: string | null;
  locationTag?: string | null;
  /** Explicit link target; null means unlinked. Ignored when createLinkedEvent is true. */
  eventId: string | null;
  /** Create a new calendar event from this episode on save. */
  createLinkedEvent: boolean;
};

type UseEpisodeFormOptions = {
  friends: Friend[];
  hiddenParticipantIds?: string[];
  implicitParticipantEntries?: EpisodeParticipant[];
};

const hiddenIdSet = (ids?: string[]) =>
  new Set((ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0));

type EpisodeFormSnapshot = {
  title: string;
  date: string;
  time: string;
  description: string;
  participants: string;
  visibilityMode: EpisodeVisibilityMode;
  visibility: string;
  tag: string;
  eventLinkMode: EpisodeEventLinkMode;
  linkedEventId: string;
  newPhotoUris: string;
  deletedPhotoIds: string;
};

/** 新規フォーム。予定が1件ならそれを入れ、複数なら既存予定、0件なら予定なし。 */
const resolveNewEpisodeEventLink = (): {
  mode: EpisodeEventLinkMode;
  linkedEventId: string;
  date: string | null;
} => {
  const hits = searchEventsForEpisodeLink('', { limit: 2 });
  if (hits.length === 0) {
    return { mode: 'none', linkedEventId: '', date: null };
  }
  if (hits.length > 1) {
    return { mode: 'existing', linkedEventId: '', date: null };
  }
  const event = hits[0].event;
  const today = formatDateKey(new Date());
  const keys = getLocalDateKeysForEvent(event).filter((key) => key <= today);
  let date: string | null = null;
  if (keys.length === 1) {
    date = keys[0];
  } else if (keys.length > 1) {
    date = keys.includes(today) ? today : keys[0];
  }
  return { mode: 'existing', linkedEventId: event.id, date };
};

const participantSnapshot = (participants: { participantType: string; value: string }[]) =>
  participants.map((participant) => `${participant.participantType}:${participant.value}`).join('\n');

const visibilitySnapshot = (visibility: { kind: string; value: string }[]) =>
  visibility.map((entry) => `${entry.kind}:${entry.value}`).join('\n');

/** 限定公開の相手は個人だけ。コネクト一覧が取れていれば、コネクト済みに絞る。 */
const toConnectedAudienceDrafts = (
  entries: { kind: string; value: string }[],
  myselfId: string | null
): EpisodeVisibilityDraft[] => {
  const individuals = excludeSelfIndividualEntries(
    entries
      .filter((entry) => entry.kind === 'individual' && entry.value.trim().length > 0)
      .map((entry) => ({ kind: 'individual' as const, value: entry.value.trim() })),
    myselfId
  );
  if (getCachedAcceptedPeerIds().size === 0) {
    return individuals;
  }
  return individuals.filter((entry) => isPersonCardLockedByAcceptedConnection(entry.value));
};

const blankEpisodeFormSnapshot = (
  dateValue: string,
  eventLink: ReturnType<typeof resolveNewEpisodeEventLink> = resolveNewEpisodeEventLink()
): EpisodeFormSnapshot => ({
  title: '',
  date: eventLink.date ?? dateValue,
  time: '',
  description: '',
  participants: '',
  visibilityMode: 'private',
  visibility: '',
  tag: '',
  eventLinkMode: eventLink.mode,
  linkedEventId: eventLink.linkedEventId,
  newPhotoUris: '',
  deletedPhotoIds: '',
});

const sameEpisodeFormSnapshot = (left: EpisodeFormSnapshot, right: EpisodeFormSnapshot) =>
  (Object.keys(left) as (keyof EpisodeFormSnapshot)[]).every((key) => left[key] === right[key]);

export function useEpisodeForm({
  friends,
  hiddenParticipantIds = [],
  implicitParticipantEntries = [],
}: UseEpisodeFormOptions) {
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [title, setTitleState] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [participants, setParticipants] = useState<EpisodeParticipantDraft[]>([]);
  const [visibilityMode, setVisibilityMode] = useState<EpisodeVisibilityMode>('private');
  const [visibility, setVisibility] = useState<EpisodeVisibilityDraft[]>([]);
  const [formError, setFormErrorState] = useState('');
  /** 保存エラーがどの入力に対応するか。先頭サマリーと枠の強調に使う。 */
  const [formErrorField, setFormErrorField] = useState<'title' | 'event' | null>(null);
  const formErrorFieldRef = useRef(formErrorField);
  formErrorFieldRef.current = formErrorField;
  /** 同じエラーで保存を連打しても、タイトルへフォーカスし直す。 */
  const [formErrorTick, setFormErrorTick] = useState(0);

  const setFormError = useCallback((message: string) => {
    setFormErrorState(message);
    setFormErrorField(null);
  }, []);

  const showFormError = useCallback((message: string, field: 'title' | 'event' | null) => {
    setFormErrorState(message);
    setFormErrorField(field);
    setFormErrorTick((tick) => tick + 1);
  }, []);

  const setTitle = useCallback((value: string) => {
    setTitleState(value);
    // 空白だけは未入力のままなので、エラーは残す。
    if (!value.trim() || formErrorFieldRef.current !== 'title') {
      return;
    }
    setFormErrorState('');
    setFormErrorField(null);
  }, []);
  const [photos, setPhotos] = useState<EpisodePhoto[]>([]);
  const [newPhotoUris, setNewPhotoUris] = useState<string[]>([]);
  const newPhotoUrisRef = useRef<string[]>([]);
  /** DB へ登録済みの新規写真 URI。破棄時に実体を消すかの判定に使う。 */
  const committedPhotoUrisRef = useRef<Set<string>>(new Set());

  const applyNewPhotoUris = useCallback((next: string[]) => {
    newPhotoUrisRef.current = next;
    setNewPhotoUris(next);
  }, []);
  const [photoCropUri, setPhotoCropUri] = useState<string | null>(null);
  const [photoLibraryVisible, setPhotoLibraryVisible] = useState(false);
  const [photoResolving, setPhotoResolving] = useState(false);
  const [dismissedPhotoAssetIds, setDismissedPhotoAssetIds] = useState<string[]>([]);
  const editQueueRef = useRef<string[]>([]);
  const editTokenRef = useRef(0);
  const photoEditIndexRef = useRef(0);
  const sessionBaseUrisRef = useRef<string[]>([]);
  const sessionCropsRef = useRef<(string | null)[]>([]);
  const [photoEditPreviews, setPhotoEditPreviews] = useState<{ id: string; uri: string }[]>([]);
  const [photoEditIndex, setPhotoEditIndex] = useState(0);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<number[]>([]);
  const [linkedEventId, setLinkedEventId] = useState<string | null>(null);
  const [eventLinkMode, setEventLinkModeState] = useState<EpisodeEventLinkMode>('none');
  /** 開いた直後の入力。ここから変わっていなければ、閉じる確認は出さない。 */
  const baselineRef = useRef(blankEpisodeFormSnapshot(''));
  const isDirtyRef = useRef(false);
  const dismissPromptRef = useRef(false);
  /** 予定から開いた新規は、前回の下書きを重ねない。 */
  const draftSuppressRef = useRef(false);
  const draftSessionActiveRef = useRef(false);
  const draftGateRef = useRef<'pending' | 'ready'>('ready');
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftOriginRef = useRef(blankEpisodeFormSnapshot(''));
  const draftBaseDescriptionRef = useRef('');
  const draftEpisodeIdRef = useRef<string | null>(null);
  /** このセッションで下書きを書いたときだけ、元に戻したらその記録を消す。 */
  const draftOwnsRecordRef = useRef(false);
  const draftSessionPreparedRef = useRef(false);
  const [draftSessionActive, setDraftSessionActive] = useState(false);
  const [tag, setTag] = useState('');

  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState<'participant' | 'visibility'>('participant');
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [acceptedPeerRevision, setAcceptedPeerRevision] = useState(0);

  const friendNameById = useMemo(
    () => new Map(friends.map((friend) => [friend.id, friend.name])),
    [friends]
  );

  const visibleExistingPhotos = useMemo(
    () => photos.filter((photo) => !deletedPhotoIds.includes(photo.id)),
    [photos, deletedPhotoIds]
  );

  const isPhotoLimitReached =
    visibleExistingPhotos.length + newPhotoUris.length >= PHOTO_LIMITS.free;

  const todayKey = formatDateKey(new Date());
  const todayDate = parseDateKey(todayKey);

  const allowedEventDateRange = useMemo(
    () => (eventLinkMode === 'existing' ? getLinkedEventDateBounds(linkedEventId) : null),
    [eventLinkMode, linkedEventId]
  );

  /** Episode dates cannot be in the future; linked events further restrict the range. */
  const episodeDateMaximumDate = allowedEventDateRange?.maximumDate ?? todayDate;
  const episodeDateMinimumDate = allowedEventDateRange?.minimumDate;

  const linkedEventDateKeys = useMemo(() => {
    if (eventLinkMode !== 'existing') {
      return null;
    }
    const eventId = linkedEventId?.trim();
    if (!eventId) {
      return null;
    }
    const event = getEvent(eventId);
    if (!event) {
      return null;
    }
    return getLocalDateKeysForEvent(event).filter((key) => key <= todayKey);
  }, [eventLinkMode, linkedEventId, todayKey]);

  const isLinkedEventSingleDay = (linkedEventDateKeys?.length ?? 0) === 1;

  const setEventLinkMode = useCallback((mode: EpisodeEventLinkMode) => {
    setEventLinkModeState(mode);
    if (mode !== 'existing') {
      setLinkedEventId(null);
    }
  }, []);

  const reset = useCallback(() => {
    const eventLink = resolveNewEpisodeEventLink();
    const initialDate = eventLink.date ?? formatEpisodeDateToYMD(new Date());
    draftSuppressRef.current = false;
    committedPhotoUrisRef.current.clear();
    setFormError('');
    setEditingEpisodeId(null);
    setTitle('');
    setDate(initialDate);
    setTime('');
    setShowDatePicker(false);
    setShowTimePicker(false);
    setDescription('');
    setParticipants([]);
    setVisibilityMode('private');
    setVisibility([]);
    setPhotos([]);
    applyNewPhotoUris([]);
    editTokenRef.current += 1;
    editQueueRef.current = [];
    photoEditIndexRef.current = 0;
    setPhotoEditPreviews([]);
    setPhotoEditIndex(0);
    setPhotoCropUri(null);
    setPhotoLibraryVisible(false);
    setPhotoResolving(false);
    setDismissedPhotoAssetIds([]);
    setDeletedPhotoIds([]);
    setLinkedEventId(eventLink.linkedEventId || null);
    setEventLinkModeState(eventLink.mode);
    setTag('');
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    baselineRef.current = blankEpisodeFormSnapshot(initialDate, eventLink);
  }, [applyNewPhotoUris]);

  const excludeSelfId = useMemo(() => getMyself(), [friends, hiddenParticipantIds]);

  const connectedAudienceFriends = useMemo(() => {
    void acceptedPeerRevision;
    return friendsExcludingSelf(friends, excludeSelfId).filter((friend) =>
      isPersonCardLockedByAcceptedConnection(friend.id)
    );
  }, [acceptedPeerRevision, excludeSelfId, friends]);

  const selectorFriends = useMemo(() => {
    if (selectorTarget === 'visibility') {
      return connectedAudienceFriends;
    }
    const hidden = hiddenIdSet(hiddenParticipantIds);
    return friendsExcludingSelf(friends, excludeSelfId).filter(
      (friend) => !hidden.has(friend.id)
    );
  }, [
    connectedAudienceFriends,
    excludeSelfId,
    friends,
    hiddenParticipantIds,
    selectorTarget,
  ]);

  const refreshAudienceConnections = useCallback(() => {
    void listConnections().then(() => {
      setAcceptedPeerRevision((revision) => revision + 1);
    });
  }, []);

  useEffect(() => {
    if (acceptedPeerRevision === 0) {
      return;
    }
    setVisibility((current) => {
      const next = toConnectedAudienceDrafts(current, getMyself());
      if (
        next.length === current.length &&
        next.every((entry, index) => entry.kind === current[index]?.kind && entry.value === current[index]?.value)
      ) {
        return current;
      }
      return next;
    });
  }, [acceptedPeerRevision]);

  const recentTogetherFriendIds = useMemo(() => {
    const hidden = hiddenIdSet(hiddenParticipantIds);
    const validFriendIds = new Set(
      friends
        .map((friend) => friend.id)
        .filter((friendId) => friendId !== excludeSelfId && !hidden.has(friendId))
    );
    return getRecentTogetherFriendIdsFromPastEvents({
      validFriendIds,
      excludeFriendId: excludeSelfId,
    });
  }, [excludeSelfId, friends, hiddenParticipantIds]);

  const addParticipantFriend = useCallback((friendId: string) => {
    const normalized = friendId.trim();
    if (!normalized || normalized === getMyself()) {
      return;
    }
    if (hiddenIdSet(hiddenParticipantIds).has(normalized)) {
      return;
    }
    setParticipants((prev) => {
      if (prev.some((participant) => participant.participantType === 'individual' && participant.value === normalized)) {
        return prev;
      }
      return [...prev, { participantType: 'individual', value: normalized }];
    });
  }, [hiddenParticipantIds]);

  const removeParticipant = useCallback((chipId: string) => {
    const separator = chipId.indexOf(':');
    if (separator < 0) {
      return;
    }
    const kind = chipId.slice(0, separator);
    const value = chipId.slice(separator + 1);
    setParticipants((prev) =>
      prev.filter((participant) => {
        const participantKind = participant.participantType === 'individual' ? 'individual' : 'group';
        return !(participantKind === kind && participant.value === value);
      })
    );
  }, []);

  const removeVisibility = useCallback((chipId: string) => {
    const separator = chipId.indexOf(':');
    if (separator < 0) {
      return;
    }
    const kind = chipId.slice(0, separator);
    const value = chipId.slice(separator + 1);
    setVisibility((prev) => prev.filter((entry) => !(entry.kind === kind && entry.value === value)));
  }, []);

  const restoreSelectorFromParticipants = useCallback((drafts: EpisodeParticipantDraft[]) => {
    const individuals = new Set<string>();
    const groups = new Set<string>();
    const hidden = hiddenIdSet(hiddenParticipantIds);
    const myselfId = getMyself();
    drafts.forEach((participant) => {
      if (!participant.value.trim()) return;
      if (participant.participantType === 'individual') {
        if (hidden.has(participant.value) || participant.value === myselfId) {
          return;
        }
        individuals.add(participant.value);
      } else {
        groups.add(participant.value);
      }
    });
    setSelectedIndividualIds(individuals);
    setSelectedGroupValues(groups);
  }, [hiddenParticipantIds]);

  const restoreSelectorFromVisibility = useCallback((entries: EpisodeVisibilityDraft[]) => {
    const individuals = new Set<string>();
    toConnectedAudienceDrafts(entries, getMyself()).forEach((entry) => {
      individuals.add(entry.value);
    });
    setSelectedIndividualIds(individuals);
    setSelectedGroupValues(new Set());
  }, []);

  const openParticipantSelector = useCallback(() => {
    restoreSelectorFromParticipants(participants);
    setSelectorTarget('participant');
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  }, [participants, restoreSelectorFromParticipants]);

  const openVisibilitySelector = useCallback(() => {
    dismissKeyboardFocus();
    refreshAudienceConnections();
    restoreSelectorFromVisibility(visibility);
    setSelectorTarget('visibility');
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  }, [refreshAudienceConnections, restoreSelectorFromVisibility, visibility]);

  const handleSelectorCancel = useCallback(() => {
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    if (selectorTarget === 'visibility' && visibility.length === 0) {
      setVisibilityMode('private');
    }
  }, [selectorTarget, visibility.length]);

  const handleSelectorConfirm = useCallback(() => {
    const myselfId = getMyself();
    const hidden = hiddenIdSet(hiddenParticipantIds);
    if (selectorTarget === 'participant') {
      // Participants are individual IDs only (group-name tags deferred).
      const expandedIds = getEpisodeParticipantFriendIds({
        participantEntries: [
          ...Array.from(selectedIndividualIds).map((friendId) => ({
            kind: 'individual' as const,
            value: friendId,
          })),
          ...Array.from(selectedGroupValues).map((groupValue) => ({
            kind: 'group' as const,
            value: groupValue,
          })),
        ],
      }).filter((friendId) => !hidden.has(friendId) && friendId !== myselfId);
      setParticipants(
        toIndividualParticipantEntries(expandedIds).map((entry) => ({
          participantType: 'individual' as const,
          value: entry.value,
        }))
      );
    } else {
      const nextVisibility = toConnectedAudienceDrafts(
        Array.from(selectedIndividualIds).map((friendId) => ({
          kind: 'individual',
          value: friendId,
        })),
        myselfId
      );
      setVisibility(nextVisibility);
      setVisibilityMode(nextVisibility.length === 0 ? 'private' : 'limited');
    }
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, [hiddenParticipantIds, selectorTarget, selectedIndividualIds, selectedGroupValues]);

  const toggleSelectorIndividual = useCallback((friendId: string) => {
    if (friendId === getMyself()) {
      return;
    }
    setSelectedIndividualIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  }, []);

  const toggleSelectorGroup = useCallback((groupValue: string) => {
    setSelectedGroupValues((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) next.delete(groupValue);
      else next.add(groupValue);
      return next;
    });
  }, []);

  const loadFromEpisode = useCallback(
    (episode: Episode) => {
      const hidden = hiddenIdSet(hiddenParticipantIds);
      // Expand any legacy group participant tags to individuals for editing.
      const myselfId = getMyself();
      const expandedFriendIds = getEpisodeParticipantFriendIds({
        participantEntries: episode.participantEntries ?? [],
      }).filter((friendId) => !hidden.has(friendId) && friendId !== myselfId);
      const participantDrafts: EpisodeParticipantDraft[] = toIndividualParticipantEntries(
        expandedFriendIds
      ).map((entry) => ({
        participantType: 'individual' as const,
        value: entry.value,
      }));
      setEditingEpisodeId(episode.id);
      setTitle(episode.title);
      const eventId = episode.eventId?.trim() || null;
      const nextEventLinkMode: EpisodeEventLinkMode = eventId ? 'existing' : 'none';
      setLinkedEventId(eventId);
      setEventLinkModeState(nextEventLinkMode);
      let nextDate = episode.date;
      if (eventId) {
        const event = getEvent(eventId);
        if (event) {
          const allowedDateKeys = getLocalDateKeysForEvent(event);
          if (allowedDateKeys.length > 0 && !allowedDateKeys.includes(nextDate)) {
            nextDate = allowedDateKeys[0];
          }
        }
      }
      const nextTime = normalizeEpisodeTime(episode.time) ?? '';
      const nextVisibility = toConnectedAudienceDrafts(
        episode.visibilityEntries ?? [],
        myselfId
      );
      const nextTag = episode.tag ?? '';
      setDate(nextDate);
      setTime(nextTime);
      setDescription(episode.description);
      setParticipants(participantDrafts);
      setVisibilityMode(episode.visibilityMode);
      setVisibility(nextVisibility);
      setPhotos(getEpisodePhotos(episode.id));
      applyNewPhotoUris([]);
      setPhotoCropUri(null);
      setDeletedPhotoIds([]);
      setFormError('');
      setShowDatePicker(false);
      setShowTimePicker(false);
      setTag(nextTag);
      baselineRef.current = {
        title: episode.title,
        date: nextDate,
        time: nextTime,
        description: episode.description,
        participants: participantSnapshot(participantDrafts),
        visibilityMode: episode.visibilityMode,
        visibility: visibilitySnapshot(nextVisibility),
        tag: nextTag,
        eventLinkMode: nextEventLinkMode,
        linkedEventId: eventId ?? '',
        newPhotoUris: '',
        deletedPhotoIds: '',
      };
    },
    [applyNewPhotoUris, hiddenParticipantIds]
  );

  const prefillFromEvent = useCallback(
    (eventId: string) => {
      const normalized = eventId.trim();
      const event = getEvent(normalized);
      if (!event || isEventStartInFuture(event)) {
        return false;
      }
      reset();
      setLinkedEventId(normalized);
      setEventLinkModeState('existing');
      setTitle(event.title);
      const today = formatDateKey(new Date());
      const keys = getLocalDateKeysForEvent(event).filter((key) => key <= today);
      const nextDate = keys[0] ?? today;
      const nextTime = event.allDay ? '' : formatTimeFromDate(new Date(event.startAt));
      const nextTag = event.episodeTag ?? '';
      setDate(nextDate);
      setTime(nextTime);
      setTag(nextTag);
      setDescription('');
      const myselfId = getMyself();
      const hidden = hiddenIdSet(hiddenParticipantIds);
      const friendIds = profileIdsToFriendIds(
        getEventParticipants(normalized).map((participant) => participant.profileId)
      ).filter((friendId) => !hidden.has(friendId) && friendId !== myselfId);
      const nextParticipants = friendIds.map((friendId) => ({
        participantType: 'individual' as const,
        value: friendId,
      }));
      setParticipants(nextParticipants);
      baselineRef.current = {
        title: event.title,
        date: nextDate,
        time: nextTime,
        description: '',
        participants: participantSnapshot(nextParticipants),
        visibilityMode: 'private',
        visibility: '',
        tag: nextTag,
        eventLinkMode: 'existing',
        linkedEventId: normalized,
        newPhotoUris: '',
        deletedPhotoIds: '',
      };
      draftSuppressRef.current = true;
      return true;
    },
    [hiddenParticipantIds, reset]
  );

  const buildSavePayload = useCallback((): EpisodeSavePayload | null => {
    const normalizedTitle = title.trim();
    const normalizedDate = date.trim();
    if (!normalizedTitle) {
      showFormError('タイトルを入力してください。', 'title');
      return null;
    }
    if (!normalizedDate) {
      showFormError('日付を選択してください。', null);
      return null;
    }
    if (normalizedDate > formatDateKey(new Date())) {
      showFormError('未来の日付は選択できません。', null);
      return null;
    }

    const myselfId = getMyself();
    const participantEntries = excludeSelfIndividualEntries(
      toIndividualParticipantEntries(
        getEpisodeParticipantFriendIds({
          participantEntries: mergeParticipantEntries(
            implicitParticipantEntries,
            participants
              .filter((participant) => participant.value.trim().length > 0)
              .map((participant) => ({
                kind: participant.participantType,
                value: participant.value,
              }))
          ),
        }).filter((friendId) => getFriendById(friendId) != null)
      ),
      myselfId
    );
    const visibilityEntries: EpisodeVisibilityEntry[] =
      visibilityMode === 'limited'
        ? toConnectedAudienceDrafts(visibility, myselfId).filter(
            (entry) => getFriendById(entry.value) != null
          )
        : [];
    const resolvedVisibilityMode: EpisodeVisibilityMode =
      visibilityMode === 'limited' && visibilityEntries.length === 0 ? 'private' : visibilityMode;

    setFormError('');
    const createLinkedEvent = eventLinkMode === 'create_new';
    const resolvedEventId =
      createLinkedEvent || eventLinkMode === 'none' ? null : linkedEventId?.trim() || null;
    if (eventLinkMode === 'existing' && !resolvedEventId) {
      showFormError('紐づける予定を選択してください。', 'event');
      return null;
    }
    return {
      title: normalizedTitle,
      date: normalizedDate,
      time: normalizeEpisodeTime(time),
      description: description.trim(),
      visibilityMode: resolvedVisibilityMode,
      participantEntries,
      visibilityEntries,
      tag: normalizeEpisodeTag(tag),
      locationTag: null,
      eventId: resolvedEventId,
      createLinkedEvent,
    };
  }, [
    date,
    description,
    eventLinkMode,
    implicitParticipantEntries,
    linkedEventId,
    participants,
    tag,
    showFormError,
    time,
    title,
    visibility,
    visibilityMode,
  ]);

  const linkToEvent = useCallback((eventId: string) => {
    const normalized = eventId.trim();
    if (!normalized) {
      setLinkedEventId(null);
      setEventLinkModeState('none');
      return;
    }
    const event = getEvent(normalized);
    if (!event) {
      return;
    }
    if (isEventStartInFuture(event)) {
      showFormError('未来の予定にはエピソードを紐づけられません。', 'event');
      return;
    }
    setFormError('');
    setEventLinkModeState('existing');
    setLinkedEventId(normalized);
    const today = formatDateKey(new Date());
    const keys = getLocalDateKeysForEvent(event).filter((key) => key <= today);
    if (keys.length === 1) {
      setDate(keys[0]);
    } else if (keys.length > 1) {
      setDate((prev) => (keys.includes(prev) ? prev : keys[0]));
    }
    setTag((prev) => {
      if (prev.trim()) {
        return prev;
      }
      return event.episodeTag ?? '';
    });
  }, [showFormError]);

  const remainingPhotoSlots = Math.max(
    0,
    PHOTO_LIMITS.free - visibleExistingPhotos.length - newPhotoUris.length
  );

  const showNextQueuedPhoto = useCallback(async (assetId: string) => {
    editTokenRef.current += 1;
    const token = editTokenRef.current;
    setPhotoResolving(true);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(assetId, {
        shouldDownloadFromNetwork: true,
      });
      if (token !== editTokenRef.current) {
        return;
      }
      const uri =
        info.localUri ??
        (info.uri.startsWith('file://') || info.uri.startsWith('content://') ? info.uri : null);
      if (!uri) {
        Alert.alert('写真を読み込めませんでした', '別の写真を選んでください。');
        return;
      }
      setPhotoCropUri(uri);
    } catch {
      if (token !== editTokenRef.current) {
        return;
      }
      Alert.alert('写真を読み込めませんでした', '別の写真を選んでください。');
    } finally {
      if (token === editTokenRef.current) {
        setPhotoResolving(false);
      }
    }
  }, []);

  const pickPhoto = useCallback(async () => {
    if (isPhotoLimitReached) return;
    const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (!permission.granted) {
      Alert.alert('権限が必要です', '写真を選ぶには、写真ライブラリへのアクセスが必要です。');
      return;
    }
    editTokenRef.current += 1;
    editQueueRef.current = [];
    photoEditIndexRef.current = 0;
    setPhotoEditPreviews([]);
    setPhotoEditIndex(0);
    setPhotoCropUri(null);
    setPhotoResolving(false);
    setDismissedPhotoAssetIds([]);
    setPhotoLibraryVisible(true);
  }, [isPhotoLimitReached]);

  const closePhotoLibrary = useCallback(() => {
    editTokenRef.current += 1;
    editQueueRef.current = [];
    photoEditIndexRef.current = 0;
    setPhotoEditPreviews([]);
    setPhotoEditIndex(0);
    setPhotoCropUri(null);
    setPhotoResolving(false);
    setDismissedPhotoAssetIds([]);
    setPhotoLibraryVisible(false);
  }, []);

  const beginPhotoEdits = useCallback(
    (assets: { id: string; uri: string }[]) => {
      const slots = Math.max(
        0,
        PHOTO_LIMITS.free - visibleExistingPhotos.length - newPhotoUrisRef.current.length
      );
      const queue = assets.slice(0, slots);
      if (queue.length === 0) {
        return;
      }
      editTokenRef.current += 1;
      editQueueRef.current = queue.map((asset) => asset.id);
      photoEditIndexRef.current = 0;
      sessionBaseUrisRef.current = [...newPhotoUrisRef.current];
      sessionCropsRef.current = queue.map(() => null);
      setPhotoEditPreviews(queue);
      setPhotoEditIndex(0);
      void showNextQueuedPhoto(queue[0].id);
    },
    [showNextQueuedPhoto, visibleExistingPhotos.length]
  );

  const cancelPhotoCrop = useCallback(() => {
    editTokenRef.current += 1;
    editQueueRef.current = [];
    photoEditIndexRef.current = 0;
    setPhotoEditPreviews([]);
    setPhotoEditIndex(0);
    setPhotoCropUri(null);
    setPhotoResolving(false);
  }, []);

  const applySessionCrops = useCallback(() => {
    applyNewPhotoUris([
      ...sessionBaseUrisRef.current,
      ...sessionCropsRef.current.filter((uri): uri is string => uri != null),
    ]);
  }, [applyNewPhotoUris]);

  const selectPhotoEdit = useCallback(
    (index: number) => {
      if (index === photoEditIndexRef.current) {
        return;
      }
      const assetId = editQueueRef.current[index];
      if (!assetId) {
        return;
      }
      photoEditIndexRef.current = index;
      setPhotoEditIndex(index);
      void showNextQueuedPhoto(assetId);
    },
    [showNextQueuedPhoto]
  );

  const confirmPhotoCrop = useCallback(
    (croppedUri: string) => {
      const index = photoEditIndexRef.current;
      const finishedId = editQueueRef.current[index];
      const previous = sessionCropsRef.current[index];
      if (previous && previous !== croppedUri && !committedPhotoUrisRef.current.has(previous)) {
        deletePersistedImages([previous]);
      }
      sessionCropsRef.current[index] = croppedUri;
      applySessionCrops();
      if (finishedId) {
        setDismissedPhotoAssetIds((prev) =>
          prev.includes(finishedId) ? prev : [...prev, finishedId]
        );
      }
      const nextIndex = sessionCropsRef.current.findIndex((uri) => uri == null);
      if (nextIndex < 0) {
        editQueueRef.current = [];
        photoEditIndexRef.current = 0;
        sessionBaseUrisRef.current = [];
        sessionCropsRef.current = [];
        setPhotoEditPreviews([]);
        setPhotoEditIndex(0);
        setPhotoCropUri(null);
        setPhotoLibraryVisible(false);
        setDismissedPhotoAssetIds([]);
        setPhotoResolving(false);
        return;
      }
      photoEditIndexRef.current = nextIndex;
      setPhotoEditIndex(nextIndex);
      void showNextQueuedPhoto(editQueueRef.current[nextIndex]);
    },
    [applySessionCrops, showNextQueuedPhoto]
  );

  const removeExistingPhoto = useCallback((photoId: number) => {
    setDeletedPhotoIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]));
  }, []);

  const removeNewPhoto = useCallback(
    (index: number) => {
      const target = newPhotoUrisRef.current[index];
      if (target && !committedPhotoUrisRef.current.has(target)) {
        deletePersistedImages([target]);
      }
      applyNewPhotoUris(newPhotoUrisRef.current.filter((_, i) => i !== index));
    },
    [applyNewPhotoUris]
  );

  const persistPhotos = useCallback(
    (episodeId: string, isEdit: boolean) => {
      const uris = newPhotoUrisRef.current;
      uris.forEach((uri) => committedPhotoUrisRef.current.add(uri));
      if (isEdit) {
        deletedPhotoIds.forEach((id) => {
          deleteEpisodePhoto(id);
        });
        const existingCount = photos.filter((photo) => !deletedPhotoIds.includes(photo.id)).length;
        uris.forEach((uri, index) => {
          insertEpisodePhoto(episodeId, uri, existingCount + index);
        });
        return;
      }
      uris.forEach((uri, index) => {
        insertEpisodePhoto(episodeId, uri, index);
      });
    },
    [deletedPhotoIds, photos]
  );

  const currentSnapshot: EpisodeFormSnapshot = {
    title,
    date,
    time,
    description,
    participants: participantSnapshot(participants),
    visibilityMode,
    visibility: visibilitySnapshot(visibility),
    tag,
    eventLinkMode,
    linkedEventId: linkedEventId ?? '',
    newPhotoUris: newPhotoUris.join('\n'),
    deletedPhotoIds: deletedPhotoIds.join(','),
  };
  const isDirty = !sameEpisodeFormSnapshot(currentSnapshot, baselineRef.current);
  isDirtyRef.current = isDirty;

  const draftFieldsRef = useRef({
    title,
    date,
    time,
    description,
    participants,
    visibilityMode,
    visibility,
    tag,
    eventLinkMode,
    linkedEventId,
    newPhotoUris,
    deletedPhotoIds,
    editingEpisodeId,
  });
  draftFieldsRef.current = {
    title,
    date,
    time,
    description,
    participants,
    visibilityMode,
    visibility,
    tag,
    eventLinkMode,
    linkedEventId,
    newPhotoUris,
    deletedPhotoIds,
    editingEpisodeId,
  };
  const editingEpisodeIdRef = useRef(editingEpisodeId);
  editingEpisodeIdRef.current = editingEpisodeId;

  const snapshotFromCurrentFields = (): EpisodeFormSnapshot => {
    const fields = draftFieldsRef.current;
    return {
      title: fields.title,
      date: fields.date,
      time: fields.time,
      description: fields.description,
      participants: participantSnapshot(fields.participants),
      visibilityMode: fields.visibilityMode,
      visibility: visibilitySnapshot(fields.visibility),
      tag: fields.tag,
      eventLinkMode: fields.eventLinkMode,
      linkedEventId: fields.linkedEventId ?? '',
      newPhotoUris: fields.newPhotoUris.join('\n'),
      deletedPhotoIds: fields.deletedPhotoIds.join(','),
    };
  };

  const stopDraftTimer = () => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  };

  const persistDraftNow = () => {
    if (!draftSessionActiveRef.current || draftGateRef.current !== 'ready') {
      return;
    }
    const current = snapshotFromCurrentFields();
    if (sameEpisodeFormSnapshot(current, draftOriginRef.current)) {
      if (draftOwnsRecordRef.current) {
        forgetEpisodeDraft(draftEpisodeIdRef.current);
        draftOwnsRecordRef.current = false;
      }
      return;
    }
    const fields = draftFieldsRef.current;
    writeEpisodeDraft({
      title: fields.title,
      date: fields.date,
      time: fields.time,
      description: fields.description,
      baseDescription: draftBaseDescriptionRef.current,
      participants: fields.participants,
      visibilityMode: fields.visibilityMode,
      visibility: fields.visibility,
      tag: fields.tag,
      eventLinkMode: fields.eventLinkMode,
      linkedEventId: fields.linkedEventId,
      newPhotoUris: fields.newPhotoUris,
      deletedPhotoIds: fields.deletedPhotoIds,
      editingEpisodeId: draftEpisodeIdRef.current,
      savedAt: Date.now(),
    });
    draftOwnsRecordRef.current = true;
  };

  const discardUncommittedPhotos = useCallback(() => {
    deletePersistedImages(
      newPhotoUrisRef.current.filter((uri) => !committedPhotoUrisRef.current.has(uri))
    );
  }, []);

  const prepareDraftSession = useCallback(() => {
    if (draftSessionPreparedRef.current) {
      draftSessionPreparedRef.current = false;
      draftSessionActiveRef.current = true;
      draftGateRef.current = 'ready';
      setDraftSessionActive(true);
      return;
    }
    const episodeId = editingEpisodeIdRef.current;
    draftEpisodeIdRef.current = episodeId;
    draftBaseDescriptionRef.current = draftFieldsRef.current.description;
    draftOriginRef.current = snapshotFromCurrentFields();
    draftSessionActiveRef.current = true;
    draftGateRef.current = 'ready';
    setDraftSessionActive(true);
    if (draftSuppressRef.current) {
      draftSuppressRef.current = false;
    }
  }, []);

  const restoreDraft = useCallback((draft: EpisodeDraft) => {
    setTitle(draft.title);
    setDate(draft.date);
    setTime(draft.time);
    setDescription(draft.description);
    setParticipants(draft.participants);
    const nextVisibility = toConnectedAudienceDrafts(draft.visibility, getMyself());
    const nextVisibilityMode =
      draft.visibilityMode === 'limited' && nextVisibility.length === 0
        ? 'private'
        : draft.visibilityMode;
    setVisibilityMode(nextVisibilityMode);
    setVisibility(nextVisibility);
    setTag(draft.tag);
    setEventLinkModeState(draft.eventLinkMode);
    setLinkedEventId(draft.linkedEventId);
    applyNewPhotoUris(draft.newPhotoUris);
    setDeletedPhotoIds(draft.deletedPhotoIds);
    // 基準は呼び出し側の空フォーム、または保存済み内容のままにする。
    // 復元した未保存の入力も、キャンセル時の破棄確認の対象にする。
    draftGateRef.current = 'ready';
    draftOwnsRecordRef.current = true;
  }, [applyNewPhotoUris]);

  const armRestoredNewDraft = useCallback(
    (draft: EpisodeDraft) => {
      reset();
      draftOriginRef.current = { ...baselineRef.current };
      draftBaseDescriptionRef.current = '';
      draftEpisodeIdRef.current = null;
      draftGateRef.current = 'ready';
      draftOwnsRecordRef.current = true;
      draftSessionPreparedRef.current = true;
      restoreDraft(draft);
    },
    [reset, restoreDraft]
  );

  const armRestoredEditDraft = useCallback(
    (episode: Episode, draft: EpisodeDraft) => {
      loadFromEpisode(episode);
      draftOriginRef.current = { ...baselineRef.current };
      draftBaseDescriptionRef.current = episode.description;
      draftEpisodeIdRef.current = episode.id;
      draftGateRef.current = 'ready';
      draftOwnsRecordRef.current = true;
      draftSessionPreparedRef.current = true;
      restoreDraft(draft);
    },
    [loadFromEpisode, restoreDraft]
  );

  const declineDraft = useCallback((draft: EpisodeDraft) => {
    deleteEpisodeDraft(draft.editingEpisodeId, draft.newPhotoUris);
    draftGateRef.current = 'ready';
    draftOwnsRecordRef.current = false;
  }, []);

  const flushDraft = useCallback(() => {
    stopDraftTimer();
    if (draftSessionActiveRef.current && draftGateRef.current === 'ready') {
      persistDraftNow();
    }
    draftSessionActiveRef.current = false;
    setDraftSessionActive(false);
  }, []);

  const forgetDraft = useCallback(() => {
    stopDraftTimer();
    draftSessionActiveRef.current = false;
    draftGateRef.current = 'ready';
    draftOwnsRecordRef.current = false;
    setDraftSessionActive(false);
    forgetEpisodeDraft(draftEpisodeIdRef.current);
  }, []);

  const requestDismiss = useCallback(
    (onDismiss: () => void) => {
      if (draftGateRef.current === 'pending') {
        return;
      }
      if (!isDirtyRef.current) {
        flushDraft();
        onDismiss();
        return;
      }
      if (dismissPromptRef.current) {
        return;
      }
      dismissPromptRef.current = true;
      const releasePrompt = () => {
        dismissPromptRef.current = false;
      };
      Alert.alert('変更を破棄しますか？', undefined, [
        { text: '編集を続ける', style: 'cancel', onPress: releasePrompt },
        {
          text: '破棄する',
          style: 'destructive',
          onPress: () => {
            releasePrompt();
            stopDraftTimer();
            draftSessionActiveRef.current = false;
            setDraftSessionActive(false);
            discardUncommittedPhotos();
            draftOwnsRecordRef.current = false;
            forgetEpisodeDraft(draftEpisodeIdRef.current);
            onDismiss();
          },
        },
      ], { cancelable: true, onDismiss: releasePrompt });
    },
    [discardUncommittedPhotos, flushDraft]
  );

  const photoDraftSig = `${newPhotoUris.join('\n')}#${deletedPhotoIds.join(',')}`;
  const photoDraftSigRef = useRef(photoDraftSig);

  useEffect(() => {
    if (!draftSessionActive || draftGateRef.current !== 'ready') {
      return;
    }
    const photosChanged = photoDraftSigRef.current !== photoDraftSig;
    photoDraftSigRef.current = photoDraftSig;
    stopDraftTimer();
    if (photosChanged) {
      persistDraftNow();
      return;
    }
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      persistDraftNow();
    }, 300);
    return () => {
      stopDraftTimer();
    };
  }, [
    draftSessionActive,
    photoDraftSig,
    title,
    date,
    time,
    description,
    participants,
    visibilityMode,
    visibility,
    tag,
    eventLinkMode,
    linkedEventId,
  ]);

  return {
    editingEpisodeId,
    setEditingEpisodeId,
    linkedEventId,
    setLinkedEventId,
    eventLinkMode,
    setEventLinkMode,
    linkToEvent,
    prefillFromEvent,
    tag,
    setTag,
    allowedEventDateRange,
    episodeDateMinimumDate,
    episodeDateMaximumDate,
    linkedEventDateKeys,
    isLinkedEventSingleDay,
    title,
    setTitle,
    date,
    setDate,
    time,
    setTime,
    showDatePicker,
    setShowDatePicker,
    showTimePicker,
    setShowTimePicker,
    description,
    setDescription,
    participants,
    visibilityMode,
    setVisibilityMode,
    visibility,
    setVisibility,
    formError,
    formErrorField,
    formErrorTick,
    setFormError,
    visibleExistingPhotos,
    newPhotoUris,
    isPhotoLimitReached,
    remainingPhotoSlots,
    photoLibraryVisible,
    photoResolving,
    dismissedPhotoAssetIds,
    closePhotoLibrary,
    beginPhotoEdits,
    selectPhotoEdit,
    photoEditPreviews,
    photoEditIndex,
    friendNameById,
    selectorFriends,
    connectedAudienceFriends,
    refreshAudienceConnections,
    excludeSelfId,
    recentTogetherFriendIds,
    addParticipantFriend,
    removeParticipant,
    removeVisibility,
    selectorVisible,
    selectorTarget,
    selectorTab,
    setSelectorTab,
    selectorNameFilter,
    setSelectorNameFilter,
    selectorAffiliationFilter,
    setSelectorAffiliationFilter,
    selectorExperienceFilter,
    setSelectorExperienceFilter,
    selectedIndividualIds,
    selectedGroupValues,
    reset,
    isDirty,
    discardUncommittedPhotos,
    requestDismiss,
    prepareDraftSession,
    restoreDraft,
    declineDraft,
    armRestoredNewDraft,
    armRestoredEditDraft,
    flushDraft,
    forgetDraft,
    loadFromEpisode,
    buildSavePayload,
    openParticipantSelector,
    openVisibilitySelector,
    handleSelectorCancel,
    handleSelectorConfirm,
    toggleSelectorIndividual,
    toggleSelectorGroup,
    pickPhoto,
    photoCropUri,
    cancelPhotoCrop,
    confirmPhotoCrop,
    removeExistingPhoto,
    removeNewPhoto,
    persistPhotos,
  };
}
