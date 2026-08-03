import { Theme } from '@/constants/theme';

/** AppThemeColors のコンテンツ面（カード・検索・リストなど） */
export type AppThemeContentColorFields = {
  contentCard: string;
  contentBorder: string;
  contentText: string;
  contentTextSecondary: string;
  contentPersonTagBg: string;
  contentSearchArea: string;
  contentSearchFieldBorder: string;
  contentInputBg: string;
  contentPhotoInnerBorder: string;
  contentPhotoPlaceholder: string;
  contentPhotoPlaceholderText: string;
  contentCardName: string;
  contentCalendarInMonth: string;
  contentCalendarOutMonth: string;
  contentDivider: string;
};

/** デフォルト用（現行 Theme と同等） */
export const lightContentColors: AppThemeContentColorFields = {
  contentCard: Theme.card,
  contentBorder: Theme.border,
  contentText: Theme.textPrimary,
  contentTextSecondary: Theme.textSecondary,
  contentPersonTagBg: '#F7F7F8',
  contentSearchArea: Theme.searchAreaBase,
  contentSearchFieldBorder: Theme.searchFieldBorder,
  contentInputBg: Theme.card,
  contentPhotoInnerBorder: Theme.homeCardPhotoInnerBorder,
  contentPhotoPlaceholder: Theme.homeCardPhotoPlaceholder,
  contentPhotoPlaceholderText: Theme.homeCardPhotoPlaceholderText,
  contentCardName: Theme.homeCardName,
  contentCalendarInMonth: '#f1f5f9',
  contentCalendarOutMonth: Theme.card,
  contentDivider: Theme.border,
};

/**
 * ホワイト用。画面(#F2) より手前の面は強めの白(#FFF)。
 * カレンダーのみ当月=強め・前後月=弱め（ブラックの明暗反転とは別の読みやすさ優先）。
 */
export const whiteContentColors: AppThemeContentColorFields = {
  contentCard: '#FFFFFF',
  contentBorder: 'rgba(0, 0, 0, 0.18)',
  contentText: '#111111',
  contentTextSecondary: '#666666',
  contentPersonTagBg: '#FFFFFF',
  contentSearchArea: '#FFFFFF',
  contentSearchFieldBorder: 'rgba(0, 0, 0, 0.28)',
  contentInputBg: '#FFFFFF',
  contentPhotoInnerBorder: '#F2F2F2',
  contentPhotoPlaceholder: '#FFFFFF',
  contentPhotoPlaceholderText: '#666666',
  contentCardName: '#111111',
  contentCalendarInMonth: '#FFFFFF',
  contentCalendarOutMonth: '#EBEBEB',
  contentDivider: 'rgba(0, 0, 0, 0.14)',
};

/** ブラック用（ホワイト形状を保った色反転） */
export const darkContentColors: AppThemeContentColorFields = {
  contentCard: '#1c1c1c',
  contentBorder: 'rgba(255, 255, 255, 0.18)',
  contentText: '#F2F2F2',
  contentTextSecondary: '#A8A8A8',
  contentPersonTagBg: '#252525',
  contentSearchArea: '#1c1c1c',
  contentSearchFieldBorder: 'rgba(255, 255, 255, 0.28)',
  contentInputBg: '#252525',
  contentPhotoInnerBorder: '#111111',
  contentPhotoPlaceholder: '#2a2a2a',
  contentPhotoPlaceholderText: '#cccccc',
  contentCardName: '#F2F2F2',
  contentCalendarInMonth: '#141414',
  contentCalendarOutMonth: '#1c1c1c',
  contentDivider: 'rgba(255, 255, 255, 0.14)',
};
