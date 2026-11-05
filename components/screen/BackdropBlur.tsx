import { requireOptionalNativeModule } from 'expo-modules-core';
import { type ComponentType } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type NativeBlurProps = {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
};

/** 今の Dev Client に ExpoBlur が無いときは null。画面を落とさない */
const NativeBlur: ComponentType<NativeBlurProps> | null = (() => {
  if (!requireOptionalNativeModule('ExpoBlur')) {
    return null;
  }
  try {
    return require('expo-blur').BlurView as ComponentType<NativeBlurProps>;
  } catch {
    return null;
  }
})();

export const BACKDROP_BLUR_INTENSITY = 80;

const FALLBACK_VEIL = {
  dark: 'rgba(0,0,0,0.68)',
  light: 'rgba(255,255,255,0.8)',
} as const;

export function BackdropBlur({
  tint,
  intensity = BACKDROP_BLUR_INTENSITY,
  style,
}: {
  tint: 'light' | 'dark';
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = style ?? StyleSheet.absoluteFill;
  if (NativeBlur) {
    return <NativeBlur pointerEvents="none" intensity={intensity} tint={tint} style={fill} />;
  }
  return (
    <View
      pointerEvents="none"
      style={[fill, { backgroundColor: FALLBACK_VEIL[tint] }]}
    />
  );
}
