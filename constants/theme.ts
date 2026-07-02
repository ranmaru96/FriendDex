// constants/theme.ts — FriendDex デザインシステム（ライト・ポップモダン）

/** プリミティブ（色の定義はここだけ） */
export const Palette = {
  background: '#F8F9FA',
  surface: '#d8d8de',
  card: '#FFFFFF',

  border: '#E2E8F0',
  borderSoft: '#E2E8F0',

  textPrimary: '#2B2D42',
  textSecondary: '#A0AEC0',
  heading: '#2B2D42',

  accent: '#4E9A87',
  accentLight: '#E8F4F1',

  fab: '#4E9A87',
  fabBorder: '#3D7A6B',
  fabText: '#FFFFFF',

  onAccent: '#FFFFFF',
  overlay: 'rgba(43, 45, 66, 0.45)',

  /** Home 人物カード一覧（カード外枠・写真外枠で共通） */
  homeCardBackground: '#d8d8de',
  homeCardPhotoInnerBorder: '#FFFFFF',
  homeCardPhotoPlaceholder: '#FFFFFF',
  homeCardPhotoPlaceholderText: '#444444',
  homeCardName: '#444444',
  /** ProfileCompleteness 段階別の homeCardBorder（グレー統一） */
  homeCardBorderLow: '#dddddd',
  homeCardBorderMid: '#bbbbbb',
  homeCardBorderHigh: '#888888',
  homeCardBorderComplete: '#666666',
  homeCardBorderWidth: 2,

  /** 各画面 SafeArea のベース背景（カード・サーフェスには使わない） */
  screenBase: '#444444',
  /** hideNav 系サブ画面トップバーの文字色 */
  topBarText: '#FFFFFF',
  /** hideNav 系サブ画面トップバーの下線 */
  topBarBorder: 'rgba(255, 255, 255, 0.15)',

  /** ボトムタブバーのベース背景 */
  tabBarBase: '#d8d8de',
  tabBarBorder: '#b8b8c4',
  /** 非アクティブアイコン・非アクティブラベル & アクティブタブピル（常に同値） */
  tabBarEmphasis: '#444444',

  /** 一覧・エピソードなど上部検索エリアのベース背景 */
  searchAreaBase: '#FFFFFF',
  /** 検索エリア内の入力・セレクト枠（tabBarBorder と同系） */
  searchFieldBorder: '#b8b8c4',
} as const;

/** セマンティック（画面・コンポーネントが参照） */
export const LightTheme = {
  ...Palette,

  // --- 背景（Detail 互換エイリアス）---
  bgBase: Palette.background,
  bgSurface: Palette.card,
  bgElevated: Palette.surface,

  // --- 文字（Detail 互換）---
  textMuted: Palette.textSecondary,

  borderStrong: Palette.textPrimary,

  // --- ヒーロー ---
  heroTagBg: Palette.accentLight,
  heroTagText: Palette.accent,

  // --- 入力 ---
  inputBg: Palette.card,
  inputBorder: Palette.border,
  searchFieldBorder: Palette.searchFieldBorder,
  inputText: Palette.textPrimary,
  inputPlaceholder: Palette.textSecondary,

  // --- ボタン ---
  btnPrimaryBg: Palette.accent,
  btnPrimaryText: Palette.onAccent,
  btnGhostBorder: Palette.border,
  btnGhostText: Palette.textSecondary,

  // --- ステータスバー ---
  barTrack: Palette.border,
  barFill: Palette.accent,
  barPct: Palette.accent,

  // --- タブ UI ---
  tabTrackBg: Palette.border,
  tabTrackBorder: Palette.border,
  tabInactive: Palette.textSecondary,
  tabActiveText: Palette.onAccent,
  tabBg: Palette.card,
  tabBorder: Palette.border,
  tabText: Palette.textSecondary,
  tabActiveBg: Palette.accent,
  tabActiveBorder: Palette.accent,
  tabActiveShadow: Palette.accent,

  // --- カード系 ---
  statBg: Palette.card,
  statBorder: Palette.border,
  traitBg: Palette.card,
  traitBorder: Palette.border,
  traitAccentLine: Palette.accent,
  traitText: Palette.textPrimary,
  quoteText: Palette.textPrimary,
  quoteDateText: Palette.textSecondary,
  episodeBg: Palette.card,
  episodeBorder: Palette.border,
  episodeTitle: Palette.textPrimary,
  episodeDate: Palette.textSecondary,

  // --- カテゴリチップ（パターンA：統一グレー）---
  tagAffilBorder: Palette.border,
  tagAffilText: Palette.textPrimary,
  tagExpBorder: Palette.border,
  tagExpText: Palette.textPrimary,
  tagCharBorder: Palette.border,
  tagCharText: Palette.textPrimary,
  tagLikeBorder: Palette.border,
  tagLikeText: Palette.textPrimary,
  tagDislikeBorder: Palette.border,
  tagDislikeText: Palette.textPrimary,
  tagChipBg: Palette.border,

  // --- 公開設定バッジ ---
  badgePrivateBg: Palette.border,
  badgePrivateText: Palette.textSecondary,
  badgePublicBg: Palette.accentLight,
  badgePublicText: Palette.accent,
  badgeLimitedBg: Palette.border,
  badgeLimitedText: Palette.textPrimary,

  // --- BottomNav ---
  navShell: Palette.surface,
  navTrack: Palette.background,
  navTrackBorder: Palette.border,
  navPillActive: Palette.accentLight,
  navInactive: Palette.textSecondary,
  navActive: Palette.textPrimary,
  tabBarInactiveIcon: Palette.tabBarEmphasis,
  tabBarInactiveLabel: Palette.tabBarEmphasis,
  tabBarActivePill: Palette.tabBarEmphasis,
} as const;

export const RPGTheme = {
  bgBase: '#0d0d14',
  bgSurface: '#13131f',
  bgElevated: '#1e1e2e',
  border: '#2a2a3a',
  borderStrong: '#a78bfa',
  textPrimary: '#e8e8f0',
  textSecondary: '#9ca3af',
  textMuted: '#555566',
  accent: '#a78bfa',
  accentLight: '#c4b5fd',
  heroTagBg: '#2d1f50',
  heroTagText: '#c4b5fd',
  tagAffilBorder: '#7060c0',
  tagAffilText: '#c4b5fd',
  tagExpBorder: '#2a7a4a',
  tagExpText: '#86efac',
  tagCharBorder: '#3060a0',
  tagCharText: '#93c5fd',
  tagLikeBorder: '#9a7a00',
  tagLikeText: '#fde68a',
  tagDislikeBorder: '#a03030',
  tagDislikeText: '#f87171',
  statBg: '#13131f',
  statBorder: '#3a3a50',
  barTrack: '#2a2a3a',
  barFill: '#a78bfa',
  barPct: '#a78bfa',
  tabBg: '#13131f',
  tabBorder: '#2a2a3a',
  tabText: '#555566',
  tabActiveBg: '#1e1230',
  tabActiveBorder: '#a78bfa',
  tabActiveText: '#c4b5fd',
  tabActiveShadow: '#a78bfa',
  traitBg: '#13131f',
  traitBorder: '#2a2a3a',
  traitAccentLine: '#a78bfa',
  traitText: '#c4c4d4',
  quoteText: '#c4b5fd',
  quoteDateText: '#555566',
  episodeBg: '#13131f',
  episodeBorder: '#2a2a3a',
  episodeTitle: '#e8e8f0',
  episodeDate: '#555566',
  badgePrivateBg: '#1e1e2e',
  badgePrivateText: '#555566',
  badgePublicBg: '#0f2e28',
  badgePublicText: '#5eead4',
  badgeLimitedBg: '#2d1f50',
  badgeLimitedText: '#c4b5fd',
  inputBg: '#0d0d14',
  inputBorder: '#2a2a3a',
  inputText: '#e8e8f0',
  inputPlaceholder: '#555566',
  btnPrimaryBg: '#a78bfa',
  btnPrimaryText: '#0d0d14',
  btnGhostBorder: '#2a2a3a',
  btnGhostText: '#555566',
} as const;

export const Theme = LightTheme;
export type AppTheme = typeof LightTheme;

/** Detail タブ（ライトモード：アクティブのみアクセント、非アクティブは tabInactive） */
export const DetailTabColors = {
  情報: Palette.accent,
  ステータス: Palette.accent,
  エピソード: Palette.accent,
  習性: Palette.accent,
  彼曰く: Palette.accent,
  メモ: Palette.accent,
} as const;

/** 後方互換 */
export const Colors = {
  bgBase: Theme.bgBase,
  bgSurface: Theme.bgSurface,
  bgElevated: Theme.bgElevated,
  border: Theme.border,
  accent: Theme.accent,
  accentLight: Theme.accentLight,
  textPrimary: Theme.textPrimary,
  textMuted: Theme.textMuted,
  textMid: Theme.textSecondary,
} as const;

export const BorderWidth = {
  card: 1,
  cardEmphasis: 2,
  input: 1,
} as const;

export const Radius = { sm: 8, md: 12, lg: 14, photo: 10, full: 999 } as const;

/** 一覧・Detail の人物カード共通シャドウ */
export const HomeCardElevation = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.65,
  shadowRadius: 12,
  elevation: 16,
} as const;

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16 } as const;
/** ボトムタブ画面の左右余白（一覧・共通項目・カレンダー・エピソード・ツール・友達） */
export const ScreenHorizontalInset = Spacing.lg;
export const Typography = {
  xs: 9,
  sm: 11,
  base: 13,
  lg: 16,
  xl: 20,
  xxl: 22,
} as const;
