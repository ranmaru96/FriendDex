import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { EpisodeListCard, episodeDetailTopBarButtonStyles } from '@/components/episode/EpisodeListCard';
import { EpisodeFormOverlay } from '@/components/episode/EpisodeFormOverlay';
import { EpisodeEventLinkModal } from '@/components/episode/EpisodeEventLinkModal';
import type { Option } from '@/components/episode/types';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';
import { Panel, PanelSection, SectionDivider } from '@/components/ui/Panel';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  contentMutedTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { useEpisodeForm } from '@/hooks/useEpisodeForm';
import { useBottomNavScrollClearance } from '@/hooks/useBottomNavScrollClearance';

import {
  deleteEpisode,
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeById,
  getEpisodePhotos,
  getEvent,
  getMergedEpisodeTagLabels,
  getMyself,
  initializeDatabase,
  updateEpisode,
} from '../db';
import { Episode, EpisodePhoto, Event, Friend } from '../types';
import {
  buildParticipantChips,
  canManageEpisode,
  resolveEpisodeRecordOwnerId,
  visibilityDisplayLabels,
} from '../utils/episodeHelpers';
import {
  applyEventIdToEpisode,
  buildEpisodeEventLinkInput,
  createEventAndLinkEpisode,
  EVENT_CREATE_FAILED_MESSAGE,
  runEpisodeEventLinkFlow,
} from '../utils/episodeEventLinking';
import type { EpisodeEventMatch } from '../utils/eventEpisodeSync';
import { formatEventScheduleLabel } from '../utils/eventHelpers';

const LIST_HORIZONTAL_INSET = 12;
const PHOTO_GAP = 6;
/** 2枚以上のとき、右端に次の写真を覗かせる幅 */
const PHOTO_PEEK = 28;

export default function EpisodeDetailScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const content = useContentColors();
  const bottomNavClearance = useBottomNavScrollClearance();
  const params = useLocalSearchParams<{ episodeId?: string; ownerId?: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [parentEvent, setParentEvent] = useState<Event | null>(null);
  const [photos, setPhotos] = useState<EpisodePhoto[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [friendNameById, setFriendNameById] = useState<Map<string, string>>(new Map());
  const [friendPhotoById, setFriendPhotoById] = useState<Map<string, string | null>>(new Map());
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [episodeTagOptions, setEpisodeTagOptions] = useState<Option[]>([]);
  const [isEditVisible, setIsEditVisible] = useState(false);
  const [editLinkModalVisible, setEditLinkModalVisible] = useState(false);
  const [editLinkCandidates, setEditLinkCandidates] = useState<EpisodeEventMatch[]>([]);
  const [editLinkTarget, setEditLinkTarget] = useState<{ episode: Episode; authorId: string } | null>(
    null
  );

  const hiddenParticipantIds = useMemo(() => (myselfId ? [myselfId] : []), [myselfId]);
  const episodeForm = useEpisodeForm({ friends, hiddenParticipantIds });

  const episodeId = useMemo(() => {
    if (Array.isArray(params.episodeId)) return params.episodeId[0] ?? '';
    return params.episodeId ?? '';
  }, [params.episodeId]);

  const ownerId = useMemo(() => {
    if (Array.isArray(params.ownerId)) return params.ownerId[0] ?? '';
    return params.ownerId ?? '';
  }, [params.ownerId]);

  const photoContentWidth = useMemo(() => {
    const panelWidth = Dimensions.get('window').width;
    return Math.max(0, panelWidth - Spacing.md * 2);
  }, []);

  const loadData = useCallback(() => {
    initializeDatabase();
    setMyselfId(getMyself());
    const allFriends = getAllFriends();
    setFriends(allFriends);
    setFriendNameById(new Map(allFriends.map((f) => [f.id, f.name])));
    setFriendPhotoById(new Map(allFriends.map((f) => [f.id, f.photoUri ?? null])));
    setAffiliationOptions(getDistinctAffiliations().map((v) => ({ label: v, value: v })));
    setExperienceOptions(getDistinctExperiences().map((v) => ({ label: v, value: v })));
    setEpisodeTagOptions(getMergedEpisodeTagLabels().map((v) => ({ label: v, value: v })));

    if (!episodeId || !ownerId) {
      setEpisode(null);
      setParentEvent(null);
      setPhotos([]);
      return;
    }

    const loaded = getEpisodeById(ownerId, episodeId);
    setEpisode(loaded);
    const linkedEventId = loaded?.eventId?.trim();
    setParentEvent(linkedEventId ? getEvent(linkedEventId) : null);
    setPhotos(getEpisodePhotos(episodeId));
  }, [episodeId, ownerId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const chips = useMemo(
    () =>
      episode
        ? buildParticipantChips(episode, friendNameById, {
            excludeFriendIds: myselfId ? [myselfId] : [],
            friendPhotoById,
          })
        : [],
    [episode, friendNameById, friendPhotoById, myselfId]
  );
  const visibility = useMemo(
    () => (episode ? visibilityDisplayLabels(episode, friendNameById) : []),
    [episode, friendNameById]
  );
  const canManage =
    episode && ownerId ? canManageEpisode(episode, ownerId, myselfId) : false;
  const recordOwnerId = episode ? resolveEpisodeRecordOwnerId(episode, ownerId) : ownerId;
  const photoFrameWidth = useMemo(
    () => (photos.length > 1 ? Math.max(0, photoContentWidth - PHOTO_PEEK) : photoContentWidth),
    [photoContentWidth, photos.length]
  );
  const photoFrameHeight = useMemo(() => (photoFrameWidth * 3) / 4, [photoFrameWidth]);
  const hasDescription = Boolean(episode?.description.trim());
  const hasPhotos = photos.length > 0;

  const renderPhotoFrame = (photo: EpisodePhoto, index: number) => (
    <Pressable
      key={photo.id}
      style={[
        styles.photoFrame,
        index > 0 ? styles.photoFrameSpaced : null,
        {
          width: photoFrameWidth,
          height: photoFrameHeight,
        },
      ]}
      onPress={() => setLightboxPhoto(photo.photoUri)}
    >
      <Image source={{ uri: photo.photoUri }} style={styles.photoImage} resizeMode="cover" />
    </Pressable>
  );

  const handleEdit = () => {
    if (!episode) {
      return;
    }
    episodeForm.loadFromEpisode(episode);
    setIsEditVisible(true);
  };

  const handleCloseEdit = useCallback(() => {
    episodeForm.reset();
    setIsEditVisible(false);
  }, [episodeForm]);

  const handleSaveEdit = useCallback(() => {
    if (!myselfId) {
      episodeForm.setFormError('本人が設定されていません。');
      return;
    }
    const editingId = episodeForm.editingEpisodeId;
    if (!editingId) {
      return;
    }
    const payload = episodeForm.buildSavePayload();
    if (!payload) {
      return;
    }
    const updated = updateEpisode(myselfId, editingId, payload);
    if (!updated) {
      episodeForm.setFormError('エピソードの更新に失敗しました。');
      return;
    }
    episodeForm.persistPhotos(editingId, true);
    episodeForm.reset();
    setIsEditVisible(false);
    loadData();
  }, [episodeForm, loadData, myselfId]);

  const finishEditEpisodeLink = useCallback(
    (eventId: string) => {
      if (!editLinkTarget) {
        return;
      }
      const ok = applyEventIdToEpisode(editLinkTarget.episode, editLinkTarget.authorId, eventId);
      if (!ok) {
        Alert.alert('エラー', '予定への紐づけに失敗しました。');
        return;
      }
      episodeForm.linkToEvent(eventId);
      setEditLinkModalVisible(false);
      setEditLinkCandidates([]);
      setEditLinkTarget(null);
      loadData();
    },
    [editLinkTarget, episodeForm, loadData]
  );

  const handleEditLinkCancel = useCallback(() => {
    setEditLinkModalVisible(false);
    setEditLinkCandidates([]);
    setEditLinkTarget(null);
  }, []);

  const handleEditLinkCreateNew = useCallback(() => {
    if (!editLinkTarget) {
      return;
    }
    createEventAndLinkEpisode(
      buildEpisodeEventLinkInput(editLinkTarget.episode),
      finishEditEpisodeLink,
      () => Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE)
    );
  }, [editLinkTarget, finishEditEpisodeLink]);

  const handleLinkToEvent = useCallback(() => {
    const editingId = episodeForm.editingEpisodeId;
    if (!editingId || !myselfId) {
      return;
    }
    const target = getEpisodeById(myselfId, editingId);
    if (!target) {
      Alert.alert('エラー', 'エピソードが見つかりません。');
      return;
    }
    const authorId = resolveEpisodeRecordOwnerId(target, myselfId);
    runEpisodeEventLinkFlow(buildEpisodeEventLinkInput(target), {
      onLinked: (eventId) => {
        const ok = applyEventIdToEpisode(target, authorId, eventId);
        if (!ok) {
          Alert.alert('エラー', '予定への紐づけに失敗しました。');
          return;
        }
        episodeForm.linkToEvent(eventId);
        loadData();
      },
      onMultipleMatches: (matches) => {
        setEditLinkTarget({ episode: target, authorId });
        setEditLinkCandidates(matches);
        setEditLinkModalVisible(true);
      },
      onEventCreateFailed: () => Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE),
    });
  }, [episodeForm, loadData, myselfId]);

  const handleDelete = () => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const deleted = deleteEpisode(recordOwnerId, episodeId);
          if (!deleted) {
            Alert.alert('エラー', 'エピソードの削除に失敗しました。');
            return;
          }
          router.back();
        },
      },
    ]);
  };

  if (!episode) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
        <ScreenTopBar onBack={() => router.back()} />
        <View style={styles.missingContainer}>
          <Text style={[styles.missingText, contentMutedTextStyle(content)]}>エピソードが見つかりませんでした。</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}>
        <ScreenTopBar
          title="エピソード"
          onBack={() => router.back()}
          right={
            canManage ? (
              <Pressable
                style={episodeDetailTopBarButtonStyles.button}
                onPress={handleEdit}
                accessibilityLabel="編集"
                hitSlop={8}
              >
                <Ionicons name="pencil-outline" size={18} color={kit.topBarText} />
              </Pressable>
            ) : null
          }
        />
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={[
            styles.mainScrollContent,
            styles.mainScrollContentPreview,
            bottomNavClearance > 0 ? { paddingBottom: bottomNavClearance } : null,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Panel
            style={[
              styles.detailPanel,
              styles.detailPanelPreview,
            ]}
          >
            <EpisodeListCard
              embedded
              titleMultiline
              title={episode.title}
              date={episode.date}
              episodeTag={episode.tag}
              chips={chips}
              visibility={visibility}
              visibilityMode={episode.visibilityMode}
              style={styles.episodeHeaderPreview}
            />

            {parentEvent ? (
              <>
                <SectionDivider />
                <PanelSection style={styles.detailSection}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/event',
                        params: { eventId: parentEvent.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="所属する予定を開く"
                  >
                    <Text style={[styles.parentEventLabel, contentMutedTextStyle(content)]}>
                      予定
                    </Text>
                    <Text style={[styles.parentEventTitle, contentTextStyle(content)]}>
                      {parentEvent.title.trim() || '（無題）'}
                    </Text>
                    <Text style={[styles.parentEventMeta, contentMutedTextStyle(content)]}>
                      {formatEventScheduleLabel(parentEvent)}
                    </Text>
                  </Pressable>
                </PanelSection>
              </>
            ) : null}

            {hasDescription ? (
              <>
                <SectionDivider />
                <PanelSection style={styles.detailSection}>
                  <Text style={[styles.descriptionText, contentTextStyle(content)]}>{episode.description}</Text>
                </PanelSection>
              </>
            ) : null}

            {hasPhotos ? (
              <>
                <SectionDivider />
                <PanelSection style={styles.detailSection}>
                  <View style={[styles.photoViewport, { height: photoFrameHeight }]}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photoScrollContent}
                    >
                      {photos.map((photo, index) => renderPhotoFrame(photo, index))}
                    </ScrollView>
                  </View>
                </PanelSection>
              </>
            ) : null}

            <SectionDivider />
            <PanelSection style={styles.detailSection}>
              <Text style={[styles.privateMemoLabel, contentTextStyle(content)]}>非公開メモ</Text>
              <Text style={[styles.privateMemoPlaceholder, contentMutedTextStyle(content)]}>非公開メモ（近日実装予定）</Text>
            </PanelSection>
          </Panel>

          {canManage ? (
            <Pressable
              style={styles.deleteLinkWrap}
              onPress={handleDelete}
              accessibilityLabel="エピソードを削除"
              hitSlop={8}
            >
              <Text style={styles.deleteLinkText}>エピソードを削除</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Modal
          transparent
          animationType="fade"
          visible={lightboxPhoto !== null}
          onRequestClose={() => setLightboxPhoto(null)}
        >
          <View style={styles.lightboxBackdrop}>
            <Pressable style={styles.lightboxBackdropPress} onPress={() => setLightboxPhoto(null)} />
            {lightboxPhoto ? (
              <Image source={{ uri: lightboxPhoto }} style={styles.lightboxImage} resizeMode="contain" />
            ) : null}
            <Pressable style={styles.lightboxCloseButton} onPress={() => setLightboxPhoto(null)}>
              <Text style={styles.lightboxCloseButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </Modal>
      </SafeAreaView>

      <EpisodeFormOverlay
        visible={isEditVisible}
        form={episodeForm}
        friends={friends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        episodeTagOptions={episodeTagOptions}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
        onLinkToEvent={handleLinkToEvent}
      />

      <EpisodeEventLinkModal
        visible={editLinkModalVisible}
        dateKey={editLinkTarget?.episode.date ?? ''}
        candidates={editLinkCandidates}
        onSelect={finishEditEpisodeLink}
        onCreateNew={handleEditLinkCreateNew}
        onCancel={handleEditLinkCancel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {},
  mainScrollContentPreview: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  missingContainer: {
    flex: 1,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
    paddingTop: 24,
    justifyContent: 'center',
  },
  missingText: {
    fontSize: 15,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  detailPanel: {
    overflow: 'hidden',
  },
  detailPanelPreview: {
    borderWidth: 0,
    borderRadius: 0,
  },
  episodeHeaderPreview: {
    paddingTop: 14,
  },
  parentEventLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  parentEventTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  parentEventMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  detailSection: {
    paddingVertical: 10,
  },
  descriptionText: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 22,
  },
  photoViewport: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  photoScrollContent: {
    alignItems: 'center',
    minHeight: '100%',
  },
  photoFrame: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: Theme.textPrimary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    overflow: 'hidden',
  },
  photoFrameSpaced: {
    marginLeft: PHOTO_GAP,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: Theme.textPrimary,
  },
  privateMemoLabel: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  privateMemoPlaceholder: {
    fontSize: 14,
    color: '#94a3b8',
  },
  deleteLinkWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.55)',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
  },
  deleteLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f87171',
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 48,
  },
  lightboxBackdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
  lightboxCloseButton: {
    position: 'absolute',
    top: 52,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  lightboxCloseButtonText: {
    color: Theme.bgSurface,
    fontSize: 14,
    fontWeight: '700',
  },
});
