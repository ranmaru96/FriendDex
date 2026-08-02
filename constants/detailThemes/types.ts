import type { DetailTabKey } from './tabs';

export type DetailDesignVariant = 'main';

export type DetailTabMode = 'perTab' | 'accentOnly';

export type DetailThemeColors = {
  background: string;
  card: string;
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  onAccent: string;
  overlay: string;
  heroTagBg: string;
  heroTagText: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  btnPrimaryBg: string;
  btnPrimaryText: string;
  btnGhostBorder: string;
  btnGhostText: string;
  barTrack: string;
  barFill: string;
  barPct: string;
  tabTrackBg: string;
  tabTrackBorder: string;
  tabInactive: string;
  tabActiveText: string;
  tagChipBg: string;
  tagAffilBorder: string;
  tagAffilText: string;
  tagExpBorder: string;
  tagExpText: string;
  tagCharBorder: string;
  tagCharText: string;
  tagLikeBorder: string;
  tagLikeText: string;
  tagDislikeBorder: string;
  tagDislikeText: string;
  statBg: string;
  statBorder: string;
  traitBg: string;
  traitBorder: string;
  traitAccentLine: string;
  traitText: string;
  quoteText: string;
  quoteDateText: string;
  episodeBg: string;
  episodeBorder: string;
  episodeTitle: string;
  episodeDate: string;
  badgePrivateBg: string;
  badgePrivateText: string;
  badgePublicBg: string;
  badgePublicText: string;
  badgeLimitedBg: string;
  badgeLimitedText: string;
  profileCardBorderWidth: number;
  profileCardBorderColor: string;
  heroBackground: string;
  heroPhotoInitialBg: string;
  heroPhotoInitialBorder: string;
  heroPhotoInitialText: string;
  heroByTagText: string;
  tabPaneBackground: string;
  multiValueCardBackground: string;
  primaryButtonBg: string;
  primaryButtonText: string;
  modalOptionSelectedBg: string;
  modalCloseButtonBg: string;
  roleToggleActiveBg: string;
  roleToggleActiveText: string;
  habitAddButtonBg: string;
  habitAddButtonBorder: string;
};

export type InfoChipStyle = {
  backgroundColor: string;
  borderColor: string;
  color: string;
  borderWidth: number;
};

export type DetailTabDef = {
  key: DetailTabKey;
  icon: string;
  iconSet?: 'ionicons' | 'material';
  caption: string;
  color: string;
};

export type DetailDesignBundle = {
  variant: DetailDesignVariant;
  label: string;
  tabMode: DetailTabMode;
  colors: DetailThemeColors;
  detailTabs: DetailTabDef[];
  infoChipStyles: Record<string, InfoChipStyle>;
};
