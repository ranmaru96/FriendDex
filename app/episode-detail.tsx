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
import { Ionicons } from '@expo/vector-icons';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { EpisodeListCard, episodeDetailTopBarButtonStyles } from '@/components/episode/EpisodeListCard';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';

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
  canManageEpisode,
  resolveEpisodeRecordOwnerId,
  visibilityDisplayLabels,
} from '../utils/episodeHelpers';

const LIST_HORIZONTAL_INSET = 12;
const PHOTO_GAP = 6;
const DETAIL_SECTION_INSET = 12;

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

export default function EpisodeDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ episodeId?: string; ownerId?: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [photos, setPhotos] = useState<EpisodePhoto[]>([]);
  const [photoSizes, setPhotoSizes] = useState<Record<string, PhotoDimensions>>({});
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [friendNameById, setFriendNameById] = useState<Map<string, string>>(new Map());
  const [friendPhotoById, setFriendPhotoById] = useState<Map<string, string | null>>(new Map());
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
    setFriendPhotoById(new Map(friends.map((f) => [f.id, f.photoUri ?? null])));

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
  const basePhotoHeight = useMemo(() => (photoAreaWidth * 3) / 4, [photoAreaWidth]);
  const hasDescription = Boolean(episode?.description.trim());
  const hasPhotos = photos.length > 0;

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
      params: { editEpisodeId: episodeId, ownerId: recordOwnerId },
    });
  };

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
      <SafeAreaView style={styles.safeArea}>
        <ScreenTopBar onBack={() => router.back()} />
        <View style={styles.missingContainer}>
          <Text style={styles.missingText}>エピソードが見つかりませんでした。</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenTopBar
        onBack={() => router.back()}
        right={
          canManage ? (
            <View style={episodeDetailTopBarButtonStyles.actions}>
              <Pressable
                style={episodeDetailTopBarButtonStyles.button}
                onPress={handleEdit}
                accessibilityLabel="編集"
                hitSlop={8}
              >
                <Ionicons name="pencil-outline" size={18} color={Theme.topBarText} />
              </Pressable>
              <Pressable
                style={[episodeDetailTopBarButtonStyles.button, episodeDetailTopBarButtonStyles.buttonDanger]}
                onPress={handleDelete}
                accessibilityLabel="削除"
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color="#fca5a5" />
              </Pressable>
            </View>
          ) : null
        }
      />
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.detailPanel}>
          <EpisodeListCard
            embedded
            title={episode.title}
            date={episode.date}
            episodeTag={episode.tag}
            chips={chips}
            visibility={visibility}
            visibilityMode={episode.visibilityMode}
          />

          {hasDescription ? (
            <>
              <View style={styles.sectionDivider} />
              <View style={styles.detailSection}>
                <Text style={styles.descriptionText}>{episode.description}</Text>
              </View>
            </>
          ) : null}

          {hasPhotos ? (
            <>
              <View style={styles.sectionDivider} />
              <View style={styles.detailSection}>
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
            </>
          ) : null}

          <View style={styles.sectionDivider} />
          <View style={styles.detailSection}>
            <Text style={styles.privateMemoLabel}>非公開メモ</Text>
            <Text style={styles.privateMemoPlaceholder}>非公開メモ（近日実装予定）</Text>
          </View>
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
    backgroundColor: Theme.screenBase,
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: LIST_HORIZONTAL_INSET,
    paddingTop: 8,
    paddingBottom: 32,
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
    backgroundColor: Theme.bgSurface,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.inputBorder,
    marginHorizontal: DETAIL_SECTION_INSET,
  },
  detailSection: {
    paddingHorizontal: DETAIL_SECTION_INSET,
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
    borderRadius: Radius.md,
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
