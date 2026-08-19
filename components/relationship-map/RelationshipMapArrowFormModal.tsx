import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import type { RelationshipArrowStyle } from '@/types';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const STYLE_OPTIONS: { value: RelationshipArrowStyle; label: string }[] = [
  { value: 'oneway', label: '一方向' },
  { value: 'both', label: '双方向' },
  { value: 'none', label: '線のみ' },
];

type RelationshipMapArrowFormModalProps = {
  visible: boolean;
  title: string;
  fromName: string;
  toName: string;
  initialStyle: RelationshipArrowStyle;
  initialLabel: string;
  allowDelete?: boolean;
  onSave: (style: RelationshipArrowStyle, label: string) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function RelationshipMapArrowFormModal({
  visible,
  title,
  fromName,
  toName,
  initialStyle,
  initialLabel,
  allowDelete = false,
  onSave,
  onDelete,
  onClose,
}: RelationshipMapArrowFormModalProps) {
  const content = useContentColors();
  const [style, setStyle] = useState<RelationshipArrowStyle>(initialStyle);
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    if (visible) {
      setStyle(initialStyle);
      setLabel(initialLabel);
    }
  }, [initialLabel, initialStyle, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, contentSurfaceStyle(content)]}>
          <Text style={[styles.title, contentTextStyle(content)]}>{title}</Text>
          <Text style={[styles.meta, contentMutedTextStyle(content)]}>
            {fromName} → {toName}
          </Text>
          <View style={styles.styleRow}>
            {STYLE_OPTIONS.map((option) => {
              const selected = style === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setStyle(option.value)}
                  style={[
                    styles.styleChip,
                    selected
                      ? contentSelectedOptionStyle(content)
                      : { borderColor: content.contentBorder, backgroundColor: content.contentInputBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.styleChipText,
                      selected ? contentTextStyle(content) : contentMutedTextStyle(content),
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={[styles.textInput, contentInputStyle(content)]}
            value={label}
            onChangeText={setLabel}
            placeholder="ラベル（任意）"
            placeholderTextColor={content.contentTextSecondary}
            maxLength={20}
          />
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
              <Pressable style={styles.button} onPress={() => onSave(style, label)}>
                <Text style={[styles.buttonText, styles.saveText, contentTextStyle(content)]}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
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
  meta: {
    fontSize: 14,
  },
  styleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  styleChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  styleChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
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
