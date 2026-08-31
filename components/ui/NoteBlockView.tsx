import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useContentColors } from '@/utils/useContentColors';
import { parseNoteBlocks, toggleNoteBlockChecked, type NoteBlock } from '@/utils/noteBlocks';

type NoteBlockViewProps = {
  value: string;
  textStyle?: StyleProp<TextStyle>;
  emptyLabel?: string;
  emptyStyle?: StyleProp<TextStyle>;
  onChangeValue?: (next: string) => void;
};

function numberedLabel(blocks: NoteBlock[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i += 1) {
    if (blocks[i].kind === 'numbered') {
      n += 1;
    } else {
      n = 0;
    }
  }
  return n;
}

export function NoteBlockView({
  value,
  textStyle,
  emptyLabel,
  emptyStyle,
  onChangeValue,
}: NoteBlockViewProps) {
  const content = useContentColors();
  const blocks = parseNoteBlocks(value);
  const hasContent = blocks.some(
    (block) => block.text.trim().length > 0 || block.kind === 'check'
  );
  if (!hasContent) {
    if (!emptyLabel) {
      return null;
    }
    return <Text style={emptyStyle}>{emptyLabel}</Text>;
  }

  const handleToggleCheck = (index: number) => {
    if (!onChangeValue) {
      return;
    }
    const next = toggleNoteBlockChecked(value, index);
    if (next != null) {
      onChangeValue(next);
    }
  };

  return (
    <View style={styles.list}>
      {blocks.map((block, index) => {
        if (block.kind === 'paragraph' && !block.text.trim() && index < blocks.length - 1) {
          return <View key={`blank-${index}`} style={styles.blank} />;
        }
        const checkControl =
          block.kind === 'check' ? (
            <View style={styles.checkGutter}>
              <Ionicons
                name={block.checked ? 'checkbox' : 'square-outline'}
                size={16}
                color={content.contentText}
              />
            </View>
          ) : null;
        return (
          <View key={`nb-${index}`} style={styles.row}>
            {block.kind === 'bullet' ? (
              <Text style={[styles.gutter, textStyle]}>•</Text>
            ) : null}
            {block.kind === 'numbered' ? (
              <Text style={[styles.gutter, textStyle]}>{numberedLabel(blocks, index)}.</Text>
            ) : null}
            {block.kind === 'check' && onChangeValue ? (
              <Pressable
                onPress={() => handleToggleCheck(index)}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: Boolean(block.checked) }}
                accessibilityLabel={block.checked ? '完了を外す' : '完了にする'}
              >
                {checkControl}
              </Pressable>
            ) : (
              checkControl
            )}
            <Text
              selectable
              style={[
                styles.text,
                textStyle,
                block.kind === 'check' && block.checked ? styles.checkedText : null,
              ]}
            >
              {block.text || ' '}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  gutter: {
    width: 22,
    paddingTop: 1,
    textAlign: 'right',
  },
  checkGutter: {
    width: 22,
    paddingTop: 2,
    alignItems: 'flex-end',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  checkedText: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
  blank: {
    height: 8,
  },
});
