import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import type { Action } from 'expo-image-manipulator';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '@/constants/theme';
import { persistImageFile } from '@/utils/persistImageFile';

/** エピソードカード表示と同じ横4:縦3 */
export const EPISODE_PHOTO_ASPECT = 4 / 3;

type PhotoCropModalProps = {
  visible: boolean;
  uri: string | null;
  /** width / height。人物カードは 1、エピソードは 4/3 */
  aspectRatio?: number;
  hint?: string;
  /** 別モーダルにせず、親の中へ重ねて出す。写真一覧の上に調整を出すときに使う。 */
  embedded?: boolean;
  /** この回で調整する写真。一番下のプレビューに出す。 */
  previews?: { id: string; uri: string }[];
  activePreviewIndex?: number;
  onSelectPreview?: (index: number) => void;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
};

type ImageSize = { width: number; height: number };

type CropDraft = {
  workingUri: string;
  width: number;
  height: number;
  translateX: number;
  translateY: number;
  scale: number;
};

const PREVIEW_WIDTH = 72;

const SCREEN = Dimensions.get('window');
const OUTPUT_MAX = 1024;

function clampJs(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** 枠からはみ出した分だけ動かせる。枠と写真が同じ幅なら、その方向には動かない。 */
function clampCoverTranslate(value: number, displayed: number, frame: number) {
  'worklet';
  const limit = Math.max(0, (displayed - frame) / 2);
  return Math.min(limit, Math.max(-limit, value));
}

function PreviewStill({
  draft,
  frameWidth,
  frameHeight,
  cropWidth,
  cropHeight,
}: {
  draft: CropDraft;
  frameWidth: number;
  frameHeight: number;
  cropWidth: number;
  cropHeight: number;
}) {
  const ratio = frameWidth / cropWidth;
  const baseScale = Math.max(cropWidth / draft.width, cropHeight / draft.height);
  const displayScale = baseScale * draft.scale * ratio;
  return (
    <Image
      source={{ uri: draft.workingUri }}
      style={{
        width: draft.width * displayScale,
        height: draft.height * displayScale,
        transform: [
          { translateX: draft.translateX * ratio },
          { translateY: draft.translateY * ratio },
        ],
      }}
      resizeMode="stretch"
    />
  );
}

export function PhotoCropModal({
  visible,
  uri,
  aspectRatio = 1,
  hint = 'ピンチで拡大・ドラッグで位置調整',
  embedded = false,
  previews = [],
  activePreviewIndex = 0,
  onSelectPreview,
  onCancel,
  onConfirm,
}: PhotoCropModalProps) {
  const insets = useSafeAreaInsets();
  const [workingUri, setWorkingUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const imageWidth = useSharedValue(0);
  const imageHeight = useSharedValue(0);
  const baseScaleSv = useSharedValue(1);
  const cropWidthSv = useSharedValue(1);
  const cropHeightSv = useSharedValue(1);
  const draftsRef = useRef<Map<string, CropDraft>>(new Map());
  const previewsRef = useRef(previews);
  const activePreviewIndexRef = useRef(activePreviewIndex);
  previewsRef.current = previews;
  activePreviewIndexRef.current = activePreviewIndex;

  const cropWidth = useMemo(() => Math.min(SCREEN.width - 32, SCREEN.width * 0.88), []);
  const cropHeight = useMemo(() => cropWidth / aspectRatio, [aspectRatio, cropWidth]);

  useEffect(() => {
    cropWidthSv.value = cropWidth;
    cropHeightSv.value = cropHeight;
  }, [cropHeight, cropHeightSv, cropWidth, cropWidthSv]);

  const resetTransform = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    startX.value = 0;
    startY.value = 0;
    startScale.value = 1;
  }, [scale, startScale, startX, startY, translateX, translateY]);

  useEffect(() => {
    if (!visible || !uri) {
      setWorkingUri(null);
      setImageSize(null);
      setError('');
      setBusy(false);
      resetTransform();
      return;
    }

    setError('');
    setBusy(false);
    const previewId = previewsRef.current[activePreviewIndexRef.current]?.id;
    const draft = previewId ? draftsRef.current.get(previewId) : undefined;
    if (draft) {
      setWorkingUri(draft.workingUri);
      setImageSize({ width: draft.width, height: draft.height });
      imageWidth.value = draft.width;
      imageHeight.value = draft.height;
      const nextBase = Math.max(cropWidth / draft.width, cropHeight / draft.height);
      baseScaleSv.value = nextBase;
      const displayScale = nextBase * draft.scale;
      translateX.value = clampJs(
        draft.translateX,
        -Math.max(0, (draft.width * displayScale - cropWidth) / 2),
        Math.max(0, (draft.width * displayScale - cropWidth) / 2)
      );
      translateY.value = clampJs(
        draft.translateY,
        -Math.max(0, (draft.height * displayScale - cropHeight) / 2),
        Math.max(0, (draft.height * displayScale - cropHeight) / 2)
      );
      scale.value = draft.scale;
      return;
    }
    setWorkingUri(uri);
    resetTransform();
    Image.getSize(
      uri,
      (width, height) => {
        setImageSize({ width, height });
        imageWidth.value = width;
        imageHeight.value = height;
        const nextBase = Math.max(cropWidth / width, cropHeight / height);
        baseScaleSv.value = nextBase;
      },
      () => setError('画像サイズの取得に失敗しました。')
    );
  }, [
    baseScaleSv,
    cropHeight,
    cropWidth,
    imageHeight,
    imageWidth,
    resetTransform,
    uri,
    visible,
  ]);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      const displayScale = baseScaleSv.value * scale.value;
      translateX.value = clampCoverTranslate(
        startX.value + event.translationX,
        imageWidth.value * displayScale,
        cropWidthSv.value
      );
      translateY.value = clampCoverTranslate(
        startY.value + event.translationY,
        imageHeight.value * displayScale,
        cropHeightSv.value
      );
    });

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      'worklet';
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      'worklet';
      const next = Math.min(Math.max(startScale.value * event.scale, 1), 4);
      scale.value = next;
      const displayScale = baseScaleSv.value * next;
      translateX.value = clampCoverTranslate(
        translateX.value,
        imageWidth.value * displayScale,
        cropWidthSv.value
      );
      translateY.value = clampCoverTranslate(
        translateY.value,
        imageHeight.value * displayScale,
        cropHeightSv.value
      );
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const imageStyle = useAnimatedStyle(() => {
    const displayScale = baseScaleSv.value * scale.value;
    return {
      width: imageWidth.value * displayScale,
      height: imageHeight.value * displayScale,
      transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    };
  });

  const previewHeight = PREVIEW_WIDTH / aspectRatio;

  const saveCurrentDraft = useCallback(() => {
    const previewId = previewsRef.current[activePreviewIndexRef.current]?.id;
    if (!previewId || !workingUri || !imageSize) {
      return;
    }
    draftsRef.current.set(previewId, {
      workingUri,
      width: imageSize.width,
      height: imageSize.height,
      translateX: translateX.value,
      translateY: translateY.value,
      scale: scale.value,
    });
  }, [imageSize, scale, translateX, translateY, workingUri]);

  const activePreviewStyle = useAnimatedStyle(() => {
    const ratio = PREVIEW_WIDTH / cropWidthSv.value;
    const displayScale = baseScaleSv.value * scale.value * ratio;
    return {
      width: imageWidth.value * displayScale,
      height: imageHeight.value * displayScale,
      transform: [
        { translateX: translateX.value * ratio },
        { translateY: translateY.value * ratio },
      ],
    };
  });

  const handleSelectPreview = (index: number) => {
    if (!onSelectPreview || index === activePreviewIndex || busy) {
      return;
    }
    saveCurrentDraft();
    onSelectPreview(index);
  };

  const handleRotate = async () => {
    if (!workingUri || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await ImageManipulator.manipulateAsync(
        workingUri,
        [{ rotate: 90 }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      setWorkingUri(result.uri);
      const nextSize = await new Promise<ImageSize>((resolve, reject) => {
        Image.getSize(result.uri, (width, height) => resolve({ width, height }), reject);
      });
      setImageSize(nextSize);
      imageWidth.value = nextSize.width;
      imageHeight.value = nextSize.height;
      baseScaleSv.value = Math.max(cropWidth / nextSize.width, cropHeight / nextSize.height);
      resetTransform();
    } catch {
      setError('回転に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!workingUri || !imageSize || busy) return;
    saveCurrentDraft();
    setBusy(true);
    setError('');
    try {
      const displayScale = baseScaleSv.value * scale.value;
      const imageLeft =
        cropWidth / 2 - (imageSize.width * displayScale) / 2 + translateX.value;
      const imageTop =
        cropHeight / 2 - (imageSize.height * displayScale) / 2 + translateY.value;

      let originX = (0 - imageLeft) / displayScale;
      let originY = (0 - imageTop) / displayScale;
      let width = cropWidth / displayScale;
      let height = cropHeight / displayScale;

      originX = clampJs(originX, 0, Math.max(0, imageSize.width - 1));
      originY = clampJs(originY, 0, Math.max(0, imageSize.height - 1));
      width = clampJs(width, 1, imageSize.width - originX);
      height = clampJs(height, 1, imageSize.height - originY);

      const targetAspect = aspectRatio;
      const currentAspect = width / height;
      if (currentAspect > targetAspect) {
        const nextWidth = height * targetAspect;
        originX += (width - nextWidth) / 2;
        width = nextWidth;
      } else if (currentAspect < targetAspect) {
        const nextHeight = width / targetAspect;
        originY += (height - nextHeight) / 2;
        height = nextHeight;
      }

      originX = clampJs(Math.round(originX), 0, imageSize.width - 1);
      originY = clampJs(Math.round(originY), 0, imageSize.height - 1);
      width = clampJs(Math.round(width), 1, imageSize.width - originX);
      height = clampJs(Math.round(height), 1, imageSize.height - originY);

      const actions: Action[] = [{ crop: { originX, originY, width, height } }];
      if (width > OUTPUT_MAX || height > OUTPUT_MAX) {
        if (width >= height) {
          actions.push({ resize: { width: OUTPUT_MAX } });
        } else {
          actions.push({ resize: { height: OUTPUT_MAX } });
        }
      }

      const result = await ImageManipulator.manipulateAsync(workingUri, actions, {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const persistedUri = await persistImageFile(result.uri);
      onConfirm(persistedUri);
    } catch {
      setError('切り取りに失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const [editorSize, setEditorSize] = useState({ width: SCREEN.width, height: SCREEN.height * 0.6 });

  const cropLeft = Math.max(0, (editorSize.width - cropWidth) / 2);
  const cropTop = Math.max(0, (editorSize.height - cropHeight) / 2);
  const cropRight = Math.max(0, editorSize.width - cropLeft - cropWidth);
  const cropBottom = Math.max(0, editorSize.height - cropTop - cropHeight);

  if (embedded && !visible) {
    return null;
  }

  const editor = (
      <GestureHandlerRootView style={[styles.root, embedded ? styles.embedded : null]}>
        <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.topBar}>
            <Pressable style={styles.topButton} onPress={onCancel} disabled={busy}>
              <Text style={styles.topButtonText}>キャンセル</Text>
            </Pressable>
            <Text style={styles.title}>写真を編集</Text>
            <Pressable
              style={styles.topButton}
              onPress={() => void handleConfirm()}
              disabled={busy || !imageSize}
            >
              <Text style={[styles.topButtonText, styles.topButtonDone]}>完了</Text>
            </Pressable>
          </View>

          <View style={styles.stage}>
            <View
              style={styles.editorArea}
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setEditorSize({ width, height });
              }}
            >
              {workingUri && imageSize ? (
                <GestureDetector gesture={composedGesture}>
                  <View style={styles.gestureLayer}>
                    <Animated.View style={[styles.imageWrap, imageStyle]}>
                      <Image source={{ uri: workingUri }} style={styles.image} resizeMode="stretch" />
                    </Animated.View>
                  </View>
                </GestureDetector>
              ) : (
                <ActivityIndicator color="#fff" />
              )}

              <View pointerEvents="none" style={styles.maskLayer}>
                <View style={[styles.maskBar, { top: 0, left: 0, right: 0, height: cropTop }]} />
                <View
                  style={[styles.maskBar, { top: cropTop, left: 0, width: cropLeft, height: cropHeight }]}
                />
                <View
                  style={[
                    styles.maskBar,
                    { top: cropTop, right: 0, width: cropRight, height: cropHeight },
                  ]}
                />
                <View
                  style={[styles.maskBar, { top: cropTop + cropHeight, left: 0, right: 0, height: cropBottom }]}
                />
                <View
                  style={[
                    styles.cropWindow,
                    {
                      top: cropTop,
                      left: cropLeft,
                      width: cropWidth,
                      height: cropHeight,
                    },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.hint}>{hint}</Text>
          </View>

          <View style={styles.toolbar}>
            <Pressable
              style={styles.toolButton}
              onPress={() => void handleRotate()}
              disabled={busy || !workingUri}
            >
              <Ionicons name="refresh-outline" size={22} color="#fff" />
              <Text style={styles.toolButtonText}>回転</Text>
            </Pressable>
          </View>
          {previews.length > 0 ? (
            <View style={styles.previewRow}>
              {previews.map((preview, index) => {
                const active = index === activePreviewIndex;
                const draft = draftsRef.current.get(preview.id);
                const frameStyle = { width: PREVIEW_WIDTH, height: previewHeight };
                return (
                  <Pressable
                    key={preview.id}
                    style={styles.previewItem}
                    onPress={() => handleSelectPreview(index)}
                    disabled={busy}
                  >
                    <View style={[styles.previewFrame, frameStyle, active ? styles.previewFrameActive : null]}>
                      {active && workingUri && imageSize ? (
                        <Animated.View style={activePreviewStyle}>
                          <Image source={{ uri: workingUri }} style={styles.previewImage} resizeMode="stretch" />
                        </Animated.View>
                      ) : draft ? (
                        <PreviewStill
                          draft={draft}
                          frameWidth={PREVIEW_WIDTH}
                          frameHeight={previewHeight}
                          cropWidth={cropWidth}
                          cropHeight={cropHeight}
                        />
                      ) : (
                        <ExpoImage
                          source={{ uri: preview.uri }}
                          style={styles.previewImage}
                          contentFit="cover"
                          recyclingKey={preview.id}
                          cachePolicy="memory-disk"
                          allowDownscaling
                        />
                      )}
                    </View>
                    <Text style={[styles.previewIndex, active ? styles.previewIndexActive : null]}>
                      {index + 1}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {busy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
  );

  if (embedded) {
    return editor;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      {editor}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  embedded: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    zIndex: 2,
  },
  topButton: {
    minWidth: 72,
    paddingVertical: 8,
  },
  topButtonText: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
  },
  topButtonDone: {
    color: '#FFFFFF',
    textAlign: 'right',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  editorArea: {
    width: SCREEN.width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gestureLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    position: 'absolute',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  maskLayer: {
    ...StyleSheet.absoluteFill,
  },
  maskBar: {
    position: 'absolute',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  cropWindow: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 8,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: Spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingBottom: 8,
  },
  previewItem: {
    alignItems: 'center',
    gap: 4,
  },
  previewFrame: {
    overflow: 'hidden',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  previewFrameActive: {
    borderColor: '#ffffff',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewIndex: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  previewIndexActive: {
    color: '#ffffff',
  },
  toolButton: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  toolButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#fca5a5',
    textAlign: 'center',
    paddingBottom: 12,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
