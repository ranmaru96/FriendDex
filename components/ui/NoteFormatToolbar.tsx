import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useContentColors } from '@/utils/useContentColors';
import type { NoteBlockKind } from '@/utils/noteBlocks';

export const NOTE_FORMAT_TOOLBAR_HEIGHT = 44;

type NoteFormatToolbarProps = {
  activeKind?: NoteBlockKind;
  onApplyKind: (kind: NoteBlockKind) => void;
};

export function NoteFormatToolbar({ activeKind, onApplyKind }: NoteFormatToolbarProps) {
  const content = useContentColors();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: content.contentInputBg,
          borderTopColor: content.contentBorder,
        },
      ]}
    >
      <ToolButton
        label="箇条書き"
        icon="list-outline"
        active={activeKind === 'bullet'}
        onPress={() => onApplyKind('bullet')}
      />
      <ToolButton
        label="番号"
        text="1."
        active={activeKind === 'numbered'}
        onPress={() => onApplyKind('numbered')}
      />
      <ToolButton
        label="チェック"
        icon="checkbox-outline"
        active={activeKind === 'check'}
        onPress={() => onApplyKind('check')}
      />
    </View>
  );
}

function ToolButton({
  label,
  icon,
  text,
  active,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  text?: string;
  active: boolean;
  onPress: () => void;
}) {
  const content = useContentColors();
  const color = active ? content.contentText : content.contentTextSecondary;
  return (
    <Pressable
      onPressIn={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[
        styles.toolBtn,
        active
          ? { backgroundColor: content.contentCard, borderColor: content.contentText }
          : { borderColor: content.contentBorder },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={color} /> : null}
      {text ? <Text style={[styles.toolText, { color }]}>{text}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: NOTE_FORMAT_TOOLBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolBtn: {
    minWidth: 36,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
