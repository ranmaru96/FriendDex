import type { SwitchProps, TextStyle, ViewStyle } from 'react-native';
import type { AppThemeContentColorFields } from '@/constants/appThemes/contentColors';
import type { AppThemeVariant } from '@/constants/appThemes/types';
import { isLightHexColor, withAlpha } from '@/utils/colorHelpers';

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

/** 塗りつぶし操作ボタン。枠色ではなく本文色で塗り、カード色をインクにする */
export function contentFilledButtonStyle(c: AppThemeContentColorFields): ViewStyle {
  return {
    backgroundColor: c.contentText,
    borderColor: c.contentText,
  };
}

export function contentFilledButtonTextStyle(c: AppThemeContentColorFields): TextStyle {
  return { color: c.contentCard };
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

/** Switch のトラック／つまみ（アクセント緑は使わず、オフ時もカード面と差がつく色） */
export function contentSwitchColors(c: AppThemeContentColorFields): {
  trackColor: { false: string; true: string };
  thumbColorOn: string;
  thumbColorOff: string;
  iosBackgroundColor: string;
} {
  const inkIsLight = isLightHexColor(c.contentText);
  const trackOff = c.contentSwitchTrackOff ?? withAlpha(c.contentText, inkIsLight ? 0.42 : 0.38);
  const trackOn = c.contentSwitchTrackOn ?? c.contentText;
  const thumbOff = c.contentSwitchThumbOff ?? (inkIsLight ? '#E6E6E6' : '#FFFFFF');
  const thumbOn = c.contentSwitchThumbOn ?? (inkIsLight ? c.contentCard : '#FFFFFF');
  return {
    trackColor: { false: trackOff, true: trackOn },
    thumbColorOn: thumbOn,
    thumbColorOff: thumbOff,
    iosBackgroundColor: trackOff,
  };
}

export function contentSwitchProps(
  c: AppThemeContentColorFields,
  value: boolean
): Pick<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'> {
  const colors = contentSwitchColors(c);
  return {
    trackColor: colors.trackColor,
    thumbColor: value ? colors.thumbColorOn : colors.thumbColorOff,
    ios_backgroundColor: colors.iosBackgroundColor,
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
