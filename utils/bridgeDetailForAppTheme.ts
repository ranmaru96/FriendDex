import type { AppThemeContentColorFields } from '@/constants/appThemes/contentColors';
import type { AppThemeVariant } from '@/constants/appThemes/types';
import {
  usesOffsetChrome,
  type DesignPatternColors,
  type DesignPatternId,
  type DesignPatternShape,
} from '@/constants/designPatterns';
import type { DetailDesignBundle, DetailThemeColors, InfoChipStyle } from '@/constants/detailThemes/types';

/** ブラック App テーマ時、人物タグは暗い塗り＋明るい枠・文字 */
const BLACK_INFO_CHIP_STYLES: Record<string, InfoChipStyle> = {
  所属: { backgroundColor: 'transparent', borderColor: '#a78bfa', color: '#c4b5fd', borderWidth: 1.5 },
  経験: { backgroundColor: 'transparent', borderColor: '#4ade80', color: '#86efac', borderWidth: 1.5 },
  特徴: { backgroundColor: 'transparent', borderColor: '#60a5fa', color: '#93c5fd', borderWidth: 1.5 },
  好物: { backgroundColor: 'transparent', borderColor: '#fbbf24', color: '#fde68a', borderWidth: 1.5 },
  苦手: { backgroundColor: 'transparent', borderColor: '#f87171', color: '#fca5a5', borderWidth: 1.5 },
  公開先: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.28)', color: '#A8A8A8', borderWidth: 1.5 },
  予定タグ: {
    backgroundColor: '#2a2a2a',
    borderColor: 'rgba(255,255,255,0.28)',
    color: '#F2F2F2',
    borderWidth: 1.5,
  },
};

function bridgeDetailColors(
  colors: DetailThemeColors,
  content: AppThemeContentColorFields,
  screenBackground: string
): DetailThemeColors {
  return {
    ...colors,
    background: screenBackground,
    card: content.contentCard,
    bgBase: screenBackground,
    bgSurface: content.contentCard,
    bgElevated: '#252525',
    border: content.contentBorder,
    textPrimary: content.contentText,
    textSecondary: content.contentTextSecondary,
    textMuted: content.contentTextSecondary,
    /** 通称・編集アイコンなど。暗背景上では明るく */
    accent: content.contentText,
    accentLight: '#2a2a2a',
    onAccent: '#ffffff',
    inputBg: content.contentInputBg,
    inputBorder: content.contentSearchFieldBorder,
    inputText: content.contentText,
    inputPlaceholder: content.contentTextSecondary,
    btnGhostBorder: content.contentBorder,
    btnGhostText: content.contentTextSecondary,
    barTrack: '#3a3a3a',
    barFill: content.contentText,
    barPct: content.contentText,
    heroTagBg: '#2a2a2a',
    heroTagText: content.contentText,
    heroByTagText: content.contentTextSecondary,
    heroBackground: content.contentCard,
    tabPaneBackground: content.contentCard,
    tabTrackBg: '#2a2a2a',
    tabTrackBorder: content.contentBorder,
    tabInactive: content.contentTextSecondary,
    tagChipBg: content.contentInputBg,
    tagAffilBorder: '#a78bfa',
    tagAffilText: '#c4b5fd',
    tagExpBorder: '#4ade80',
    tagExpText: '#86efac',
    tagCharBorder: '#60a5fa',
    tagCharText: '#93c5fd',
    tagLikeBorder: '#fbbf24',
    tagLikeText: '#fde68a',
    tagDislikeBorder: '#f87171',
    tagDislikeText: '#fca5a5',
    /** 件数セルはカードより一段上げて境目を出す */
    statBg: '#252525',
    statBorder: content.contentBorder,
    traitBg: content.contentCard,
    traitBorder: content.contentBorder,
    traitText: content.contentText,
    quoteText: content.contentText,
    quoteDateText: content.contentTextSecondary,
    episodeBg: content.contentCard,
    episodeBorder: content.contentBorder,
    episodeTitle: content.contentText,
    episodeDate: content.contentTextSecondary,
    habitAddButtonBg: '#2a2a2a',
    habitAddButtonBorder: content.contentBorder,
    multiValueCardBackground: content.contentCard,
    modalOptionSelectedBg: '#2a2a2a',
    modalCloseButtonBg: '#2a2a2a',
    profileCardBorderColor: content.contentBorder,
  };
}

/** ブラック時、タブのカテゴリ色を少し明るくして暗トラック上で読めるようにする */
const BLACK_TAB_COLORS: Record<string, string> = {
  情報: '#6b9eef',
  ステータス: '#e0c04a',
  エピソード: '#f0954a',
  習性: '#5bc47a',
  彼曰く: '#ef6b6b',
  メモ: '#a88aef',
};

function bridgeDetailColorsForWhite(
  colors: DetailThemeColors,
  content: AppThemeContentColorFields,
  screenBackground: string
): DetailThemeColors {
  return {
    ...colors,
    background: screenBackground,
    card: content.contentCard,
    bgBase: screenBackground,
    bgSurface: content.contentCard,
    bgElevated: content.contentInputBg,
    border: content.contentBorder,
    textPrimary: content.contentText,
    textSecondary: content.contentTextSecondary,
    textMuted: content.contentTextSecondary,
    accent: content.contentText,
    inputBg: content.contentInputBg,
    inputBorder: content.contentSearchFieldBorder,
    inputText: content.contentText,
    inputPlaceholder: content.contentTextSecondary,
    btnGhostBorder: content.contentBorder,
    btnGhostText: content.contentTextSecondary,
    heroBackground: content.contentCard,
    tabPaneBackground: content.contentCard,
    /** タスクバーは強めの白 */
    tabTrackBg: content.contentInputBg,
    tabTrackBorder: content.contentBorder,
    tabInactive: content.contentTextSecondary,
    tagChipBg: content.contentPersonTagBg,
    episodeBg: content.contentCard,
    episodeBorder: content.contentBorder,
    episodeTitle: content.contentText,
    episodeDate: content.contentTextSecondary,
    multiValueCardBackground: content.contentCard,
    traitBg: content.contentCard,
    traitBorder: content.contentBorder,
    traitText: content.contentText,
    quoteText: content.contentText,
    quoteDateText: content.contentTextSecondary,
    statBg: content.contentInputBg,
    statBorder: content.contentBorder,
    profileCardBorderColor: content.contentBorder,
  };
}

export type DetailPatternOverlay = {
  id: DesignPatternId;
  colors: DesignPatternColors;
  shape: DesignPatternShape;
};

function overlayCodexDetail(
  colors: DetailThemeColors,
  pattern: DetailPatternOverlay
): DetailThemeColors {
  const p = pattern.colors;
  return {
    ...colors,
    accent: p.accent,
    onAccent: p.addBtnInk,
    btnPrimaryBg: p.addBtn,
    btnPrimaryText: p.addBtnInk,
    primaryButtonBg: p.addBtn,
    primaryButtonText: p.addBtnInk,
    habitAddButtonBg: p.addBtn,
    habitAddButtonBorder: p.accent,
    roleToggleActiveBg: p.chipOn,
    roleToggleActiveText: p.chipOnInk,
    profileCardBorderWidth: pattern.shape.cardBorderWidth,
  };
}

/**
 * App モノクロ時、Detail / 共通項目の面・文字を AppTheme に揃える。
 * ブラックは人物タグ色も反転。ホワイトは面色のみ（カテゴリ色は維持）。
 * コーデックス時は主ボタン／アクセントのみ上乗せ（カテゴリ色は維持）。
 */
export function bridgeDetailBundleForAppTheme(
  bundle: DetailDesignBundle,
  appVariant: AppThemeVariant,
  content: AppThemeContentColorFields,
  screenBackground: string,
  pattern?: DetailPatternOverlay | null
): DetailDesignBundle {
  let next: DetailDesignBundle;
  if (appVariant === 'white') {
    next = {
      ...bundle,
      colors: bridgeDetailColorsForWhite(bundle.colors, content, screenBackground),
    };
  } else if (appVariant === 'black') {
    const infoChipStyles: Record<string, InfoChipStyle> = { ...bundle.infoChipStyles };
    for (const [key, style] of Object.entries(BLACK_INFO_CHIP_STYLES)) {
      infoChipStyles[key] = style;
    }
    next = {
      ...bundle,
      colors: bridgeDetailColors(bundle.colors, content, screenBackground),
      infoChipStyles,
      detailTabs: bundle.detailTabs.map((tab) => ({
        ...tab,
        color: BLACK_TAB_COLORS[tab.key] ?? tab.color,
      })),
    };
  } else {
    next = bundle;
  }

  if (pattern && usesOffsetChrome(pattern.id)) {
    return {
      ...next,
      colors: overlayCodexDetail(next.colors, pattern),
    };
  }
  return next;
}
