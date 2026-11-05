import { useRef, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Spacing } from '@/constants/theme';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';
import { useSubScreenHeaderStyles } from '@/components/screen/subScreenHeaderStyles';
import { useNoteFormatAccessoryBottomPad } from '@/contexts/NoteFormatAccessoryContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useBottomNavScrollClearance } from '@/hooks/useBottomNavScrollClearance';
import { useKeyboardFrame, useSyncKeyboardOverlap } from '@/utils/useKeyboardBottomInset';

type FormScreenTemplateProps = {
  children: ReactNode;
  title?: string;
  titleAlign?: 'center' | 'left';
  onBack?: () => void;
  backDisabled?: boolean;
  backLabel?: string;
  left?: ReactNode;
  right?: ReactNode;
  /** 中央タイトルの左側 */
  titleLeading?: ReactNode;
  /** 中央タイトルの右側 */
  titleTrailing?: ReactNode;
  footer?: ReactNode;
  /** false のとき ScreenTopBar を出さず、親ヘッダーに乗せる */
  useTopBar?: boolean;
  /** 指定したとき、シェルの余白と重ならないよう SafeArea の辺を固定する */
  safeAreaEdges?: readonly ('top' | 'left' | 'right' | 'bottom')[];
  extraScrollHeight?: number;
  scrollContentStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
  /** KeyboardAwareScrollView の taps 透過。デフォルト handled */
  keyboardShouldPersistTaps?: 'always' | 'handled' | 'never';
  /** true のとき画面いっぱいに伸ばさず、中身の高さに合わせる */
  fitContent?: boolean;
  onContentSizeChange?: (width: number, height: number) => void;
};

export function FormScreenTemplate({
  children,
  title,
  titleAlign = 'center',
  onBack,
  backDisabled = false,
  backLabel,
  left,
  right,
  titleLeading,
  titleTrailing,
  footer,
  useTopBar = true,
  safeAreaEdges: safeAreaEdgesProp,
  extraScrollHeight = 20,
  scrollContentStyle,
  scrollEnabled = true,
  keyboardShouldPersistTaps = 'handled',
  fitContent = false,
  onContentSizeChange,
}: FormScreenTemplateProps) {
  const kit = useUiKit();
  const bottomNavClearance = useBottomNavScrollClearance();
  const safeAreaEdges =
    safeAreaEdgesProp ??
    (bottomNavClearance > 0
      ? (['top', 'left', 'right'] as const)
      : (['top', 'left', 'right', 'bottom'] as const));
  const headerStyles = useSubScreenHeaderStyles();
  const accessoryPad = useNoteFormatAccessoryBottomPad();
  const keyboard = useKeyboardFrame();
  const frameRef = useRef<View>(null);
  const { overlap: keyboardOverlap, syncOverlap } = useSyncKeyboardOverlap(
    frameRef,
    keyboard.screenY,
    keyboard.height
  );
  const bodyKeyboardPad = keyboardOverlap + accessoryPad;
  const header = titleAlign === 'left' ? (
    <View style={headerStyles.bar}>
      <Text style={headerStyles.titleLeft} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <View style={styles.titleSideRight}>{right ?? null}</View>
    </View>
  ) : (
    <ScreenTopBar
      title={title}
      onBack={onBack}
      backDisabled={backDisabled}
      backLabel={backLabel}
      left={left}
      right={right}
      titleLeading={titleLeading}
      titleTrailing={titleTrailing}
    />
  );
  const frameStyle = fitContent ? styles.fitFrame : styles.body;
  const scrollStyle = fitContent ? styles.fitScroll : styles.scroll;
  const body = (
    <View
      ref={frameRef}
      style={[frameStyle, { backgroundColor: kit.screenBackground }]}
      collapsable={false}
      onLayout={syncOverlap}
    >
      <View style={[frameStyle, { paddingBottom: bodyKeyboardPad, backgroundColor: kit.screenBackground }]}>
        <KeyboardAwareScrollView
          style={[scrollStyle, { backgroundColor: kit.screenBackground }]}
          onContentSizeChange={onContentSizeChange}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: kit.screenPaddingHorizontal, paddingBottom: Spacing.lg },
            scrollContentStyle,
          ]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          enableResetScrollToCoords={false}
          enableAutomaticScroll={false}
          extraHeight={0}
          enableOnAndroid={false}
          contentInset={{ bottom: 0 }}
          extraScrollHeight={extraScrollHeight}
          scrollEnabled={scrollEnabled}
        >
          {children}
        </KeyboardAwareScrollView>

        {footer}
      </View>
    </View>
  );

  if (!useTopBar) {
    return (
      <View style={[fitContent ? styles.fitFrame : styles.safeArea, { backgroundColor: kit.screenBackground }]}>
        {body}
      </View>
    );
  }

  return (
    <SafeAreaView
      edges={safeAreaEdges}
      style={[styles.safeArea, { backgroundColor: kit.screenBackground }]}
    >
      {header}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  fitFrame: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: '100%',
  },
  fitScroll: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
  },
  titleSideRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: 6,
  },
});
