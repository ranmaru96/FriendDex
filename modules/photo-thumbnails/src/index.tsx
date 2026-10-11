import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Image } from 'expo-image';
import { memo, type ComponentType } from 'react';
import { type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

type PhotoThumbnailsModule = {
  prepare(assetIds: string[], pixelSize: number, high: boolean): void;
};

type PhotoThumbViewProps = {
  assetId: string;
  pixelSize: number;
  highQuality: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
};

const nativeModule = requireOptionalNativeModule<PhotoThumbnailsModule>('PhotoThumbnails');

const NativePhotoThumbView: ComponentType<PhotoThumbViewProps> | null = nativeModule
  ? requireNativeView('PhotoThumbnails')
  : null;

/** high は止まったあとの差し替え用。iOS では画質の高い取り方で先に用意する。 */
export function preparePhotoThumbnails(assetIds: string[], pixelSize: number, high = false) {
  if (!nativeModule || assetIds.length === 0 || pixelSize <= 0) {
    return;
  }
  try {
    nativeModule.prepare(assetIds, pixelSize, high);
  } catch {
    // 旧 Dev Client など、ネイティブの引数が合わないときは呼び出し元へ伝えない。
  }
}

type PhotoLibraryThumbProps = {
  assetId: string;
  uri: string;
  pixelSize: number;
  /** 今の画像を出したまま、高画質が届いたら差し替える。 */
  highQuality?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const PhotoLibraryThumb = memo(function PhotoLibraryThumb({
  assetId,
  uri,
  pixelSize,
  highQuality = false,
  style,
}: PhotoLibraryThumbProps) {
  if (NativePhotoThumbView) {
    return (
      <NativePhotoThumbView
        assetId={assetId}
        pixelSize={pixelSize}
        highQuality={highQuality}
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
