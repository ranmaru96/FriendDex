import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

export const RELATIONSHIP_GROUP_COLOR_PRESETS = [
  '#5B8DEF',
  '#E07A2A',
  '#3a9d5a',
  '#8b5fd4',
  '#c0392b',
  '#4E9A87',
  '#d4a017',
  '#5d6d7e',
];

type ParentOption = { label: string; value: string };

type RelationshipMapGroupFormModalProps = {
  visible: boolean;
  title: string;
  initialName: string;
  initialColor: string;
  initialParentGroupId: string | null;
  parentOptions: ParentOption[];
  allowDelete?: boolean;
  onSave: (input: { name: string; color: string; parentGroupId: string | null }) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function RelationshipMapGroupFormModal({
  visible,
  title,
  initialName,
  initialColor,
  initialParentGroupId,
  parentOptions,
  allowDelete = false,
  onSave,
  onDelete,
  onClose,
}: RelationshipMapGroupFormModalProps) {
  const content = useContentColors();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [parentGroupId, setParentGroupId] = useState<string | null>(initialParentGroupId);
  const [parentPickerVisible, setParentPickerVisible] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setColor(initialColor);
      setParentGroupId(initialParentGroupId);
      setNameError('');
      setParentPickerVisible(false);
    }
  }, [initialColor, initialName, initialParentGroupId, visible]);

  const parentLabel = useMemo(() => {
    if (!parentGroupId) {
      return 'なし';
    }
    return parentOptions.find((option) => option.value === parentGroupId)?.label ?? 'なし';
  }, [parentGroupId, parentOptions]);

  if (!visible) {
    return null;
  }

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('グループ名を入力してください');
      return;
    }
    onSave({ name: trimmed, color, parentGroupId });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, contentSurfaceStyle(content)]}>
          <Text style={[styles.title, contentTextStyle(content)]}>{title}</Text>
          <TextInput
            style={[styles.textInput, contentInputStyle(content)]}
            value={name}
            onChangeText={setName}
            placeholder="グループ名"
            placeholderTextColor={content.contentTextSecondary}
          />
          {nameError ? <Text style={styles.error}>{nameError}</Text> : null}

          <Text style={[styles.fieldLabel, contentMutedTextStyle(content)]}>色</Text>
          <View style={styles.colorRow}>
            {RELATIONSHIP_GROUP_COLOR_PRESETS.map((preset) => {
              const selected = color.toLowerCase() === preset.toLowerCase();
              return (
                <Pressable
                  key={preset}
                  onPress={() => setColor(preset)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: preset },
                    selected && styles.colorDotSelected,
                  ]}
                />
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, contentMutedTextStyle(content)]}>親グループ</Text>
          <Pressable
            style={[styles.parentButton, contentInputStyle(content)]}
            onPress={() => setParentPickerVisible(true)}
          >
            <Text style={contentTextStyle(content)}>{parentLabel}</Text>
          </Pressable>

          <View style={styles.actions}>
            {allowDelete ? (
              <Pressable style={styles.button} onPress={onDelete}>
                <Text style={styles.deleteText}>削除</Text>
              </Pressable>
            ) : (
              <View style={styles.button} />
            )}
            <View style={styles.actionsRight}>
              <Pressable style={styles.button} onPress={onClose}>
                <Text style={[styles.buttonText, contentMutedTextStyle(content)]}>キャンセル</Text>
              </Pressable>
              <Pressable style={styles.button} onPress={handleSave}>
                <Text style={[styles.buttonText, styles.saveText, contentTextStyle(content)]}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <OptionPickerModal
        visible={parentPickerVisible}
        label="親グループ"
        value={parentGroupId ?? ''}
        options={parentOptions}
        clearLabel="なし"
        onValueChange={(value) => {
          setParentGroupId(value || null);
          setParentPickerVisible(false);
        }}
        onClose={() => setParentPickerVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  error: {
    color: '#c0392b',
    fontSize: 13,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#111111',
  },
  parentButton: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  actionsRight: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  button: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  buttonText: {
    fontSize: 16,
  },
  saveText: {
    fontWeight: '700',
  },
  deleteText: {
    color: '#c0392b',
    fontSize: 16,
    fontWeight: '700',
  },
});
