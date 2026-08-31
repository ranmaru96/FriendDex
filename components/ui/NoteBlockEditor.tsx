import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NoteFormatToolbar } from '@/components/ui/NoteFormatToolbar';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useNoteFormatAccessory } from '@/contexts/NoteFormatAccessoryContext';
import { useKeyboardBottomInset } from '@/utils/useKeyboardBottomInset';
import { useContentColors } from '@/utils/useContentColors';
import {
  createNoteBlock,
  explodeParagraphIfListMarkers,
  mergeAdjacentParagraphs,
  parseNoteBlocks,
  serializeNoteBlocks,
  type NoteBlock,
  type NoteBlockKind,
} from '@/utils/noteBlocks';

const DEFAULT_TOP_RESERVE = 64;
const DEFAULT_BOTTOM_GAP = 16;
const GUTTER_WIDTH = 24;
const LINE_PAD = 4;

let accessorySeq = 0;

type NoteBlockEditorProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  minHeight?: number;
  uncapped?: boolean;
  /** false で入力枠のボーダーを消す（エピソード説明など） */
  framed?: boolean;
  topReserve?: number;
  bottomGap?: number;
  style?: StyleProp<ViewStyle | TextStyle>;
  accessibilityLabel?: string;
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

function splitTextStyle(style: StyleProp<ViewStyle | TextStyle>): {
  viewStyle: ViewStyle;
  textStyle: TextStyle;
} {
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle & TextStyle;
  const {
    color,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    textAlign,
    textAlignVertical,
    ...viewStyle
  } = flat;
  return {
    viewStyle,
    textStyle: {
      ...(color != null ? { color } : {}),
      ...(fontSize != null ? { fontSize } : {}),
      ...(fontWeight != null ? { fontWeight } : {}),
      ...(lineHeight != null ? { lineHeight } : {}),
      ...(letterSpacing != null ? { letterSpacing } : {}),
      ...(textAlign != null ? { textAlign } : {}),
    },
  };
}

function replaceAndMerge(
  blocks: NoteBlock[],
  index: number,
  replacement: NoteBlock[]
): { next: NoteBlock[]; focus: number } {
  const raw = [...blocks.slice(0, index), ...replacement, ...blocks.slice(index + 1)];
  const lastReplaced = index + replacement.length - 1;
  const out: NoteBlock[] = [];
  let focus = 0;
  raw.forEach((block, i) => {
    const last = out[out.length - 1];
    if (block.kind === 'paragraph' && last?.kind === 'paragraph') {
      last.text = `${last.text}\n${block.text}`;
      if (i === lastReplaced) {
        focus = out.length - 1;
      }
    } else {
      out.push({ ...block });
      if (i === lastReplaced) {
        focus = out.length - 1;
      }
    }
  });
  return { next: out.length ? out : [createNoteBlock()], focus };
}

export function NoteBlockEditor({
  value,
  onChangeText,
  placeholder = '',
  placeholderTextColor,
  minHeight = 86,
  uncapped = false,
  framed = true,
  topReserve = DEFAULT_TOP_RESERVE,
  bottomGap = DEFAULT_BOTTOM_GAP,
  style,
  accessibilityLabel,
}: NoteBlockEditorProps) {
  const content = useContentColors();
  const shape = useAppThemeOptional()?.shape;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardBottomInset();
  const accessory = useNoteFormatAccessory();
  const accessoryIdRef = useRef(`fdNoteFormat${++accessorySeq}`);
  const accessoryId = accessoryIdRef.current;
  const [blocks, setBlocks] = useState(() => parseNoteBlocks(value));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const pendingFocusRef = useRef<number | null>(null);
  const focusedIndexRef = useRef<number | null>(null);
  const blocksRef = useRef(blocks);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSubmitRef = useRef(false);
  const focusTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  blocksRef.current = blocks;
  focusedIndexRef.current = focusedIndex;

  const { viewStyle, textStyle } = useMemo(() => splitTextStyle(style), [style]);
  const maxHeight = useMemo(() => {
    const accessoryLift = accessory?.bottomPad ?? 0;
    const bottom = Math.max(keyboardInset, insets.bottom) + bottomGap + accessoryLift;
    const available = windowHeight - insets.top - topReserve - bottom;
    return Math.max(minHeight, available);
  }, [
    accessory?.bottomPad,
    windowHeight,
    insets.top,
    insets.bottom,
    keyboardInset,
    topReserve,
    bottomGap,
    minHeight,
  ]);

  useEffect(() => {
    if (serializeNoteBlocks(blocksRef.current) === value) {
      return;
    }
    setBlocks(parseNoteBlocks(value));
  }, [value]);

  const clearFocusTimeouts = useCallback(() => {
    focusTimeoutsRef.current.forEach(clearTimeout);
    focusTimeoutsRef.current = [];
  }, []);

  const focusRow = useCallback(
    (index: number, blockId?: string) => {
      pendingFocusRef.current = index;
      if (blockId) {
        setAutoFocusId(blockId);
      }
      clearFocusTimeouts();
      const tryFocus = () => {
        if (pendingFocusRef.current !== index) {
          return;
        }
        inputRefs.current[index]?.focus();
      };
      tryFocus();
      requestAnimationFrame(() => {
        requestAnimationFrame(tryFocus);
      });
      const task = InteractionManager.runAfterInteractions(tryFocus);
      focusTimeoutsRef.current = [50, 120, 280].map((delay) => setTimeout(tryFocus, delay));
      return () => task.cancel();
    },
    [clearFocusTimeouts]
  );

  useEffect(() => {
    const index = pendingFocusRef.current;
    if (index == null) {
      return;
    }
    focusRow(index);
  }, [blocks, focusRow]);

  useEffect(
    () => () => {
      clearFocusTimeouts();
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    },
    [clearFocusTimeouts]
  );

  const emit = useCallback(
    (next: NoteBlock[]) => {
      setBlocks(next);
      onChangeText(serializeNoteBlocks(next));
    },
    [onChangeText]
  );

  const updateBlock = (index: number, patch: Partial<NoteBlock>) => {
    emit(blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)));
  };

  const handleTextChange = (index: number, text: string) => {
    const current = blocks[index];
    if (!current) {
      return;
    }

    if (current.kind === 'paragraph') {
      const exploded = explodeParagraphIfListMarkers(text);
      if (exploded) {
        const adopted = exploded.map((block, i) => (i === 0 ? { ...block, id: current.id } : block));
        const { next, focus } = replaceAndMerge(blocks, index, adopted);
        skipSubmitRef.current = true;
        focusRow(focus, next[focus]?.id);
        emit(next);
        return;
      }
      updateBlock(index, { text });
      return;
    }

    if (!text.includes('\n')) {
      updateBlock(index, { text });
      return;
    }

    skipSubmitRef.current = true;
    const parts = text.split('\n');
    const head = parts[0];
    const tails = parts.slice(1);
    if (head === '' && tails.length === 1 && tails[0] === '') {
      const { next, focus } = replaceAndMerge(blocks, index, [
        { ...current, kind: 'paragraph', text: '', checked: undefined },
      ]);
      focusRow(focus, next[focus]?.id);
      emit(next);
      return;
    }

    const inserted = tails.map((part) => createNoteBlock(current.kind, part, false));
    const next = [
      ...blocks.slice(0, index),
      { ...current, text: head },
      ...inserted,
      ...blocks.slice(index + 1),
    ];
    const focus = index + inserted.length;
    focusRow(focus, next[focus]?.id);
    emit(next);
  };

  const handleListSubmit = (index: number) => {
    if (skipSubmitRef.current) {
      skipSubmitRef.current = false;
      return;
    }
    const current = blocks[index];
    if (!current || current.kind === 'paragraph') {
      return;
    }
    if (current.text === '') {
      const { next, focus } = replaceAndMerge(blocks, index, [
        { ...current, kind: 'paragraph', text: '', checked: undefined },
      ]);
      focusRow(focus, next[focus]?.id);
      emit(next);
      return;
    }
    const inserted = createNoteBlock(current.kind, '', false);
    const next = [...blocks.slice(0, index + 1), inserted, ...blocks.slice(index + 1)];
    focusRow(index + 1, inserted.id);
    emit(next);
  };

  const handleBackspaceEmpty = (index: number) => {
    const current = blocks[index];
    if (!current || current.text.length > 0) {
      return;
    }
    if (current.kind !== 'paragraph') {
      const { next, focus } = replaceAndMerge(blocks, index, [
        { ...current, kind: 'paragraph', checked: undefined },
      ]);
      focusRow(focus, next[focus]?.id);
      emit(next);
      return;
    }
    if (blocks.length === 1) {
      return;
    }
    const merged = mergeAdjacentParagraphs(blocks.filter((_, i) => i !== index));
    const focus = Math.max(0, Math.min(index - 1, merged.length - 1));
    focusRow(focus, merged[focus]?.id);
    emit(merged);
  };

  const applyKind = useCallback(
    (kind: NoteBlockKind) => {
      const currentBlocks = blocksRef.current;
      const index = focusedIndexRef.current ?? Math.max(0, currentBlocks.length - 1);
      const current = currentBlocks[index] ?? createNoteBlock();
      if (current.kind === kind) {
        const { next, focus } = replaceAndMerge(currentBlocks, index, [
          { ...current, kind: 'paragraph', checked: undefined },
        ]);
        focusRow(focus, next[focus]?.id);
        emit(next);
        return;
      }
      if (current.kind === 'paragraph') {
        const lines = current.text.split('\n');
        const replacement = lines.map((line, i) =>
          i === 0
            ? {
                ...current,
                kind,
                text: line,
                checked: kind === 'check' ? false : undefined,
              }
            : createNoteBlock(kind, line, kind === 'check' ? false : undefined)
        );
        const { next } = replaceAndMerge(currentBlocks, index, replacement);
        focusRow(index, next[index]?.id);
        emit(next);
        return;
      }
      emit(
        currentBlocks.map((block, i) =>
          i === index
            ? { ...block, kind, checked: kind === 'check' ? false : undefined }
            : block
        )
      );
    },
    [emit, focusRow]
  );
  const applyKindRef = useRef(applyKind);
  applyKindRef.current = applyKind;
  const stableApplyKind = useCallback((kind: NoteBlockKind) => {
    applyKindRef.current(kind);
  }, []);

  const toggleCheck = (index: number) => {
    const current = blocks[index];
    if (!current || current.kind !== 'check') {
      return;
    }
    updateBlock(index, { checked: !current.checked });
  };

  const handleFocus = (index: number) => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    pendingFocusRef.current = null;
    setAutoFocusId((current) => (current == null ? current : null));
    focusedIndexRef.current = index;
    setFocusedIndex((current) => (current === index ? current : index));
  };

  const handleBlur = (index: number) => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
    }
    blurTimerRef.current = setTimeout(() => {
      if (pendingFocusRef.current != null) {
        return;
      }
      if (focusedIndexRef.current !== index) {
        return;
      }
      focusedIndexRef.current = null;
      setFocusedIndex(null);
      accessory?.release(accessoryId);
    }, 120);
  };

  const activeKind = focusedIndex != null ? blocks[focusedIndex]?.kind : undefined;
  const presentAccessory = accessory?.present;

  useEffect(() => {
    if (focusedIndex == null) {
      return;
    }
    presentAccessory?.({
      id: accessoryId,
      activeKind,
      applyKind: stableApplyKind,
    });
  }, [presentAccessory, accessoryId, activeKind, stableApplyKind, focusedIndex]);

  useEffect(() => {
    return () => {
      accessory?.release(accessoryId);
    };
    // アンマウント時だけ解放する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessoryId]);

  const showPlaceholder =
    blocks.length === 1 && blocks[0].kind === 'paragraph' && blocks[0].text === '';
  const innerRadius = shape?.innerRadius ?? 8;
  const showInlineToolbar = Platform.OS === 'web';

  const rows = (
    <View style={styles.rows}>
      {blocks.map((block, index) => (
        <View key={block.id} style={styles.row}>
          {block.kind === 'bullet' ? (
            <Text style={[styles.gutter, textStyle]}>•</Text>
          ) : null}
          {block.kind === 'numbered' ? (
            <Text style={[styles.gutter, textStyle]}>{numberedLabel(blocks, index)}.</Text>
          ) : null}
          {block.kind === 'check' ? (
            <Pressable
              onPress={() => toggleCheck(index)}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: Boolean(block.checked) }}
              accessibilityLabel={block.checked ? '完了を外す' : '完了にする'}
              style={styles.checkGutter}
            >
              <Ionicons
                name={block.checked ? 'checkbox' : 'square-outline'}
                size={18}
                color={content.contentText}
              />
            </Pressable>
          ) : null}
          {block.kind === 'paragraph' ? <View style={styles.paragraphSpacer} /> : null}
          <TextInput
            ref={(node) => {
              inputRefs.current[index] = node;
            }}
            value={block.text}
            onChangeText={(text) => handleTextChange(index, text)}
            onSubmitEditing={() => handleListSubmit(index)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace') {
                handleBackspaceEmpty(index);
              }
            }}
            onFocus={() => handleFocus(index)}
            onBlur={() => handleBlur(index)}
            placeholder={showPlaceholder && index === 0 ? placeholder : undefined}
            placeholderTextColor={placeholderTextColor ?? content.contentTextSecondary}
            autoFocus={autoFocusId === block.id}
            multiline
            submitBehavior={block.kind === 'paragraph' ? 'newline' : 'submit'}
            blurOnSubmit={false}
            scrollEnabled={false}
            textAlignVertical="top"
            accessibilityLabel={accessibilityLabel}
            style={[
              styles.input,
              textStyle,
              block.kind === 'check' && block.checked ? styles.checkedText : null,
            ]}
          />
        </View>
      ))}
    </View>
  );

  return (
    <View
      style={[
        styles.wrap,
        { minHeight, borderRadius: framed ? innerRadius : 0 },
        framed ? null : styles.wrapUnframed,
        viewStyle,
        !framed ? { backgroundColor: 'transparent', borderWidth: 0 } : null,
        !uncapped ? { maxHeight } : null,
      ]}
    >
      {showInlineToolbar ? (
        <NoteFormatToolbar activeKind={activeKind} onApplyKind={applyKind} />
      ) : null}
      {uncapped ? (
        rows
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          style={styles.bodyScroll}
        >
          {rows}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: 1,
  },
  wrapUnframed: {
    borderWidth: 0,
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  bodyScroll: {
    flexGrow: 0,
  },
  rows: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 28,
  },
  gutter: {
    width: GUTTER_WIDTH,
    paddingTop: LINE_PAD,
    textAlign: 'right',
    marginRight: 6,
  },
  checkGutter: {
    width: GUTTER_WIDTH,
    paddingTop: LINE_PAD,
    alignItems: 'flex-end',
    marginRight: 6,
  },
  paragraphSpacer: {
    width: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: LINE_PAD,
    margin: 0,
  },
  checkedText: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
});
