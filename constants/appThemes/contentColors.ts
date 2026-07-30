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

/** デフォルト / ホワイト用（現行 Theme と同等） */
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
  contentCalendarInMonth: Theme.card,
  contentCalendarOutMonth: '#f1f5f9',
  contentDivider: Theme.border,
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
  contentCalendarInMonth: '#1c1c1c',
  contentCalendarOutMonth: '#141414',
  contentDivider: 'rgba(255, 255, 255, 0.14)',
};
