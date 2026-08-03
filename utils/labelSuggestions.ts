const DEFAULT_LIMIT = 8;

/** Katakana (full-width) → hiragana for match comparison. */
function toHiragana(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    // ァ-ヶ (U+30A1-U+30F6) → ぁ-ゖ
    if (code >= 0x30a1 && code <= 0x30f6) {
      result += String.fromCharCode(code - 0x60);
      continue;
    }
    result += value[index];
  }
  return result;
}

function normalizeForMatch(value: string): string {
  return toHiragana(value.trim()).toLowerCase();
}

export type FilterLabelSuggestionsOptions = {
  /** Labels already used elsewhere (or exact current text) to hide from the list */
  exclude?: ReadonlySet<string>;
  limit?: number;
};

/**
 * If query matches a registered label (exact or hiragana/katakana equivalent),
 * return the canonical registered spelling; otherwise null.
 */
export function findMatchingRegisteredLabel(
  query: string,
  candidates: readonly string[]
): string | null {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  for (const label of candidates) {
    const normalized = label.trim();
    if (normalized === trimmed) {
      return normalized;
    }
  }

  const queryKey = normalizeForMatch(trimmed);
  for (const label of candidates) {
    const normalized = label.trim();
    if (!normalized) {
      continue;
    }
    if (normalizeForMatch(normalized) === queryKey) {
      return normalized;
    }
  }

  return null;
}

/**
 * Partial-match suggestions; prefix matches ranked first.
 * Empty / whitespace-only query → no suggestions.
 * Hiragana and katakana are treated as the same for matching.
 */
export function filterLabelSuggestions(
  query: string,
  candidates: readonly string[],
  options?: FilterLabelSuggestionsOptions
): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const exclude = options?.exclude;
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const queryKey = normalizeForMatch(trimmed);

  const matched: string[] = [];
  for (const label of candidates) {
    const normalized = label.trim();
    if (!normalized) {
      continue;
    }
    if (exclude?.has(normalized)) {
      continue;
    }
    if (normalized === trimmed) {
      continue;
    }
    const labelKey = normalizeForMatch(normalized);
    if (!labelKey.includes(queryKey)) {
      continue;
    }
    matched.push(normalized);
  }

  matched.sort((left, right) => {
    const leftKey = normalizeForMatch(left);
    const rightKey = normalizeForMatch(right);
    const leftPrefix = leftKey.startsWith(queryKey);
    const rightPrefix = rightKey.startsWith(queryKey);
    if (leftPrefix !== rightPrefix) {
      return leftPrefix ? -1 : 1;
    }
    return left.localeCompare(right, 'ja', { sensitivity: 'base' });
  });

  return matched.slice(0, limit);
}
