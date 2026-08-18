import type { AppThemeVariant } from '@/constants/appThemes/types';

/** デザインパターンの識別子（コード用）。画面表示は label を使う。 */
export type DesignPatternId = 'monochrome' | 'codex' | 'catalog';

/** 同一パターン内の明暗。アプリのホワイト／ブラックに対応させる。 */
export type DesignToneId = 'light' | 'dark';

/** 形・間隔。配色とは独立して覚える。 */
export type DesignPatternShape = {
  cardBorderRadius: number;
  cardBorderWidth: number;
  cardPadding: number;
  /** カードのずらした影。0 ならオフセットなし */
  offsetDistance: number;
  cornerBrackets: boolean;
  bracketSize: number;
  innerRadius: number;
  kickerLetterSpacing: number;
};

/** 画面・カードで共有する色。パターンごとに中身が違う。 */
export type DesignPatternColors = {
  screen: string;
  card: string;
  cardInk: string;
  cardMuted: string;
  accent: string;
  accentSoft: string;
  /** 二次アクセント（コーデックスのシアン。モノクロームでは枠色に寄せる） */
  cyan: string;
  gold: string;
  offset: string;
  headerBg: string;
  headerBorder: string;
  chipBg: string;
  chipOn: string;
  chipOnInk: string;
  logBg: string;
  quote: string;
  addBtn: string;
  addBtnInk: string;
};

export type DesignPatternTone = {
  id: DesignToneId;
  /** 例: ホワイト / ブラック、紙 / HUD */
  label: string;
  colors: DesignPatternColors;
};

export type DesignPattern = {
  id: DesignPatternId;
  /** 例: モノクローム / コーデックス */
  label: string;
  summary: string;
  shape: DesignPatternShape;
  tones: Record<DesignToneId, DesignPatternTone>;
};

export function toneIdFromAppTheme(variant: AppThemeVariant): DesignToneId {
  return variant === 'black' ? 'dark' : 'light';
}

export function normalizeDesignPatternId(value: string | null | undefined): DesignPatternId {
  if (value === 'codex' || value === 'catalog') return value;
  return 'monochrome';
}

/** ずらし影カードを使うパターン（コーデックス / 静かな図鑑） */
export function usesOffsetChrome(id: DesignPatternId | null | undefined): boolean {
  return id === 'codex' || id === 'catalog';
}
