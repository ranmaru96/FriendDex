// constants/theme.ts

export const LightTheme = {
  // 背景
  bgBase:     '#f0f0f2',
  bgSurface:  '#ffffff',
  bgElevated: '#f8f8f8',

  // ボーダー
  border:       '#aaaaaa',
  borderStrong: '#333333',

  // テキスト
  textPrimary:   '#111111',
  textSecondary: '#555555',
  textMuted:     '#888888',

  // アクセント（タブ・バー・アクティブ）
  accent:      '#333333',
  accentLight: '#f0f0f2',

  // ヒーロータグ（塗りつぶし）
  heroTagBg:   '#333333',
  heroTagText: '#f0f0f2',

  // セクションタグ（輪郭線のみ）- 所属
  tagAffilBorder: '#7c5cbf',
  tagAffilText:   '#5c3a9f',
  // 経験
  tagExpBorder:   '#2a9d5a',
  tagExpText:     '#1a6b38',
  // 性格
  tagCharBorder:  '#3a7abf',
  tagCharText:    '#1a4a8a',
  // 好物
  tagLikeBorder:  '#c49a00',
  tagLikeText:    '#7a5f00',
  // 苦手
  tagDislikeBorder: '#bf4a3a',
  tagDislikeText:   '#8a1a1a',

  // Statカード
  statBg:     '#ffffff',
  statBorder: '#aaaaaa',

  // バー
  barTrack: '#cccccc',
  barFill:  '#333333',
  barPct:   '#111111',

  // タブ
  tabBg:           '#ffffff',
  tabBorder:       '#bbbbbb',
  tabText:         '#999999',
  tabActiveBg:     '#ffffff',
  tabActiveBorder: '#333333',
  tabActiveText:   '#111111',
  tabActiveShadow: '#333333',

  // トレイト・彼曰くカード
  traitBg:          '#ffffff',
  traitBorder:      '#aaaaaa',
  traitAccentLine:  '#555555',
  traitText:        '#222222',
  quoteText:        '#333333',
  quoteDateText:    '#888888',

  // エピソードカード
  episodeBg:      '#ffffff',
  episodeBorder:  '#aaaaaa',
  episodeTitle:   '#111111',
  episodeDate:    '#888888',

  // 公開設定バッジ
  badgePrivateBg:   '#eeeeee',
  badgePrivateText: '#666666',
  badgePublicBg:    '#d8f0ec',
  badgePublicText:  '#1a6b5a',
  badgeLimitedBg:   '#ede8f8',
  badgeLimitedText: '#5c3a9f',

  // 入力フォーム
  inputBg:          '#ffffff',
  inputBorder:      '#aaaaaa',
  inputText:        '#111111',
  inputPlaceholder: '#aaaaaa',

  // ボタン
  btnPrimaryBg:   '#222222',
  btnPrimaryText: '#f0f0f2',
  btnGhostBorder: '#aaaaaa',
  btnGhostText:   '#555555',
} as const;

export const RPGTheme = {
  // 背景
  bgBase:     '#0d0d14',
  bgSurface:  '#13131f',
  bgElevated: '#1e1e2e',

  // ボーダー
  border:       '#2a2a3a',
  borderStrong: '#a78bfa',

  // テキスト
  textPrimary:   '#e8e8f0',
  textSecondary: '#9ca3af',
  textMuted:     '#555566',

  // アクセント
  accent:      '#a78bfa',
  accentLight: '#c4b5fd',

  // ヒーロータグ
  heroTagBg:   '#2d1f50',
  heroTagText: '#c4b5fd',

  // セクションタグ - 所属
  tagAffilBorder: '#7060c0',
  tagAffilText:   '#c4b5fd',
  // 経験
  tagExpBorder:   '#2a7a4a',
  tagExpText:     '#86efac',
  // 性格
  tagCharBorder:  '#3060a0',
  tagCharText:    '#93c5fd',
  // 好物
  tagLikeBorder:  '#9a7a00',
  tagLikeText:    '#fde68a',
  // 苦手
  tagDislikeBorder: '#a03030',
  tagDislikeText:   '#f87171',

  // Statカード
  statBg:     '#13131f',
  statBorder: '#3a3a50',

  // バー
  barTrack: '#2a2a3a',
  barFill:  '#a78bfa',
  barPct:   '#a78bfa',

  // タブ
  tabBg:           '#13131f',
  tabBorder:       '#2a2a3a',
  tabText:         '#555566',
  tabActiveBg:     '#1e1230',
  tabActiveBorder: '#a78bfa',
  tabActiveText:   '#c4b5fd',
  tabActiveShadow: '#a78bfa',

  // トレイト・彼曰くカード
  traitBg:         '#13131f',
  traitBorder:     '#2a2a3a',
  traitAccentLine: '#a78bfa',
  traitText:       '#c4c4d4',
  quoteText:       '#c4b5fd',
  quoteDateText:   '#555566',

  // エピソードカード
  episodeBg:     '#13131f',
  episodeBorder: '#2a2a3a',
  episodeTitle:  '#e8e8f0',
  episodeDate:   '#555566',

  // 公開設定バッジ
  badgePrivateBg:   '#1e1e2e',
  badgePrivateText: '#555566',
  badgePublicBg:    '#0f2e28',
  badgePublicText:  '#5eead4',
  badgeLimitedBg:   '#2d1f50',
  badgeLimitedText: '#c4b5fd',

  // 入力フォーム
  inputBg:          '#0d0d14',
  inputBorder:      '#2a2a3a',
  inputText:        '#e8e8f0',
  inputPlaceholder: '#555566',

  // ボタン
  btnPrimaryBg:   '#a78bfa',
  btnPrimaryText: '#0d0d14',
  btnGhostBorder: '#2a2a3a',
  btnGhostText:   '#555566',
} as const;

// 現在のアクティブテーマ（LG固定、後でAsyncStorageから動的切替に変更予定）
export const Theme = LightTheme;

// 型エクスポート
export type AppTheme = typeof LightTheme;

// 後方互換用（既存のColors/Radius/Typographyを参照している箇所向け）
export const Colors = {
  bgBase:      Theme.bgBase,
  bgSurface:   Theme.bgSurface,
  bgElevated:  Theme.bgElevated,
  border:      Theme.border,
  accent:      Theme.accent,
  accentLight: Theme.accentLight,
  textPrimary: Theme.textPrimary,
  textMuted:   Theme.textMuted,
  textMid:     Theme.textSecondary,
} as const;

export const Radius = { sm: 8, md: 12, lg: 14, full: 999 } as const;
export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16 } as const;
export const Typography = {
  xs: 9, sm: 11, base: 13, lg: 16, xl: 20, xxl: 22,
} as const;
