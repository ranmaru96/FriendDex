import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AddCircleButton } from '@/components/AddCircleButton';
import { EpisodeTagChip } from '@/components/episode/EpisodeTagChip';
import { Radius, Theme, Typography } from '@/constants/theme';
import {
  addCommonItemOption,
  deleteCommonItemOption,
  getCommonItemOptionByKindAndLabel,
  getMergedCommonItemLabels,
  initializeDatabase,
  removeCommonItemLabel,
  renameCommonItemLabel,
  setCommonItemOptionColor,
} from '@/db';
import {
  EPISODE_TAG_COLOR_PALETTE,
  getHashedEpisodeTagColor,
} from '@/utils/calendarEventColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const KIND = 'episode_tag' as const;

function EditorActionButtons({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: () => void;
}) {
  const content = useContentColors();
  return (
    <View style={styles.editorActionButtons}>
      <Pressable
        style={[styles.editorIconButton, contentSurfaceStyle(content)]}
        onPress={onCancel}
        accessibilityLabel="キャンセル"
        accessibilityRole="button"
      >
        <Ionicons name="close-outline" size={20} color={content.contentText} />
      </Pressable>
      <Pressable
        style={[
          styles.editorIconButton,
          contentSurfaceStyle(content),
          { borderColor: content.contentText, backgroundColor: content.contentPersonTagBg },
        ]}
        onPress={onSave}
        accessibilityLabel="保存"
        accessibilityRole="button"
      >
        <Ionicons name="checkmark-outline" size={20} color={content.contentText} />
      </Pressable>
    </View>
  );
}

type EpisodeTagsModalProps = {
  visible: boolean;
  onClose: () => void;
  /** 追加・色変更・改名・削除のあと（カレンダー色の即時反映用） */
  onTagsChanged?: () => void;
};

/**
 * カレンダーから開く予定タグ管理モーダル（共通項目の予定タグタブ相当）。
 */
export function EpisodeTagsModal({ visible, onClose, onTagsChanged }: EpisodeTagsModalProps) {
  const content = useContentColors();
  const [labels, setLabels] = useState<string[]>([]);
  const [infoVisible, setInfoVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [editorColor, setEditorColor] = useState<string>(EPISODE_TAG_COLOR_PALETTE[0]);
  const [editingOriginalLabel, setEditingOriginalLabel] = useState<string | null>(null);

  const refresh = useCallback(() => {
    initializeDatabase();
    setLabels(getMergedCommonItemLabels(KIND));
  }, []);

  const notifyChanged = useCallback(() => {
    onTagsChanged?.();
  }, [onTagsChanged]);

  useEffect(() => {
    if (!visible) {
      setInfoVisible(false);
      setEditorVisible(false);
      return;
    }
    refresh();
  }, [refresh, visible]);

  const openAdd = () => {
    setEditingOriginalLabel(null);
    setEditorText('');
    setEditorColor(EPISODE_TAG_COLOR_PALETTE[0]);
    setEditorVisible(true);
  };

  const openEdit = (label: string) => {
    setEditingOriginalLabel(label);
    setEditorText(label);
    const option = getCommonItemOptionByKindAndLabel(KIND, label);
    setEditorColor(option?.color ?? getHashedEpisodeTagColor(label));
    setEditorVisible(true);
  };

  const handleSave = () => {
    dismissKeyboardFocus();
    const normalized = editorText.trim();
    if (!normalized) {
      Alert.alert('入力エラー', '予定タグを入力してください。');
      return;
    }
    if (!editingOriginalLabel) {
      const created = addCommonItemOption(KIND, normalized, editorColor);
      if (!created) {
        Alert.alert('登録失敗', '同じ項目が既に存在するか、入力値が不正です。');
        return;
      }
    } else {
      const ok = renameCommonItemLabel(KIND, editingOriginalLabel, normalized);
      if (!ok) {
        Alert.alert('更新失敗', '同じ項目が既に存在するか、入力値が不正です。');
        return;
      }
      setCommonItemOptionColor(KIND, normalized, editorColor);
    }
    setEditorVisible(false);
    refresh();
    notifyChanged();
  };

  const confirmDelete = (label: string, onDeleted?: () => void) => {
    Alert.alert(
      '削除確認',
      `「${label}」を削除します。\n関連する各Profileの同項目からも削除されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => {
            const option = getCommonItemOptionByKindAndLabel(KIND, label);
            const ok = option?.id
              ? deleteCommonItemOption(option.id)
              : removeCommonItemLabel(KIND, label);
            if (!ok) {
              Alert.alert('削除失敗', '削除処理に失敗しました。');
              return;
            }
            onDeleted?.();
            refresh();
            notifyChanged();
          },
        },
      ]
    );
  };

  const handleRequestClose = () => {
    if (editorVisible) {
      setEditorVisible(false);
      return;
    }
    if (infoVisible) {
      setInfoVisible(false);
      return;
    }
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleRequestClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, contentSurfaceStyle(content)]}>
          <View style={styles.header}>
            <Ionicons name="pricetags-outline" size={18} color={content.contentText} />
            <Text style={[styles.title, contentTextStyle(content)]}>予定タグ</Text>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="閉じる"
            >
              <Ionicons name="close" size={22} color={content.contentTextSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.tagsScroll}
            contentContainerStyle={styles.tagsContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {labels.length === 0 ? (
              <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
                まだ予定タグがありません
              </Text>
            ) : (
              labels.map((label) => (
                <Pressable key={label} onPress={() => openEdit(label)}>
                  <EpisodeTagChip
                    label={label}
                    chipStyle={{
                      backgroundColor: 'transparent',
                      color: content.contentText,
                    }}
                    style={styles.tagChip}
                    textStyle={styles.tagChipText}
                  />
                </Pressable>
              ))
            )}
          </ScrollView>

          <View style={styles.bottomRow}>
            <Pressable
              style={styles.infoButton}
              onPress={() => setInfoVisible(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="予定タグについての説明"
            >
              <Ionicons
                name="information-circle-outline"
                size={28}
                color={content.contentTextSecondary}
              />
            </Pressable>
            <AddCircleButton onPress={openAdd} accessibilityLabel="予定タグを追加" size={28} />
          </View>
        </View>

        {infoVisible ? (
          <View style={styles.nestedOverlay} pointerEvents="box-none">
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setInfoVisible(false)}
              accessibilityLabel="閉じる"
            />
            <View style={[styles.infoCard, contentSurfaceStyle(content)]}>
              <Text style={[styles.infoTitle, contentTextStyle(content)]}>予定タグについて</Text>
              <Text style={[styles.infoBody, contentMutedTextStyle(content)]}>
                {[
                  '・カレンダーの予定色分けに使います。',
                  '・エピソードのタグとしても使えます。',
                  '・一覧のタグをタップすると編集できます。',
                ].join('\n')}
              </Text>
              <Pressable
                style={[styles.infoClose, contentInputStyle(content)]}
                onPress={() => setInfoVisible(false)}
              >
                <Text style={[styles.infoCloseText, contentTextStyle(content)]}>閉じる</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {editorVisible ? (
          <View style={styles.nestedOverlay} pointerEvents="box-none">
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                dismissKeyboardFocus();
                setEditorVisible(false);
              }}
              accessibilityLabel="閉じる"
            />
            <Pressable
              style={[styles.editorCard, contentSurfaceStyle(content)]}
              onPress={dismissKeyboardFocus}
              accessible={false}
            >
              <View style={styles.editorHeader}>
                <Text style={[styles.editorTitle, contentTextStyle(content)]} numberOfLines={1}>
                  {editingOriginalLabel ? '予定タグを編集' : '予定タグを追加'}
                </Text>
                <EditorActionButtons
                  onCancel={() => {
                    dismissKeyboardFocus();
                    setEditorVisible(false);
                  }}
                  onSave={handleSave}
                />
              </View>
              <TextInput
                value={editorText}
                onChangeText={setEditorText}
                style={[styles.editorInput, contentInputStyle(content)]}
                placeholder="予定タグを入力"
                placeholderTextColor={content.contentTextSecondary}
                autoCapitalize="none"
                autoFocus
              />
              <View style={styles.colorPickerSection}>
                <Text style={[styles.colorPickerLabel, contentMutedTextStyle(content)]}>
                  カレンダーの色
                </Text>
                <View style={styles.colorPickerRow}>
                  {EPISODE_TAG_COLOR_PALETTE.map((swatch) => {
                    const selected = editorColor.toUpperCase() === swatch.toUpperCase();
                    return (
                      <Pressable
                        key={swatch}
                        onPress={() => {
                          dismissKeyboardFocus();
                          setEditorColor(swatch);
                        }}
                        style={[
                          styles.colorSwatchRing,
                          selected ? { borderColor: content.contentText } : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`色 ${swatch}`}
                      >
                        <View style={[styles.colorSwatch, { backgroundColor: swatch }]}>
                          {selected ? (
                            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {editingOriginalLabel ? (
                <Pressable
                  style={styles.editorDeleteButton}
                  onPress={() => {
                    dismissKeyboardFocus();
                    confirmDelete(editingOriginalLabel, () => setEditorVisible(false));
                  }}
                >
                  <Text style={styles.editorDeleteText}>削除</Text>
                </Pressable>
              ) : null}
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
    maxHeight: '72%',
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagsScroll: {
    maxHeight: 280,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  emptyText: {
    fontSize: 13,
    paddingVertical: 12,
  },
  tagChip: {
    marginRight: 0,
  },
  tagChipText: {
    fontSize: 13,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  infoClose: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoCloseText: {
    fontSize: 13,
    fontWeight: '600',
  },
  nestedOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  editorCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editorTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  editorActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editorIconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  colorPickerSection: {
    gap: 8,
  },
  colorPickerLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  colorPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorSwatchRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorDeleteButton: {
    alignSelf: 'center',
    marginTop: 12,
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.55)',
    backgroundColor: 'rgba(248, 113, 113, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorDeleteText: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: '#f87171',
  },
});
