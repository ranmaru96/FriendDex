import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { AppThemeContentColorFields } from '@/constants/appThemes/contentColors';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Theme, Radius, Typography } from '@/constants/theme';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import type { Option } from '@/components/episode/types';
import type { Friend } from '@/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import type { ParticipantChipDisplay } from '@/utils/episodeHelpers';

const SELECTOR_COLUMNS = 5;
const SELECTOR_GAP = 6;
const SELECTOR_CARD_PADDING = 14;
const SHEET_MIN_RATIO = 0.48;
const SHEET_MAX_RATIO = 0.86;
const SHEET_DEFAULT_RATIO = 0.58;

function SelectorOptionCell({
  label,
  checked,
  photoUri,
  width,
  onPress,
  content,
}: {
  label: string;
  checked: boolean;
  photoUri?: string | null;
  width: number;
  onPress: () => void;
  content: AppThemeContentColorFields;
}) {
  const initial = (label.trim().charAt(0) || '?').toUpperCase();
  const uri = photoUri?.trim() || undefined;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectorPersonRow,
        {
          width,
          backgroundColor: checked ? content.contentPersonTagBg : content.contentInputBg,
          borderColor: checked ? content.contentText : content.contentBorder,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.selectorAvatarRing,
          {
            borderColor: checked ? content.contentText : 'transparent',
          },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.selectorAvatarImage} />
        ) : (
          <View
            style={[
              styles.selectorAvatarFallback,
              {
                backgroundColor: checked ? content.contentText : content.contentBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.selectorAvatarInitial,
                { color: checked ? content.contentCard : content.contentText },
              ]}
            >
              {initial}
            </Text>
          </View>
        )}
        {checked ? (
          <View
            style={[
              styles.selectorCheckBadge,
              {
                backgroundColor: content.contentText,
                borderColor: content.contentCard,
              },
            ]}
          >
            <Text style={[styles.selectorCheckBadgeMark, { color: content.contentCard }]}>✓</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          styles.selectorPersonName,
          contentTextStyle(content),
          checked ? styles.selectorPersonNameChecked : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SelectorFilterField({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (v: string) => void;
}) {
  const content = useContentColors();
  const [visible, setVisible] = useState(false);
  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((option) => option.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={styles.selectorFilterSelectContainer}>
      <Pressable
        style={[styles.selectorFilterSelectButton, contentInputStyle(content)]}
        onPress={() => setVisible(true)}
      >
        <Text
          style={[
            value ? styles.selectorFilterSelectValue : styles.selectorFilterSelectPlaceholder,
            value ? contentTextStyle(content) : contentMutedTextStyle(content),
          ]}
        >
          {displayLabel}
        </Text>
        <Text style={[styles.selectorFilterSelectChevron, contentMutedTextStyle(content)]}>▼</Text>
      </Pressable>
      <OptionPickerModal
        visible={visible}
        label={label}
        value={value}
        options={options}
        onValueChange={onValueChange}
        onClose={() => setVisible(false)}
      />
    </View>
  );
}

export type EntrySelectorModalProps = {
  visible: boolean;
  selectorTab: 'individual' | 'group';
  onTabChange: (tab: 'individual' | 'group') => void;
  nameFilter: string;
  onNameFilterChange: (value: string) => void;
  affiliationFilter: string;
  onAffiliationFilterChange: (value: string) => void;
  experienceFilter: string;
  onExperienceFilterChange: (value: string) => void;
  friends: Friend[];
  affiliationOptions: Option[];
  experienceOptions: Option[];
  groupOptions: Option[];
  selectedIndividualIds: Set<string>;
  selectedGroupValues: Set<string>;
  onToggleIndividual: (friendId: string) => void;
  onToggleGroup: (groupValue: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** 対象者一覧の上に置く任意の編集欄（グループ名など）。 */
  headerContent?: ReactNode;
  /** 対象者一覧の下に置く任意の操作（削除など）。 */
  footerContent?: ReactNode;
  /**
   * When true, show 個人/所属 tab (e.g. visibility picker).
   * Default false — participant pickers are individuals only.
   */
  enableGroupTab?: boolean;
  /** true のとき開いた直後から最大高さ（共通項目の対象者選択など）。 */
  initialExpanded?: boolean;
};

export function EntrySelectorModal({
  visible,
  selectorTab,
  onTabChange,
  nameFilter,
  onNameFilterChange,
  affiliationFilter,
  onAffiliationFilterChange,
  experienceFilter,
  onExperienceFilterChange,
  friends,
  affiliationOptions,
  experienceOptions,
  groupOptions,
  selectedIndividualIds,
  selectedGroupValues,
  onToggleIndividual,
  onToggleGroup,
  onCancel,
  onConfirm,
  headerContent,
  footerContent,
  enableGroupTab = false,
  initialExpanded = false,
}: EntrySelectorModalProps) {
  const content = useContentColors();
  const { height: windowHeight, width: screenWidth } = useWindowDimensions();
  const sheetMinHeight = windowHeight * SHEET_MIN_RATIO;
  const sheetMaxHeight = windowHeight * SHEET_MAX_RATIO;
  const sheetDefaultHeight = initialExpanded
    ? sheetMaxHeight
    : windowHeight * SHEET_DEFAULT_RATIO;
  const sheetHeight = useSharedValue(sheetDefaultHeight);
  const sheetDragStart = useSharedValue(sheetDefaultHeight);
  const sheetTranslateY = useSharedValue(0);
  const backdropOpacity = useSharedValue(1);
  const isDismissing = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      isDismissing.value = false;
      sheetHeight.value = sheetDefaultHeight;
      sheetTranslateY.value = 0;
      backdropOpacity.value = 1;
    }
  }, [backdropOpacity, isDismissing, sheetDefaultHeight, sheetHeight, sheetTranslateY, visible]);

  const itemWidth = useMemo(() => {
    const totalGap = SELECTOR_GAP * (SELECTOR_COLUMNS - 1);
    return (screenWidth - SELECTOR_CARD_PADDING * 2 - totalGap) / SELECTOR_COLUMNS;
  }, [screenWidth]);

  const finishDismiss = useMemo(() => {
    return () => {
      onCancel();
    };
  }, [onCancel]);

  const animateDismiss = useMemo(() => {
    return () => {
      if (isDismissing.value) return;
      isDismissing.value = true;
      const slideDistance = Math.max(sheetHeight.value + sheetTranslateY.value + 32, windowHeight * 0.35);
      backdropOpacity.value = withTiming(0, { duration: 200 });
      sheetTranslateY.value = withTiming(slideDistance, { duration: 260 }, (finished) => {
        if (finished) {
          runOnJS(finishDismiss)();
        }
      });
    };
  }, [backdropOpacity, finishDismiss, isDismissing, sheetHeight, sheetTranslateY, windowHeight]);

  const handlePanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onBegin(() => {
          sheetDragStart.value = sheetHeight.value;
        })
        .onUpdate((event) => {
          if (isDismissing.value) return;
          const next = sheetDragStart.value - event.translationY;
          if (next >= sheetMinHeight) {
            sheetHeight.value = Math.min(sheetMaxHeight, next);
            sheetTranslateY.value = 0;
            return;
          }
          // Below min height: keep sheet size and slide it down instead of collapsing.
          sheetHeight.value = sheetMinHeight;
          sheetTranslateY.value = Math.max(0, sheetMinHeight - next);
        })
        .onEnd((event) => {
          if (isDismissing.value) return;
          const dismissByDistance = sheetTranslateY.value > sheetMinHeight * 0.22;
          const dismissByFling = event.velocityY > 900;
          if (dismissByDistance || dismissByFling) {
            isDismissing.value = true;
            const slideDistance = Math.max(
              sheetHeight.value + sheetTranslateY.value + 32,
              windowHeight * 0.35
            );
            backdropOpacity.value = withTiming(0, { duration: 200 });
            sheetTranslateY.value = withTiming(slideDistance, { duration: 260 }, (finished) => {
              if (finished) {
                runOnJS(finishDismiss)();
              }
            });
            return;
          }
          sheetTranslateY.value = withSpring(0, {
            damping: 28,
            stiffness: 180,
            overshootClamping: true,
          });
          const mid = (sheetMinHeight + sheetMaxHeight) / 2;
          const flickedUp = event.velocityY < -400;
          const flickedDown = event.velocityY > 400;
          const expand = flickedUp || (!flickedDown && sheetHeight.value >= mid);
          sheetHeight.value = withSpring(expand ? sheetMaxHeight : sheetMinHeight, {
            damping: 28,
            stiffness: 180,
            overshootClamping: true,
            energyThreshold: 0.001,
          });
        }),
    [
      backdropOpacity,
      finishDismiss,
      isDismissing,
      sheetDragStart,
      sheetHeight,
      sheetMaxHeight,
      sheetMinHeight,
      sheetTranslateY,
      windowHeight,
    ]
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const normalizedNameFilter = nameFilter.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    return friends.filter((friend) => {
      if (normalizedNameFilter && !friend.name.toLowerCase().includes(normalizedNameFilter)) {
        return false;
      }
      if (affiliationFilter && !(friend.affiliations ?? []).includes(affiliationFilter)) {
        return false;
      }
      if (experienceFilter && !(friend.experiences ?? []).includes(experienceFilter)) {
        return false;
      }
      return true;
    });
  }, [friends, normalizedNameFilter, affiliationFilter, experienceFilter]);
  const filteredGroups = useMemo(() => {
    return groupOptions.filter((option) =>
      normalizedNameFilter ? option.label.toLowerCase().includes(normalizedNameFilter) : true
    );
  }, [groupOptions, normalizedNameFilter]);

  const activeTab = enableGroupTab ? selectorTab : 'individual';

  const selectedIndividualChips = useMemo((): ParticipantChipDisplay[] => {
    const friendById = new Map(friends.map((friend) => [friend.id, friend]));
    return Array.from(selectedIndividualIds).map((friendId) => {
      const friend = friendById.get(friendId);
      return {
        id: `individual:${friendId}`,
        kind: 'individual' as const,
        label: friend?.name?.trim() || friendId,
        friendId,
        photoUri: friend?.photoUri ?? null,
      };
    });
  }, [friends, selectedIndividualIds]);

  const selectedGroupChips = useMemo((): ParticipantChipDisplay[] => {
    const labelByValue = new Map(groupOptions.map((option) => [option.value, option.label]));
    return Array.from(selectedGroupValues).map((value) => ({
      id: `group:${value}`,
      kind: 'group' as const,
      label: labelByValue.get(value) ?? value,
    }));
  }, [groupOptions, selectedGroupValues]);

  const selectedChips = activeTab === 'individual' ? selectedIndividualChips : selectedGroupChips;

  const actionButtons = (
    <View style={styles.selectorActionsRow}>
      <Pressable
        style={[
          styles.selectorCancelButton,
          {
            backgroundColor: content.contentPersonTagBg,
            borderColor: content.contentBorder,
          },
        ]}
        onPress={animateDismiss}
      >
        <Text style={[styles.selectorCancelButtonText, contentTextStyle(content)]}>
          キャンセル
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.selectorOkButton,
          {
            backgroundColor: content.contentText,
            borderColor: content.contentText,
          },
        ]}
        onPress={onConfirm}
      >
        <Text style={[styles.selectorOkButtonText, { color: content.contentCard }]}>OK</Text>
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={animateDismiss}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.selectorOverlay}>
          <Animated.View
            pointerEvents="none"
            style={[styles.selectorBackdropFill, backdropAnimatedStyle]}
          />
          <Pressable style={styles.selectorBackdrop} onPress={animateDismiss} />
          <Animated.View
            style={[styles.selectorCard, contentSurfaceStyle(content), sheetAnimatedStyle]}
          >
            <GestureDetector gesture={handlePanGesture}>
              <View style={styles.sheetHandleHitArea} accessibilityLabel="モーダルの高さを調整">
                <View
                  style={[styles.sheetHandleBar, { backgroundColor: content.contentTextSecondary }]}
                />
              </View>
            </GestureDetector>

            {enableGroupTab ? (
              <>
                <View style={styles.selectorTabRow}>
                  <Pressable
                    style={[
                      styles.selectorTabButton,
                      contentInputStyle(content),
                      activeTab === 'individual' ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => onTabChange('individual')}
                  >
                    <Text style={[styles.selectorTabButtonText, contentTextStyle(content)]}>
                      個人
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.selectorTabButton,
                      contentInputStyle(content),
                      activeTab === 'group' ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => onTabChange('group')}
                  >
                    <Text style={[styles.selectorTabButtonText, contentTextStyle(content)]}>
                      所属
                    </Text>
                  </Pressable>
                </View>
                <View style={[styles.selectorDivider, { backgroundColor: content.contentDivider }]} />
              </>
            ) : null}

            {headerContent}

            <View style={styles.selectorHeaderRow}>
              <Text style={[styles.selectorHeaderTitle, contentTextStyle(content)]}>対象者</Text>
              {actionButtons}
            </View>

            <View style={[styles.selectorDivider, { backgroundColor: content.contentDivider }]} />

            <View style={styles.selectedChipsBlock}>
              {selectedChips.length > 0 ? (
                <ScrollView
                  style={{ maxHeight: Math.round(windowHeight * 0.28) }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={selectedChips.length > 9}
                >
                  <ParticipantChipList
                    chips={selectedChips}
                    compact
                    layout="wrap"
                    onChipPress={(chip) => {
                      if (chip.kind === 'individual' && chip.friendId) {
                        onToggleIndividual(chip.friendId);
                        return;
                      }
                      if (chip.kind === 'group') {
                        const value = chip.id.startsWith('group:')
                          ? chip.id.slice('group:'.length)
                          : chip.label;
                        onToggleGroup(value);
                      }
                    }}
                    onRemoveChip={(chipId) => {
                      if (chipId.startsWith('individual:')) {
                        onToggleIndividual(chipId.slice('individual:'.length));
                        return;
                      }
                      if (chipId.startsWith('group:')) {
                        onToggleGroup(chipId.slice('group:'.length));
                      }
                    }}
                  />
                </ScrollView>
              ) : (
                <Text style={[styles.selectedChipsEmpty, contentMutedTextStyle(content)]}>
                  まだ選択されていません
                </Text>
              )}
            </View>

            <View
              style={[
                styles.selectorDivider,
                styles.selectorDividerAfterChips,
                { backgroundColor: content.contentDivider },
              ]}
            />

            {activeTab === 'individual' ? (
              <View style={styles.selectorFilterRow}>
                <View style={styles.selectorFilterNameContainer}>
                  <TextInput
                    style={[styles.selectorFilterNameInput, contentInputStyle(content)]}
                    value={nameFilter}
                    onChangeText={onNameFilterChange}
                    placeholder="名前"
                    placeholderTextColor={content.contentTextSecondary}
                    autoCapitalize="none"
                  />
                </View>
                <SelectorFilterField
                  label="所属"
                  value={affiliationFilter}
                  options={affiliationOptions}
                  onValueChange={onAffiliationFilterChange}
                />
                <SelectorFilterField
                  label="経験"
                  value={experienceFilter}
                  options={experienceOptions}
                  onValueChange={onExperienceFilterChange}
                />
              </View>
            ) : (
              <TextInput
                style={[styles.selectorNameInput, contentInputStyle(content)]}
                value={nameFilter}
                onChangeText={onNameFilterChange}
                placeholder="名前"
                placeholderTextColor={content.contentTextSecondary}
                autoCapitalize="none"
              />
            )}

            <View style={styles.selectorListArea}>
              {activeTab === 'individual' ? (
                <FlatList
                  data={filteredFriends}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <SelectorOptionCell
                      label={item.name}
                      checked={selectedIndividualIds.has(item.id)}
                      photoUri={item.photoUri}
                      width={itemWidth}
                      onPress={() => onToggleIndividual(item.id)}
                      content={content}
                    />
                  )}
                  numColumns={SELECTOR_COLUMNS}
                  columnWrapperStyle={styles.selectorColumnWrapper}
                  style={styles.selectorListScroll}
                  contentContainerStyle={styles.selectorListContent}
                  keyboardShouldPersistTaps="handled"
                />
              ) : (
                <FlatList
                  data={filteredGroups}
                  keyExtractor={(item) => item.value}
                  renderItem={({ item }) => (
                    <SelectorOptionCell
                      label={item.label}
                      checked={selectedGroupValues.has(item.value)}
                      width={itemWidth}
                      onPress={() => onToggleGroup(item.value)}
                      content={content}
                    />
                  )}
                  numColumns={SELECTOR_COLUMNS}
                  columnWrapperStyle={styles.selectorColumnWrapper}
                  style={styles.selectorListScroll}
                  contentContainerStyle={styles.selectorListContent}
                  keyboardShouldPersistTaps="handled"
                />
              )}
            </View>

            {footerContent}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  selectorOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  selectorBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  selectorBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  selectorCard: {
    backgroundColor: Theme.bgSurface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  sheetHandleHitArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  sheetHandleBar: {
    width: 88,
    height: 5,
    borderRadius: 999,
    opacity: 0.55,
  },
  selectorTabRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  selectorTabButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  selectorTabButtonText: { fontSize: Typography.base, fontWeight: '700' },
  selectorDivider: { height: 1, marginBottom: 10 },
  selectorDividerAfterChips: { marginTop: 10 },
  selectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  selectorHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 0,
    paddingLeft: 8,
  },
  selectedChipsBlock: {
    marginBottom: 0,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 28,
  },
  selectedChipsEmpty: {
    fontSize: 13,
    paddingVertical: 4,
  },
  selectorNameInput: {
    minHeight: 38,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.inputBg,
    color: '#0f172a',
    paddingHorizontal: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  selectorFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  selectorFilterNameContainer: { flex: 1, minWidth: 0 },
  selectorFilterNameInput: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: Typography.base,
    color: '#111827',
  },
  selectorFilterSelectContainer: { flex: 1, minWidth: 0 },
  selectorFilterSelectButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectorFilterSelectValue: { fontSize: Typography.base, color: '#111827', flex: 1 },
  selectorFilterSelectPlaceholder: { fontSize: Typography.base, color: '#6b7280', flex: 1 },
  selectorFilterSelectChevron: { fontSize: 10, color: '#475569', marginLeft: 4 },
  selectorListArea: {
    flex: 1,
    minHeight: 120,
    marginBottom: 0,
  },
  selectorListScroll: { flex: 1 },
  selectorListContent: { paddingBottom: 8 },
  selectorColumnWrapper: { gap: SELECTOR_GAP, marginBottom: SELECTOR_GAP },
  selectorPersonRow: {
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 6,
  },
  selectorAvatarRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorAvatarImage: {
    width: 27,
    height: 27,
    borderRadius: 14,
  },
  selectorAvatarFallback: {
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorAvatarInitial: {
    fontSize: 11,
    fontWeight: '700',
  },
  selectorCheckBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorCheckBadgeMark: {
    fontSize: 7,
    fontWeight: '800',
    lineHeight: 9,
    textAlign: 'center',
  },
  selectorPersonName: {
    width: '100%',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 13,
  },
  selectorPersonNameChecked: {
    fontWeight: '700',
  },
  selectorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
  },
  selectorCancelButton: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectorCancelButtonText: { fontWeight: '700', fontSize: Typography.base },
  selectorOkButton: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectorOkButtonText: { fontWeight: '700', fontSize: Typography.base },
});
