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

import {
  deleteEpisode,
  getAllFriends,
  getEpisodeById,
  getEpisodePhotos,
  getMyself,
  initializeDatabase,
} from '../db';
import { Episode, EpisodePhoto } from '../types';
import { buildParticipantChips, visibilityDisplayLabels } from '../utils/episodeHelpers';

const LIST_HORIZONTAL_INSET = 12;

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

  const photoPageWidth = Dimensions.get('window').width - LIST_HORIZONTAL_INSET * 2;

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

  const chips = useMemo(
    () => (episode ? buildParticipantChips(episode, friendNameById) : []),
    [episode, friendNameById]
  );
  const visibility = useMemo(
    () => (episode ? visibilityDisplayLabels(episode, friendNameById) : []),
    [episode, friendNameById]
  );
  const showRow2 = chips.length > 0 || visibility.length > 0;
  const isOwner = myselfId !== null && episode?.authorFriendId === myselfId;

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
          {showRow2 ? (
            <View style={styles.episodeCardRow2}>
              {chips.length > 0 ? (
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
              ) : null}
              {visibility.length > 0 ? (
                <View style={styles.visibilityCol}>
                  <Text style={styles.visibilityLabelFixed}>公開先：</Text>
                  <View style={styles.visibilityPills}>
                    {visibility.map((label, vi) => (
                      <View key={`vis-${vi}-${label}`} style={styles.episodeParticipantTag}>
                        <Text style={styles.episodeParticipantTagName}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
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
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={photoPageWidth}
              snapToAlignment="start"
              contentContainerStyle={styles.photoScrollContent}
            >
              {photos.map((photo) => (
                <Pressable
                  key={photo.id}
                  style={[styles.photoPage, { width: photoPageWidth }]}
                  onPress={() => setLightboxPhoto(photo.photoUri)}
                >
                  <Image source={{ uri: photo.photoUri }} style={styles.photoImage} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
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
  episodeCardActions: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
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
  visibilityCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    maxWidth: '48%',
    flexShrink: 0,
  },
  visibilityLabelFixed: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  visibilityPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
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
  photoScrollContent: {
    alignItems: 'center',
  },
  photoPage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoImage: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
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
