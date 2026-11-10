import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { contentSurfaceStyle } from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const DELETE_COLOR = '#f87171';

type DetailMenuIconName = ComponentProps<typeof Ionicons>['name'];

export type DetailMenuAction = {
  label: string;
  icon: DetailMenuIconName;
  onPress: () => void;
};

type DetailMenuSheetProps = {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editLabel?: string;
  extraActions?: DetailMenuAction[];
};

export function DetailMenuSheet({
  visible,
  onClose,
  onEdit,
  onDelete,
  editLabel = '編集',
  extraActions = [],
}: DetailMenuSheetProps) {
  const content = useContentColors();
  const insets = useSafeAreaInsets();
  const items: Array<DetailMenuAction & { danger?: boolean }> = [
    { label: editLabel, icon: 'pencil-outline', onPress: onEdit },
    ...extraActions,
    { label: '削除', icon: 'trash-outline', onPress: onDelete, danger: true },
  ];

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
            {items.map((item, index) => (
              <View key={item.label}>
                {index > 0 ? (
                  <View style={[styles.menuDivider, { backgroundColor: content.contentBorder }]} />
                ) : null}
                <Pressable
                  style={styles.sheetAction}
                  onPress={() => {
                    onClose();
                    item.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={item.danger ? DELETE_COLOR : content.contentText}
                  />
                  <Text
                    style={[
                      styles.sheetActionText,
                      item.danger ? styles.sheetActionDanger : { color: content.contentText },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              </View>
            ))}
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
