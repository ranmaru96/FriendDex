import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { contentSurfaceStyle } from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const DELETE_COLOR = '#f87171';

type DetailMenuSheetProps = {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function DetailMenuSheet({ visible, onClose, onEdit, onDelete }: DetailMenuSheetProps) {
  const content = useContentColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            contentSurfaceStyle(content),
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
          onPress={(pressEvent) => pressEvent.stopPropagation()}
        >
          <View style={[styles.sheetHandle, { backgroundColor: content.contentBorder }]} />
          <View style={[styles.menuGroup, { borderColor: content.contentBorder }]}>
            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                onClose();
                onEdit();
              }}
              accessibilityRole="button"
              accessibilityLabel="編集"
            >
              <Ionicons name="pencil-outline" size={20} color={content.contentText} />
              <Text style={[styles.sheetActionText, { color: content.contentText }]}>編集</Text>
            </Pressable>
            <View style={[styles.menuDivider, { backgroundColor: content.contentBorder }]} />
            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                onClose();
                onDelete();
              }}
              accessibilityRole="button"
              accessibilityLabel="削除"
            >
              <Ionicons name="trash-outline" size={20} color={DELETE_COLOR} />
              <Text style={[styles.sheetActionText, styles.sheetActionDanger]}>削除</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  menuGroup: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
  },
  sheetAction: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
  },
  sheetActionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  sheetActionDanger: {
    color: DELETE_COLOR,
  },
});
