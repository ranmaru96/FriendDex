import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { EpisodeFormOverlay } from '@/components/episode/EpisodeFormOverlay';
import type { Option } from '@/components/episode/types';
import { useEpisodeForm } from '@/hooks/useEpisodeForm';
import { afterEpisodeSavedLocally, guardEpisodeShareOnline } from '@/lib/episodeShareSave';
import {
  createEpisode,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMergedEpisodeTagLabels,
  getMyself,
  initializeDatabase,
} from '@/db';
import type { Friend } from '@/types';
import {
  EVENT_CREATE_FAILED_MESSAGE,
  resolveEpisodeSaveEventId,
} from '@/utils/episodeEventLinking';
import { registerSavedEpisodeTag } from '@/utils/episodeTagMaster';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';

const parseRouteParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? '';
  }
  return value?.trim() ?? '';
};

const toOptions = (values: string[]): Option[] => values.map((value) => ({ label: value, value }));

/**
 * 予定詳細の上に載せるエピソード追加。
 * パスに event を含め、予定編集と同じくカレンダーのヘッダーと下部ナビを残す。
 */
export default function EventEpisodeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const eventId = parseRouteParam(params.eventId);
  const [boot] = useState(() => {
    initializeDatabase();
    return {
      myselfId: getMyself(),
      friends: getAllFriendsInDefaultOrder(),
      affiliationOptions: toOptions(getDistinctAffiliations()),
      experienceOptions: toOptions(getDistinctExperiences()),
      episodeTagOptions: toOptions(getMergedEpisodeTagLabels()),
    };
  });
  const [friends, setFriends] = useState<Friend[]>(boot.friends);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLockRef = useRef(false);
  const savingRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const openedRef = useRef(false);
  const myselfId = boot.myselfId;
  const hiddenParticipantIds = useMemo(() => (myselfId ? [myselfId] : []), [myselfId]);
  const episodeForm = useEpisodeForm({
    friends,
    hiddenParticipantIds,
  });
  const prefillFromEvent = episodeForm.prefillFromEvent;

  const releaseSaveLock = () => {
    saveLockRef.current = false;
    savingRef.current = false;
    setSaving(false);
  };

  const leave = useCallback(() => {
    allowLeaveRef.current = true;
    router.back();
  }, [router]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current) {
        return;
      }
      event.preventDefault();
      if (savingRef.current || !ready) {
        return;
      }
      episodeForm.requestDismiss(() => {
        allowLeaveRef.current = true;
        navigation.dispatch(event.data.action);
      });
    });
    return unsubscribe;
  }, [episodeForm.requestDismiss, navigation, ready]);

  useLayoutEffect(() => {
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    if (!myselfId) {
      Alert.alert('案内', '本人が設定されていません。', [{ text: 'OK', onPress: leave }]);
      return;
    }
    if (!eventId || !prefillFromEvent(eventId)) {
      Alert.alert('エラー', '予定が見つかりません。', [{ text: 'OK', onPress: leave }]);
      return;
    }
    setReady(true);
  }, [eventId, leave, myselfId, prefillFromEvent]);

  const handleSave = () => {
    if (saveLockRef.current) {
      return;
    }
    saveLockRef.current = true;
    savingRef.current = true;
    setSaving(true);
    if (!myselfId) {
      releaseSaveLock();
      episodeForm.setFormError('本人が設定されていません。');
      Alert.alert('エラー', '本人が設定されていません。');
      return;
    }
    const payload = episodeForm.buildSavePayload();
    if (!payload) {
      releaseSaveLock();
      return;
    }
    if (!guardEpisodeShareOnline(payload.visibilityMode)) {
      releaseSaveLock();
      return;
    }
    const resolved = resolveEpisodeSaveEventId(payload, () => {
      Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE);
      episodeForm.setFormError(EVENT_CREATE_FAILED_MESSAGE);
    });
    if (!resolved.ok) {
      releaseSaveLock();
      return;
    }
    const { createLinkedEvent: _createLinkedEvent, eventId: _formEventId, ...episodeFields } =
      payload;
    const created = createEpisode({
      ...episodeFields,
      eventId: resolved.eventId,
      pendingReview: false,
    });
    if (!created) {
      releaseSaveLock();
      episodeForm.setFormError('エピソードの追加に失敗しました。');
      Alert.alert('エラー', 'エピソードの追加に失敗しました。');
      return;
    }
    registerSavedEpisodeTag(episodeFields.tag);
    void (async () => {
      try {
        episodeForm.persistPhotos(created.id, false);
        await afterEpisodeSavedLocally(created.id);
      } finally {
        episodeForm.forgetDraft();
        episodeForm.reset();
        releaseSaveLock();
        leave();
      }
    })();
  };

  return (
    <View style={styles.root}>
      <EpisodeFormOverlay
        visible={ready}
        form={episodeForm}
        friends={friends}
        affiliationOptions={boot.affiliationOptions}
        experienceOptions={boot.experienceOptions}
        episodeTagOptions={boot.episodeTagOptions}
        onClose={leave}
        onSave={handleSave}
        saving={saving}
        onPersonCreated={() => setFriends(getAllFriendsInDefaultOrder())}
        presentation="modal"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
