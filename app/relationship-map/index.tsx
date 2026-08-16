import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Radius, Spacing } from '@/constants/theme';
import { AddCircleButton } from '@/components/AddCircleButton';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import {
  createRelationshipMap,
  deleteRelationshipMap,
  getRelationshipMapMembers,
  getRelationshipMaps,
  initializeDatabase,
} from '@/db';
import type { RelationshipMap } from '@/types';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { formatRelationshipMapUpdatedAt } from '@/utils/relationshipMapHelpers';
import { useContentColors } from '@/utils/useContentColors';

type MapCardMeta = {
  memberCount: number;
};

export default function RelationshipMapListScreen() {
  const router = useRouter();
  const content = useContentColors();
  const [maps, setMaps] = useState<RelationshipMap[]>([]);
  const [metaByMapId, setMetaByMapId] = useState<Record<string, MapCardMeta>>({});
  const [createVisible, setCreateVisible] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleError, setTitleError] = useState('');

  const loadMaps = useCallback(() => {
    initializeDatabase();
    const nextMaps = getRelationshipMaps();
    const nextMeta: Record<string, MapCardMeta> = {};
    nextMaps.forEach((map) => {
      nextMeta[map.id] = { memberCount: getRelationshipMapMembers(map.id).length };
    });
    setMaps(nextMaps);
    setMetaByMapId(nextMeta);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMaps();
    }, [loadMaps])
  );

  const openCreateModal = useCallback(() => {
    setTitleDraft('');
    setTitleError('');
    setCreateVisible(true);
  }, []);

  const handleCreate = useCallback(() => {
    const title = titleDraft.trim();
    if (!title) {
      setTitleError('タイトルを入力してください');
      return;
    }
    initializeDatabase();
    const map = createRelationshipMap({ title });
    if (!map) {
      setTitleError('作成に失敗しました');
      return;
    }
    setCreateVisible(false);
    router.push(`/relationship-map/${map.id}`);
  }, [router, titleDraft]);

  const confirmDeleteMap = useCallback(
    (map: RelationshipMap) => {
      Alert.alert('相関図を削除', `「${map.title}」を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            initializeDatabase();
            if (deleteRelationshipMap(map.id)) {
              loadMaps();
            } else {
              Alert.alert('エラー', '削除に失敗しました');
            }
          },
        },
      ]);
    },
    [loadMaps]
  );

  const headerRight = useMemo(
    () => <AddCircleButton onPress={openCreateModal} accessibilityLabel="相関図を追加" />,
    [openCreateModal]
  );

  return (
    <>
      <SubToolScreenTemplate
        title="相関図"
        onBack={() => router.back()}
        right={headerRight}
        scrollContentStyle={styles.scrollContent}
      >
        {maps.length === 0 ? (
          <View style={[styles.emptyCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.emptyTitle, contentTextStyle(content)]}>相関図がありません</Text>
            <Text style={[styles.emptyHint, contentMutedTextStyle(content)]}>
              右上の＋から新しい相関図を作成できます。
            </Text>
          </View>
        ) : (
          maps.map((map) => {
            const meta = metaByMapId[map.id];
            return (
              <Pressable
                key={map.id}
                style={[styles.card, contentSurfaceStyle(content)]}
                onPress={() => router.push(`/relationship-map/${map.id}`)}
                onLongPress={() => confirmDeleteMap(map)}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, contentTextStyle(content)]} numberOfLines={1}>
                    {map.title}
                  </Text>
                  <Text style={[styles.chevron, contentMutedTextStyle(content)]}>›</Text>
                </View>
                <Text style={[styles.cardMeta, contentMutedTextStyle(content)]}>
                  人物 {meta?.memberCount ?? 0}人 · 更新 {formatRelationshipMapUpdatedAt(map.updatedAt)}
                </Text>
              </Pressable>
            );
          })
        )}
      </SubToolScreenTemplate>

      <Modal
        visible={createVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.modalTitle, contentTextStyle(content)]}>相関図を作成</Text>
            <TextInput
              style={[styles.textInput, contentInputStyle(content)]}
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="タイトル"
              placeholderTextColor={content.contentTextSecondary}
              autoFocus
            />
            {titleError ? <Text style={styles.formError}>{titleError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalButton} onPress={() => setCreateVisible(false)}>
                <Text style={[styles.modalButtonText, contentMutedTextStyle(content)]}>キャンセル</Text>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={handleCreate}>
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>作成</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
  },
  cardMeta: {
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  formError: {
    color: '#c0392b',
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  modalButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  modalButtonText: {
    fontSize: 16,
  },
  modalButtonTextPrimary: {
    color: '#4E9A87',
    fontWeight: '700',
  },
});
