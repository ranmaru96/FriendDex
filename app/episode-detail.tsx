import { useCallback, useEffect, useMemo, useState } from 'react';
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

import {
  deleteEpisode,
  getAllFriends,
  getEpisodeById,
  getEpisodePhotos,
  getMyself,
  initializeDatabase,
} from '../db';
import { Episode, EpisodePhoto } from '../types';
import {
  buildParticipantChips,
  getVisibilityModeLabel,
  visibilityDisplayLabels,
  visibilityModeTagStyles,
} from '../utils/episodeHelpers';

const LIST_HORIZONTAL_INSET = 12;
const PHOTO_GAP = 6;

type PhotoDimensions = {
  width: number;
  height: number;
};

const PHOTO_FALLBACK_SIZE: PhotoDimensions = {
  width: 4,
  height: 5,
};

const resolvePhotoSize = (uri: string): Promise<PhotoDimensions> =>
  new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) {
          resolve({ width, height });
          return;
        }
        resolve(PHOTO_FALLBACK_SIZE);
      },
      () => resolve(PHOTO_FALLBACK_SIZE)
    );
  });

const getWidthForFixedHeight = (targetHeight: number, size?: PhotoDimensions): number => {
  const width = size?.width ?? PHOTO_FALLBACK_SIZE.width;
  const height = size?.height ?? PHOTO_FALLBACK_SIZE.height;
  return targetHeight * (width / height);
};

const formatEpisodeDateForCard = (date: string): string => {
  if (!date.trim()) return '-';
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '-';
  const [, month, day] = parts;
  return `${month}月${day}日`;
};

export default function EpisodeDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ episodeId?: string; ownerId?: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [photos, setPhotos] = useState<EpisodePhoto[]>([]);
  const [photoSizes, setPhotoSizes] = useState<Record<string, PhotoDimensions>>({});
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [friendNameById, setFriendNameById] = useState<Map<string, string>>(new Map());
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const episodeId = useMemo(() => {
    if (Array.isArray(params.episodeId)) return params.episodeId[0] ?? '';
    return params.episodeId ?? '';
  }, [params.episodeId]);

  const ownerId = useMemo(() => {
    if (Array.isArray(params.ownerId)) return params.ownerId[0] ?? '';
    return params.ownerId ?? '';
  }, [params.ownerId]);

  const photoAreaWidth = Dimensions.get('window').width - LIST_HORIZONTAL_INSET * 2;

  const loadData = useCallback(() => {
    initializeDatabase();
    setMyselfId(getMyself());
    const friends = getAllFriends();
    setFriendNameById(new Map(friends.map((f) => [f.id, f.name])));

    if (!episodeId || !ownerId) {
      setEpisode(null);
      setPhotos([]);
      return;
    }

    setEpisode(getEpisodeById(ownerId, episodeId));
    setPhotos(getEpisodePhotos(episodeId));
  }, [episodeId, ownerId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (photos.length === 0) {
      return;
    }

    let active = true;
    const missingPhotos = photos.filter((photo) => !photoSizes[photo.photoUri]);
    if (missingPhotos.length === 0) {
      return;
    }

    Promise.all(
      missingPhotos.map(async (photo) => [photo.photoUri, await resolvePhotoSize(photo.photoUri)] as const)
    ).then((entries) => {
      if (!active) {
        return;
      }
      setPhotoSizes((prev) => {
        const next = { ...prev };
        entries.forEach(([uri, size]) => {
          next[uri] = size;
        });
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [photoSizes, photos]);

  const chips = useMemo(
    () => (episode ? buildParticipantChips(episode, friendNameById) : []),
    [episode, friendNameById]
  );
  const visibility = useMemo(
    () => (episode ? visibilityDisplayLabels(episode, friendNameById) : []),
    [episode, friendNameById]
  );
  const modeStyles = episode ? visibilityModeTagStyles(episode.visibilityMode) : null;
  const showParticipantRow = chips.length > 0;
  const showVisibilityTargets =
    episode?.visibilityMode === 'limited' && visibility.length > 0;
  const isOwner = myselfId !== null && episode?.authorFriendId === myselfId;
  const basePhotoHeight = useMemo(() => (photoAreaWidth * 3) / 4, [photoAreaWidth]);

  const renderPhotoFrame = (photo: EpisodePhoto, index: number) => (
    <Pressable
      key={photo.id}
      style={[
        styles.photoFrame,
        index > 0 ? styles.photoFrameSpaced : null,
        {
          width: getWidthForFixedHeight(basePhotoHeight, photoSizes[photo.photoUri]),
          height: basePhotoHeight,
        },
      ]}
      onPress={() => setLightboxPhoto(photo.photoUri)}
    >
      <Image source={{ uri: photo.photoUri }} style={styles.photoImage} resizeMode="contain" />
    </Pressable>
  );

  const handleEdit = () => {
    router.push({
      pathname: '/episode',
      params: { editEpisodeId: episodeId, ownerId },
    });
  };

  const handleDelete = () => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const deleted = deleteEpisode(ownerId, episodeId);
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.missingContainer}>
          <Pressable style={styles.backRow} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.missingText}>エピソードが見つかりませんでした。</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>

        <View style={styles.headerCard}>
          <View style={styles.episodeCardRow1}>
            <View style={styles.titlePill}>
              <Text style={styles.titlePillText} numberOfLines={1}>
                {episode.title || '-'}
              </Text>
            </View>
            <Text style={styles.episodeCardDateText}>{formatEpisodeDateForCard(episode.date)}</Text>
            <View style={styles.headerRightCol}>
              {modeStyles ? (
                <View style={[styles.episodeParticipantTag, styles.visibilityModeTag, modeStyles.tag]}>
                  <Text style={[styles.episodeParticipantTagName, modeStyles.text]}>
                    {getVisibilityModeLabel(episode.visibilityMode)}
                  </Text>
                </View>
              ) : null}
              {isOwner ? (
                <View style={styles.episodeCardActions}>
                  <Pressable style={styles.episodeCardEditButton} onPress={handleEdit}>
                    <Text style={styles.episodeCardEditButtonText}>編集</Text>
                  </Pressable>
                  <Pressable style={styles.episodeCardDeleteButton} onPress={handleDelete}>
                    <Text style={styles.episodeCardDeleteButtonText}>削除</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
          {showParticipantRow ? (
            <View style={styles.episodeCardRow2}>
              <View style={styles.episodeParticipantTagWrap}>
                {chips.map((p) => (
                  <View
                    key={p.id}
                    style={[styles.episodeParticipantTag, p.isMain && styles.episodeParticipantTagMain]}
                  >
                    <Text style={styles.episodeParticipantTagName}>{p.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {showVisibilityTargets ? (
            <View style={styles.visibilityTargetsRow}>
              <Text style={styles.visibilityLabelFixed}>公開先：</Text>
              <Text style={styles.visibilityTargetsText}>{visibility.join('、')}</Text>
            </View>
          ) : null}
        </View>

        {episode.description.trim().length > 0 ? (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionText}>{episode.description}</Text>
          </View>
        ) : null}

        {photos.length > 0 ? (
          <View style={styles.photoSection}>
            <View style={[styles.photoViewport, { height: basePhotoHeight }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoScrollContent}
              >
                {photos.map((photo, index) => renderPhotoFrame(photo, index))}
              </ScrollView>
            </View>
          </View>
        ) : null}

        <View style={styles.privateMemoSection}>
          <Text style={styles.privateMemoLabel}>非公開メモ</Text>
          <Text style={styles.privateMemoPlaceholder}>非公開メモ（近日実装予定）</Text>
        </View>
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
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2f5f8',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: LIST_HORIZONTAL_INSET,
    paddingBottom: 32,
  },
  backRow: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  backText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#334155',
    lineHeight: 26,
  },
  missingContainer: {
    flex: 1,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
    paddingTop: 8,
    gap: 12,
  },
  missingText: {
    fontSize: 15,
    color: '#334155',
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  episodeCardRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  episodeCardRow2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titlePill: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  titlePillText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  episodeCardDateText: {
    fontSize: 12,
    color: '#64748b',
    flexShrink: 0,
  },
  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  episodeCardActions: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
  },
  visibilityModeTag: {
    borderWidth: 1,
  },
  episodeCardEditButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeCardEditButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  episodeCardDeleteButton: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeCardDeleteButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
  },
  episodeParticipantTagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 6,
  },
  episodeParticipantTag: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodeParticipantTagMain: {
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
  },
  episodeParticipantTagName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  visibilityTargetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  visibilityLabelFixed: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  visibilityTargetsText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  descriptionSection: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 22,
  },
  photoSection: {
    marginBottom: 12,
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
    backgroundColor: '#000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
  },
  photoFrameSpaced: {
    marginLeft: PHOTO_GAP,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  privateMemoSection: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  privateMemoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  privateMemoPlaceholder: {
    fontSize: 14,
    color: '#94a3b8',
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
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  lightboxCloseButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
