export type NoteBlockKind = 'paragraph' | 'bullet' | 'numbered' | 'check';

export type NoteBlock = {
  id: string;
  kind: NoteBlockKind;
  text: string;
  checked?: boolean;
};

const CHECK_RE = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/;
const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const NUMBER_RE = /^\s*\d+[.)]\s+(.*)$/;

let noteBlockSeq = 0;

export const createNoteBlock = (
  kind: NoteBlockKind = 'paragraph',
  text = '',
  checked = false
): NoteBlock => ({
  id: `nb-${++noteBlockSeq}`,
  kind,
  text,
  ...(kind === 'check' ? { checked } : {}),
});

export const parseLineToNoteBlock = (line: string): NoteBlock => {
  const check = line.match(CHECK_RE);
  if (check) {
    return createNoteBlock('check', check[2] ?? '', check[1].toLowerCase() === 'x');
  }
  const bullet = line.match(BULLET_RE);
  if (bullet) {
    return createNoteBlock('bullet', bullet[1] ?? '');
  }
  const numbered = line.match(NUMBER_RE);
  if (numbered) {
    return createNoteBlock('numbered', numbered[1] ?? '');
  }
  return createNoteBlock('paragraph', line);
};

export const mergeAdjacentParagraphs = (blocks: NoteBlock[]): NoteBlock[] => {
  const out: NoteBlock[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.kind === 'paragraph' && last?.kind === 'paragraph') {
      last.text = `${last.text}\n${block.text}`;
    } else {
      out.push({ ...block });
    }
  }
  return out.length ? out : [createNoteBlock()];
};

export const parseNoteBlocks = (value: string): NoteBlock[] => {
  const normalized = value.replace(/\r\n/g, '\n');
  if (normalized === '') {
    return [createNoteBlock()];
  }
  return mergeAdjacentParagraphs(normalized.split('\n').map(parseLineToNoteBlock));
};

export const serializeNoteBlocks = (blocks: NoteBlock[]): string => {
  if (blocks.length === 0) {
    return '';
  }
  let numbered = 0;
  return blocks
    .map((block) => {
      if (block.kind === 'numbered') {
        numbered += 1;
        return `${numbered}. ${block.text}`;
      }
      numbered = 0;
      if (block.kind === 'bullet') {
        return `- ${block.text}`;
      }
      if (block.kind === 'check') {
        return `- [${block.checked ? 'x' : ' '}] ${block.text}`;
      }
      return block.text;
    })
    .join('\n');
};

export const explodeParagraphIfListMarkers = (text: string): NoteBlock[] | null => {
  const parsed = text.split('\n').map(parseLineToNoteBlock);
  if (!parsed.some((block) => block.kind !== 'paragraph')) {
    return null;
  }
  return mergeAdjacentParagraphs(parsed);
};

export const toggleNoteBlockChecked = (value: string, index: number): string | null => {
  const blocks = parseNoteBlocks(value);
  const block = blocks[index];
  if (!block || block.kind !== 'check') {
    return null;
  }
  block.checked = !block.checked;
  return serializeNoteBlocks(blocks);
};

export const formatNotePreview = (value: string): string => {
  const parts = parseNoteBlocks(value)
    .map((block) => {
      const text = block.text.replace(/\n/g, ' ').trim();
      if (block.kind === 'check') {
        return `${block.checked ? '✓' : '○'}${text ? ` ${text}` : ''}`;
      }
      return text;
    })
    .filter((part) => part.length > 0);
  return parts.join('  ');
};

export const noteBlocksHaveContent = (value: string): boolean => formatNotePreview(value).length > 0;
