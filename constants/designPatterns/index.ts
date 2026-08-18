import { catalogDesignPattern, formatCatalogIndex } from './catalog';
import { codexDesignPattern, formatCodexIndex } from './codex';
import { monochromeDesignPattern } from './monochrome';
import type { DesignPattern, DesignPatternId, DesignPatternTone, DesignToneId } from './types';
import { toneIdFromAppTheme } from './types';
import type { AppThemeVariant } from '@/constants/appThemes/types';

export type {
  DesignPattern,
  DesignPatternColors,
  DesignPatternId,
  DesignPatternShape,
  DesignPatternTone,
  DesignToneId,
} from './types';
export { toneIdFromAppTheme, normalizeDesignPatternId, usesOffsetChrome } from './types';
export { applyDesignPatternToAppColors } from './applyToAppTheme';
export { catalogDesignPattern, formatCatalogIndex } from './catalog';
export { codexDesignPattern, formatCodexIndex } from './codex';
export { monochromeDesignPattern } from './monochrome';

/**
 * デザインパターン辞書。
 * 新しい見た目を残すときはファイルを足して、ここに登録する。
 * 画面は getDesignPattern('codex') のように名前で引く。
 */
const DESIGN_PATTERNS: Record<DesignPatternId, DesignPattern> = {
  monochrome: monochromeDesignPattern,
  codex: codexDesignPattern,
  catalog: catalogDesignPattern,
};

export const DESIGN_PATTERN_OPTIONS: { id: DesignPatternId; label: string; summary: string }[] = [
  {
    id: monochromeDesignPattern.id,
    label: monochromeDesignPattern.label,
    summary: monochromeDesignPattern.summary,
  },
  {
    id: catalogDesignPattern.id,
    label: catalogDesignPattern.label,
    summary: catalogDesignPattern.summary,
  },
  {
    id: codexDesignPattern.id,
    label: codexDesignPattern.label,
    summary: codexDesignPattern.summary,
  },
];

export function formatPatternIndex(patternId: DesignPatternId, index: number): string {
  if (patternId === 'catalog') return formatCatalogIndex(index);
  return formatCodexIndex(index);
}

export function getDesignPattern(id: DesignPatternId): DesignPattern {
  return DESIGN_PATTERNS[id] ?? monochromeDesignPattern;
}

export function getDesignPatternTone(
  patternId: DesignPatternId,
  appThemeVariant: AppThemeVariant
): { pattern: DesignPattern; tone: DesignPatternTone; toneId: DesignToneId } {
  const pattern = getDesignPattern(patternId);
  const toneId = toneIdFromAppTheme(appThemeVariant);
  return {
    pattern,
    toneId,
    tone: pattern.tones[toneId],
  };
}

export function listDesignPatterns(): DesignPattern[] {
  return DESIGN_PATTERN_OPTIONS.map((option) => DESIGN_PATTERNS[option.id]);
}
