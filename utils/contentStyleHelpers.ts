import type { TextStyle, ViewStyle } from 'react-native';
import type { AppThemeContentColorFields } from '@/constants/appThemes/contentColors';
import type { AppThemeVariant } from '@/constants/appThemes/types';

/** カード／パネルの面 */
export function contentSurfaceStyle(c: AppThemeContentColorFields): ViewStyle {
  return {
    backgroundColor: c.contentCard,
    borderColor: c.contentBorder,
  };
}

export function contentInputStyle(c: AppThemeContentColorFields): ViewStyle & TextStyle {
  return {
    backgroundColor: c.contentInputBg,
    borderColor: c.contentSearchFieldBorder,
    color: c.contentText,
  };
}

export function contentTextStyle(c: AppThemeContentColorFields): TextStyle {
  return { color: c.contentText };
}

export function contentMutedTextStyle(c: AppThemeContentColorFields): TextStyle {
  return { color: c.contentTextSecondary };
}

/** 小さなタグ／チップ（人物・予定タグなど） */
export function contentTagStyle(c: AppThemeContentColorFields): ViewStyle {
  return {
    backgroundColor: c.contentInputBg,
    borderColor: c.contentBorder,
  };
}

/** 人物タグ専用。白黒テーマで背景を安定させる */
export function contentPersonTagStyle(c: AppThemeContentColorFields): ViewStyle {
  return {
    backgroundColor: c.contentPersonTagBg,
    borderColor: c.contentBorder,
  };
}

export function contentTagTextStyle(c: AppThemeContentColorFields): TextStyle {
  return { color: c.contentText };
}

export function contentSearchAreaStyle(c: AppThemeContentColorFields): ViewStyle {
  return {
    backgroundColor: c.contentSearchArea,
    borderColor: c.contentSearchFieldBorder,
  };
}

/** モーダル内の選択中オプション行 */
export function contentSelectedOptionStyle(c: AppThemeContentColorFields): ViewStyle {
  return {
    backgroundColor: c.contentInputBg,
    borderColor: c.contentText,
    borderWidth: 1,
  };
}

/** Switch のトラック／つまみ（true 時はアクセントではなくコンテンツ面で） */
export function contentSwitchColors(c: AppThemeContentColorFields): {
  trackColor: { false: string; true: string };
  thumbColorOn: string;
  thumbColorOff: string;
} {
  return {
    trackColor: { false: c.contentBorder, true: c.contentPersonTagBg },
    thumbColorOn: c.contentText,
    thumbColorOff: c.contentCard,
  };
}

/** iOS DateTimePicker のスピナー文字色（ブラックテーマ向け） */
export function contentDateTimePickerProps(
  variant: AppThemeVariant | null | undefined
): { themeVariant: 'dark'; textColor: string } | Record<string, never> {
  if (variant === 'black') {
    return { themeVariant: 'dark', textColor: '#FFFFFF' };
  }
  return {};
}
