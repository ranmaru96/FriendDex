import { useCallback, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { PHOTO_LIMITS } from '@/constants';
import {
  deleteEpisodePhoto,
  getEpisodeParticipantFriendIds,
  getEpisodePhotos,
  getEvent,
  getEventParticipants,
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
import { mergeParticipantEntries, normalizeEpisodeTag, normalizeEpisodeTime, toIndividualParticipantEntries } from '@/utils/episodeHelpers';
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

export function useEpisodeForm({
  friends,
  hiddenParticipantIds = [],
  implicitParticipantEntries = [],
}: UseEpisodeFormOptions) {
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [participants, setParticipants] = useState<EpisodeParticipantDraft[]>([]);
  const [visibilityMode, setVisibilityMode] = useState<EpisodeVisibilityMode>('private');
  const [visibility, setVisibility] = useState<EpisodeVisibilityDraft[]>([]);
  const [formError, setFormError] = useState('');
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
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<number[]>([]);
  const [linkedEventId, setLinkedEventId] = useState<string | null>(null);
  const [eventLinkMode, setEventLinkModeState] = useState<EpisodeEventLinkMode>('create_new');
  const [tag, setTag] = useState('');

  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTarget, setSelectorTarget] = useState<'participant' | 'visibility'>('participant');
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');

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
    // 保存されずに破棄された写真は実体も消す（DB 登録済みのものは残す）。
    deletePersistedImages(
      newPhotoUrisRef.current.filter((uri) => !committedPhotoUrisRef.current.has(uri))
    );
    committedPhotoUrisRef.current.clear();
    setFormError('');
    setEditingEpisodeId(null);
    setTitle('');
    setDate(formatEpisodeDateToYMD(new Date()));
    setTime('');
    setShowDatePicker(false);
    setShowTimePicker(false);
    setDescription('');
    setParticipants([]);
    setVisibilityMode('private');
    setVisibility([]);
    setPhotos([]);
    applyNewPhotoUris([]);
    setPhotoCropUri(null);
    setDeletedPhotoIds([]);
    setLinkedEventId(null);
    setEventLinkModeState('create_new');
    setTag('');
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, [applyNewPhotoUris]);

  const restoreSelectorFromParticipants = useCallback((drafts: EpisodeParticipantDraft[]) => {
    const individuals = new Set<string>();
    const groups = new Set<string>();
    drafts.forEach((participant) => {
      if (!participant.value.trim()) return;
      if (participant.participantType === 'individual') {
        individuals.add(participant.value);
      } else {
        groups.add(participant.value);
      }
    });
    setSelectedIndividualIds(individuals);
    setSelectedGroupValues(groups);
  }, []);

  const restoreSelectorFromVisibility = useCallback((entries: EpisodeVisibilityDraft[]) => {
    const individuals = new Set<string>();
    const groups = new Set<string>();
    entries.forEach((entry) => {
      if (!entry.value.trim()) return;
      if (entry.kind === 'individual') {
        individuals.add(entry.value);
      } else {
        groups.add(entry.value);
      }
    });
    setSelectedIndividualIds(individuals);
    setSelectedGroupValues(groups);
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
    restoreSelectorFromVisibility(visibility);
    setSelectorTarget('visibility');
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  }, [visibility, restoreSelectorFromVisibility]);

  const handleSelectorCancel = useCallback(() => {
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, []);

  const handleSelectorConfirm = useCallback(() => {
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
      });
      setParticipants(
        toIndividualParticipantEntries(expandedIds).map((entry) => ({
          participantType: 'individual' as const,
          value: entry.value,
        }))
      );
    } else {
      const nextVisibility: EpisodeVisibilityDraft[] = [];
      selectedIndividualIds.forEach((friendId) => {
        nextVisibility.push({ kind: 'individual', value: friendId });
      });
      selectedGroupValues.forEach((groupValue) => {
        nextVisibility.push({ kind: 'group', value: groupValue });
      });
      setVisibility(nextVisibility);
    }
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, [selectorTarget, selectedIndividualIds, selectedGroupValues]);

  const toggleSelectorIndividual = useCallback((friendId: string) => {
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
      const expandedFriendIds = getEpisodeParticipantFriendIds({
        participantEntries: episode.participantEntries ?? [],
      }).filter((friendId) => !hidden.has(friendId));
      const participantDrafts: EpisodeParticipantDraft[] = toIndividualParticipantEntries(
        expandedFriendIds
      ).map((entry) => ({
        participantType: 'individual' as const,
        value: entry.value,
      }));
      setEditingEpisodeId(episode.id);
      setTitle(episode.title);
      const eventId = episode.eventId?.trim() || null;
      setLinkedEventId(eventId);
      setEventLinkModeState(eventId ? 'existing' : 'none');
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
      setDate(nextDate);
      setTime(normalizeEpisodeTime(episode.time) ?? '');
      setDescription(episode.description);
      setParticipants(participantDrafts);
      setVisibilityMode(episode.visibilityMode);
      setVisibility(
        (episode.visibilityEntries ?? []).map((entry) => ({
          kind: entry.kind,
          value: entry.value,
        }))
      );
      setPhotos(getEpisodePhotos(episode.id));
      setNewPhotoUris([]);
      setPhotoCropUri(null);
      setDeletedPhotoIds([]);
      setFormError('');
      setShowDatePicker(false);
      setShowTimePicker(false);
      setTag(episode.tag ?? '');
    },
    [hiddenParticipantIds]
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
      setDate(keys[0] ?? today);
      setTime(event.allDay ? '' : formatTimeFromDate(new Date(event.startAt)));
      setTag(event.episodeTag ?? '');
      setDescription('');
      const myselfId = getMyself();
      const hidden = hiddenIdSet(hiddenParticipantIds);
      const friendIds = profileIdsToFriendIds(
        getEventParticipants(normalized).map((participant) => participant.profileId)
      ).filter((friendId) => !hidden.has(friendId) && friendId !== myselfId);
      setParticipants(
        friendIds.map((friendId) => ({
          participantType: 'individual' as const,
          value: friendId,
        }))
      );
      return true;
    },
    [hiddenParticipantIds, reset]
  );

  const buildSavePayload = useCallback((): EpisodeSavePayload | null => {
    const normalizedTitle = title.trim();
    const normalizedDate = date.trim();
    if (!normalizedTitle) {
      setFormError('タイトルを入力してください。');
      return null;
    }
    if (!normalizedDate) {
      setFormError('日付を選択してください。');
      return null;
    }
    if (normalizedDate > formatDateKey(new Date())) {
      setFormError('未来の日付は選択できません。');
      return null;
    }

    const participantEntries = toIndividualParticipantEntries(
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
      })
    );
    const visibilityEntries: EpisodeVisibilityEntry[] =
      visibilityMode === 'limited'
        ? visibility
            .filter((entry) => entry.value.trim().length > 0)
            .map((entry) => ({
              kind: entry.kind,
              value: entry.value.trim(),
            }))
        : [];

    setFormError('');
    const createLinkedEvent = eventLinkMode === 'create_new';
    const resolvedEventId =
      createLinkedEvent || eventLinkMode === 'none' ? null : linkedEventId?.trim() || null;
    if (eventLinkMode === 'existing' && !resolvedEventId) {
      setFormError('紐づける予定を選択してください。');
      return null;
    }
    return {
      title: normalizedTitle,
      date: normalizedDate,
      time: normalizeEpisodeTime(time),
      description: description.trim(),
      visibilityMode,
      participantEntries,
      visibilityEntries,
      tag: normalizeEpisodeTag(tag),
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
      setFormError('未来の予定にはエピソードを紐づけられません。');
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
  }, []);

  const pickPhoto = useCallback(async () => {
    if (isPhotoLimitReached) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoCropUri(result.assets[0].uri);
    }
  }, [isPhotoLimitReached]);

  const cancelPhotoCrop = useCallback(() => {
    setPhotoCropUri(null);
  }, []);

  const confirmPhotoCrop = useCallback(
    (croppedUri: string) => {
      applyNewPhotoUris([...newPhotoUrisRef.current, croppedUri]);
      setPhotoCropUri(null);
    },
    [applyNewPhotoUris]
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
      newPhotoUris.forEach((uri) => committedPhotoUrisRef.current.add(uri));
      if (isEdit) {
        deletedPhotoIds.forEach((id) => {
          deleteEpisodePhoto(id);
        });
        const existingCount = photos.filter((photo) => !deletedPhotoIds.includes(photo.id)).length;
        newPhotoUris.forEach((uri, index) => {
          insertEpisodePhoto(episodeId, uri, existingCount + index);
        });
        return;
      }
      newPhotoUris.forEach((uri, index) => {
        insertEpisodePhoto(episodeId, uri, index);
      });
    },
    [deletedPhotoIds, newPhotoUris, photos]
  );

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
    formError,
    setFormError,
    visibleExistingPhotos,
    newPhotoUris,
    isPhotoLimitReached,
    friendNameById,
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
