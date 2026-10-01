import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Image } from 'expo-image';
import { memo, type ComponentType } from 'react';
import { type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

type PhotoThumbnailsModule = {
  prepare(assetIds: string[], pixelSize: number): void;
};

type PhotoThumbViewProps = {
  assetId: string;
  pixelSize: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
};

const nativeModule = requireOptionalNativeModule<PhotoThumbnailsModule>('PhotoThumbnails');

const NativePhotoThumbView: ComponentType<PhotoThumbViewProps> | null = nativeModule
  ? requireNativeView('PhotoThumbnails')
  : null;

export function preparePhotoThumbnails(assetIds: string[], pixelSize: number) {
  if (!nativeModule || assetIds.length === 0 || pixelSize <= 0) {
    return;
  }
  nativeModule.prepare(assetIds, pixelSize);
}

type PhotoLibraryThumbProps = {
  assetId: string;
  uri: string;
  pixelSize: number;
  style?: StyleProp<ViewStyle>;
};

export const PhotoLibraryThumb = memo(function PhotoLibraryThumb({
  assetId,
  uri,
  pixelSize,
  style,
}: PhotoLibraryThumbProps) {
  if (NativePhotoThumbView) {
    return (
      <NativePhotoThumbView
        assetId={assetId}
        pixelSize={pixelSize}
        pointerEvents="none"
        style={style}
      />
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style as StyleProp<ImageStyle>}
      contentFit="cover"
      recyclingKey={assetId}
      cachePolicy="memory-disk"
      transition={0}
      allowDownscaling
      pointerEvents="none"
    />
  );
});
