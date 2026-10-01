import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Theme, Radius, Spacing, Typography } from '@/constants/theme';
import { PHOTO_LIMITS } from '@/constants';
import { FormRow } from '@/components/ui/FormRow';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import { NoteBlockEditor } from '@/components/ui/NoteBlockEditor';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  contentDateTimePickerProps,
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentPersonTagStyle,
  contentTagTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import {
  DATE_PICKER_MAX_FAR,
  DATE_PICKER_MIN,
  openRangeDatePickerBounds,
} from '@/utils/datePickerBounds';
import { useDismissPickerOnKeyboardShow } from '@/hooks/useDismissPickerOnKeyboardShow';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { FormScreenBody, FormScreenSection, FormScreenTemplate } from '@/components/screen-templates';
import {
  formatEpisodeDateToYMD,
  isEpisodeVisibilityMode,
  parseEpisodeDateString,
  VISIBILITY_MODE_OPTIONS,
  type Option,
} from '@/components/episode/types';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import { EpisodeEventLinkField } from '@/components/episode/EpisodeEventLinkField';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { PhotoCropModal, EPISODE_PHOTO_ASPECT } from '@/components/photo/PhotoCropModal';
import { EpisodePhotoLibraryModal } from '@/components/episode/EpisodePhotoLibraryModal';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';
import type { useEpisodeForm } from '@/hooks/useEpisodeForm';
import type { Friend } from '@/types';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';
import { buildFriendPhotoById } from '@/utils/friendPhoto';
import { combineLocalDateTime, formatTimeFromDate } from '@/utils/eventHelpers';

type EpisodeFormState = ReturnType<typeof useEpisodeForm>;

type EpisodeFormOverlayProps = {
  visible: boolean;
  form: EpisodeFormState;
  friends: Friend[];
  affiliationOptions: Option[];
  experienceOptions: Option[];
  episodeTagOptions: Option[];
  onClose: () => void;
  onSave: () => void;
  /** 保存中は保存と閉じるを止める */
  saving?: boolean;
  onPersonCreated?: (friend: Friend) => void;
  /** false のとき画面内トップバーを出さず、親ヘッダーを使う */
  useTopBar?: boolean;
};

function SelectInput({
  value,
  placeholder,
  modalTitle,
  options,
  onChange,
  style,
  includeEmptyOption = true,
  clearLabel = '未設定',
  allowCustomValue = false,
  customInputPlaceholder = '新しいタグ名',
  variant,
  pickerColumns = 1,
  pickerLayout = 'list',
}: {
  value: string;
  placeholder: string;
  /** モーダル見出し。未指定時は placeholder を流用 */
  modalTitle?: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  includeEmptyOption?: boolean;
  clearLabel?: string;
  allowCustomValue?: boolean;
  customInputPlaceholder?: string;
  variant?: 'field' | 'chip';
  pickerColumns?: 1 | 2;
  pickerLayout?: 'list' | 'chips';
}) {
  const kit = useUiKit();
  const content = useContentColors();
  const resolvedVariant = variant ?? (kit.formLayout === 'horizontal' ? 'chip' : 'field');
  const resolvedModalTitle = modalTitle ?? placeholder;
  const [modalVisible, setModalVisible] = useState(false);
  const selectedLabel = useMemo(() => {
    const selected = options.find((option) => option.value === value);
    return selected?.label ?? (value || placeholder);
  }, [options, placeholder, value]);

  const isChip = resolvedVariant === 'chip';
  const fieldRadius = Radius.sm;

  return (
    <>
      <Pressable
        style={[
          isChip ? styles.selectChipButton : styles.episodeSelectButton,
          isChip ? styles.selectChipButtonLayout : null,
          { borderRadius: fieldRadius },
          isChip ? contentPersonTagStyle(content) : contentInputStyle(content),
          style,
        ]}
        onPress={() => {
          dismissKeyboardFocus();
          setModalVisible(true);
        }}
        accessibilityLabel={`${resolvedModalTitle}を選択`}
        accessibilityRole="button"
      >
        <Text
          style={[
            isChip
              ? value
                ? styles.selectChipText
                : styles.selectChipPlaceholder
              : value
                ? styles.episodeSelectText
                : styles.episodeSelectPlaceholder,
            value ? contentTextStyle(content) : contentMutedTextStyle(content),
          ]}
          numberOfLines={1}
        >
          {selectedLabel}
        </Text>
        {isChip ? (
          <Text style={[styles.selectChipChevron, contentMutedTextStyle(content)]}>▼</Text>
        ) : null}
      </Pressable>
      <OptionPickerModal
        visible={modalVisible}
        label={resolvedModalTitle}
        value={value}
        options={options}
        onValueChange={onChange}
        onClose={() => setModalVisible(false)}
        clearLabel={includeEmptyOption ? clearLabel : null}
        allowCustomValue={allowCustomValue}
        customInputPlaceholder={customInputPlaceholder}
        customActionLabel="このタグを使う"
        columns={pickerColumns}
        layout={pickerLayout}
      />
    </>
  );
}

function EpisodeFieldDivider() {
  const content = useContentColors();
  return <View style={[styles.fieldDivider, { backgroundColor: content.contentDivider }]} />;
}

export function EpisodeFormOverlay({
  visible,
  form,
  friends,
  affiliationOptions,
  experienceOptions,
  episodeTagOptions,
  onClose,
  onSave,
  saving = false,
  onPersonCreated,
  useTopBar = true,
}: EpisodeFormOverlayProps) {
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const fieldRadius = Radius.sm;
  const fieldCorner = { borderRadius: fieldRadius };
  const [photoRowWidth, setPhotoRowWidth] = useState(0);
  const photoSlotSize =
    photoRowWidth > 0
      ? (photoRowWidth - 8 * PHOTO_LIMITS.free) / (PHOTO_LIMITS.free + 1)
      : 0;
  const photoSlotStyle = photoSlotSize > 0 ? { width: photoSlotSize, height: photoSlotSize } : null;
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);
  const titleInputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!visible || form.formErrorField !== 'title') {
      return;
    }
    titleInputRef.current?.focus();
  }, [visible, form.formErrorField, form.formErrorTick]);
  const requestClose = useCallback(() => {
    if (saving) {
      return;
    }
    form.requestDismiss(onClose);
  }, [form.requestDismiss, onClose, saving]);
  useEffect(() => {
    if (!visible) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });
    return () => subscription.remove();
  }, [requestClose, visible]);
  const draftSessionStartedRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      draftSessionStartedRef.current = false;
      return;
    }
    if (draftSessionStartedRef.current) {
      return;
    }
    draftSessionStartedRef.current = true;
    form.prepareDraftSession();
  }, [form.prepareDraftSession, visible]);
  useEffect(() => {
    return () => {
      form.flushDraft();
    };
  }, [form.flushDraft]);
  const participantChips = useMemo(
    () =>
      buildParticipantChipDisplays(
        form.participants
          .filter((participant) => participant.value.trim().length > 0)
          .map((participant) => ({
            kind: participant.participantType === 'individual' ? ('individual' as const) : ('group' as const),
            value: participant.value,
          })),
        form.friendNameById,
        {
          friendPhotoById,
          excludeFriendIds: form.excludeSelfId ? [form.excludeSelfId] : [],
        }
      ),
    [form.participants, form.friendNameById, form.excludeSelfId, friendPhotoById]
  );
  const selectedParticipantIds = useMemo(
    () =>
      new Set(
        form.participants
          .filter((participant) => participant.participantType === 'individual' && participant.value.trim())
          .map((participant) => participant.value)
      ),
    [form.participants]
  );
  const suggestionChips = useMemo(
    () =>
      buildParticipantChipDisplays(
        form.recentTogetherFriendIds
          .filter((friendId) => !selectedParticipantIds.has(friendId))
          .map((friendId) => ({ kind: 'individual' as const, value: friendId })),
        form.friendNameById,
        { friendPhotoById }
      ),
    [form.recentTogetherFriendIds, form.friendNameById, friendPhotoById, selectedParticipantIds]
  );
  const visibilityChips = useMemo(
    () =>
      buildParticipantChipDisplays(
        form.visibility
          .filter((entry) => entry.kind === 'individual' && entry.value.trim().length > 0)
          .map((entry) => ({ kind: 'individual' as const, value: entry.value })),
        form.friendNameById,
        { friendPhotoById }
      ),
    [form.friendNameById, form.visibility, friendPhotoById]
  );
  const handleVisibilityModeChange = (value: string) => {
    if (!isEpisodeVisibilityMode(value)) {
      return;
    }
    if (value === 'limited') {
      form.setVisibilityMode('limited');
      form.openVisibilitySelector();
      return;
    }
    form.setVisibilityMode(value);
    form.setVisibility([]);
  };
  useEffect(() => {
    if (!visible) {
      return;
    }
    form.refreshAudienceConnections();
  }, [form.refreshAudienceConnections, visible]);
  const datePickerOpen = form.showDatePicker && !form.isLinkedEventSingleDay;
  const timePickerOpen = form.showTimePicker;
  const closeDateTimePicker = () => {
    form.setShowDatePicker(false);
    form.setShowTimePicker(false);
  };

  useDismissPickerOnKeyboardShow(form.showDatePicker || form.showTimePicker, () => {
    form.setShowDatePicker(false);
    form.setShowTimePicker(false);
  });

  if (!visible) {
    return null;
  }

  return (
    <>
      <View style={[styles.overlay, { backgroundColor: kit.screenBackground }]}>
        <FormScreenTemplate
          title={form.editingEpisodeId ? 'エピソードを編集' : 'エピソードを追加'}
          onBack={requestClose}
          backDisabled={saving}
          useTopBar={useTopBar}
          right={
            useTopBar ? (
              <Pressable
                style={[styles.saveButton, contentFilledButtonStyle(content), saving ? styles.saveButtonBusy : null]}
                onPress={onSave}
                disabled={saving}
              >
                <Text style={[styles.saveButtonText, contentFilledButtonTextStyle(content)]}>
                  {form.editingEpisodeId ? '更新' : '保存'}
                </Text>
              </Pressable>
            ) : undefined
          }
          extraScrollHeight={140}
          scrollContentStyle={styles.scrollContent}
        >
          <FormScreenBody style={{ borderRadius: kit.formPanelBorderRadius }}>
            <FormScreenSection style={styles.episodeFormSection}>
              {form.formError ? <Text style={styles.episodeErrorText}>{form.formError}</Text> : null}
              <FormRow label="タイトル" labelStyle={styles.episodeFieldLabel} error={form.formErrorField === 'title'}>
                <TextInput
                  ref={titleInputRef}
                  style={[styles.episodeInput, fieldCorner, contentInputStyle(content)]}
                  placeholder="入力"
                  placeholderTextColor={content.contentTextSecondary}
                  value={form.title}
                  onChangeText={form.setTitle}
                />
              </FormRow>
              <EpisodeFieldDivider />

              <FormRow label="日時" labelStyle={styles.episodeFieldLabel}>
                <View style={styles.dateTimeRow}>
                    <Pressable
                      style={[styles.episodeInput, fieldCorner, contentInputStyle(content), styles.episodeDateInput, styles.dateTimeDate]}
                      onPress={() => {
                        if (form.isLinkedEventSingleDay) {
                          return;
                        }
                        dismissKeyboardFocus();
                        form.setShowTimePicker(false);
                        if (!form.date) {
                          form.setDate(formatEpisodeDateToYMD(new Date()));
                        }
                        form.setShowDatePicker(true);
                      }}
                    >
                      <Text style={form.date ? [styles.episodeDateText, contentTextStyle(content)] : [styles.episodeDatePlaceholder, contentMutedTextStyle(content)]}>
                        {form.date || 'YYYY-MM-DD'}
                      </Text>
                    </Pressable>
                    <View style={[styles.episodeInput, fieldCorner, contentInputStyle(content), styles.episodeDateInput, styles.dateTimeTime]}>
                      <Pressable
                        style={styles.timeTap}
                        onPress={() => {
                          dismissKeyboardFocus();
                          form.setShowDatePicker(false);
                          if (!form.time) {
                            form.setTime(formatTimeFromDate(new Date()));
                          }
                          form.setShowTimePicker(true);
                        }}
                        hitSlop={6}
                      >
                        <Text
                          style={[
                            styles.timeTapText,
                            form.time
                              ? contentTextStyle(content)
                              : contentMutedTextStyle(content),
                          ]}
                        >
                          {form.time || '任意'}
                        </Text>
                      </Pressable>
                      {form.time ? (
                        <Pressable
                          onPress={() => {
                            form.setTime('');
                            form.setShowTimePicker(false);
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="時刻をクリア"
                        >
                          <Text style={[styles.timeClearText, contentMutedTextStyle(content)]}>×</Text>
                        </Pressable>
                      ) : null}
                    </View>
                </View>
              </FormRow>
              <EpisodeFieldDivider />

              <FormRow
                label="対象予定"
                labelStyle={styles.episodeFieldLabel}
                style={styles.rowAlignStart}
                error={form.formErrorField === 'event'}
              >
                <EpisodeEventLinkField
                  dateKey={form.date}
                  mode={form.eventLinkMode}
                  linkedEventId={form.linkedEventId}
                  onModeChange={form.setEventLinkMode}
                  onSelectEvent={form.linkToEvent}
                  fieldCorner={fieldCorner}
                  compact
                />
              </FormRow>
              <EpisodeFieldDivider />

              <FormRow
                label="参加者"
                labelStyle={styles.episodeFieldLabel}
                style={styles.rowAlignStart}
              >
                <ParticipantChipList
                  chips={participantChips}
                  layout="wrap"
                  onChipPress={(chip) => form.removeParticipant(chip.id)}
                  trailing={
                    <Pressable
                      style={[styles.participantAddChip, contentPersonTagStyle(content)]}
                      onPress={form.openParticipantSelector}
                    >
                      <Text style={[styles.participantAddChipText, contentTagTextStyle(content)]}>＋</Text>
                    </Pressable>
                  }
                />
              </FormRow>
              {suggestionChips.length > 0 ? (
                <View style={[styles.suggestionRow, { gap: kit.formRowGap }]}>
                  <Text
                    style={[styles.suggestionLabel, styles.episodeFieldLabel, contentMutedTextStyle(content)]}
                  >
                    （候補）
                  </Text>
                  <View style={[styles.suggestionWell, fieldCorner, contentInputStyle(content)]}>
                    <ParticipantChipList
                      chips={suggestionChips}
                      compact
                      layout="scroll"
                      suggestion
                      onChipPress={(chip) => {
                        if (chip.friendId) {
                          form.addParticipantFriend(chip.friendId);
                        }
                      }}
                    />
                  </View>
                </View>
              ) : null}
              <EpisodeFieldDivider />

              <FormRow label="タグ" labelStyle={styles.episodeFieldLabel} contentLayout="compact">
                <SelectInput
                  value={form.tag}
                  placeholder="予定タグ"
                  modalTitle="予定タグ"
                  options={episodeTagOptions}
                  onChange={form.setTag}
                  allowCustomValue
                  variant="chip"
                  pickerColumns={2}
                />
              </FormRow>
              <EpisodeFieldDivider />

              <FormRow
                label="公開設定"
                labelStyle={styles.episodeFieldLabel}
                style={styles.rowAlignStart}
              >
                <View style={styles.rowContentStack}>
                  <SlidingSegmentedControl
                    options={VISIBILITY_MODE_OPTIONS}
                    value={form.visibilityMode}
                    onChange={handleVisibilityModeChange}
                    compact
                  />
                  {form.visibilityMode === 'limited' ? (
                    <>
                      <ParticipantChipList
                        chips={visibilityChips}
                        layout="wrap"
                        onChipPress={(chip) => form.removeVisibility(chip.id)}
                        trailing={
                          <Pressable
                            style={[styles.participantAddChip, contentPersonTagStyle(content)]}
                            onPress={form.openVisibilitySelector}
                            accessibilityRole="button"
                            accessibilityLabel="公開相手を追加"
                          >
                            <Text style={[styles.participantAddChipText, contentTagTextStyle(content)]}>＋</Text>
                          </Pressable>
                        }
                      />
                      {form.connectedAudienceFriends.length === 0 ? (
                        <Text style={[styles.audienceEmptyHint, contentMutedTextStyle(content)]}>
                          コネクトしている人がいません
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </FormRow>
              <EpisodeFieldDivider />

              <FormRow
                label={`写真\n(${form.visibleExistingPhotos.length + form.newPhotoUris.length}/${PHOTO_LIMITS.free})`}
                labelNumberOfLines={2}
                labelStyle={styles.episodeFieldLabel}
                style={styles.rowAlignStart}
              >
                <View
                  style={styles.photoAddRow}
                  onLayout={(event) => {
                    const width = event.nativeEvent.layout.width;
                    setPhotoRowWidth((prev) => (prev === width ? prev : width));
                  }}
                >
                  <Pressable
                    style={[
                      styles.episodePhotoAddTile,
                      photoSlotStyle,
                      photoSlotSize > 0 ? { borderRadius: photoSlotSize / 2 } : null,
                      contentInputStyle(content),
                      form.isPhotoLimitReached && styles.episodePhotoAddButtonDisabled,
                    ]}
                    onPress={form.pickPhoto}
                    disabled={form.isPhotoLimitReached}
                  >
                    <Text
                      style={[
                        styles.episodePhotoAddTileText,
                        photoSlotSize > 0 ? { fontSize: Math.round(photoSlotSize * 0.42), lineHeight: Math.round(photoSlotSize * 0.46) } : null,
                        { color: '#FFFFFF' },
                        form.isPhotoLimitReached && contentMutedTextStyle(content),
                      ]}
                    >
                      ＋
                    </Text>
                  </Pressable>
                  {(form.visibleExistingPhotos.length > 0 || form.newPhotoUris.length > 0) ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.episodePhotoThumbScroll}
                      contentContainerStyle={styles.episodePhotoThumbRow}
                    >
                      {form.visibleExistingPhotos.map((photo) => (
                        <View key={`existing-photo-${photo.id}`} style={[styles.episodePhotoThumbWrap, photoSlotStyle]}>
                          <Image source={{ uri: photo.photoUri }} style={[styles.episodePhotoThumb, photoSlotStyle, fieldCorner, { backgroundColor: content.contentPhotoPlaceholder, borderColor: content.contentBorder }]} />
                          <Pressable
                            style={styles.episodePhotoRemoveButton}
                            onPress={() => form.removeExistingPhoto(photo.id)}
                          >
                            <Text style={styles.episodePhotoRemoveButtonText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                      {form.newPhotoUris.map((uri, index) => (
                        <View key={`new-photo-${index}-${uri}`} style={[styles.episodePhotoThumbWrap, photoSlotStyle]}>
                          <Image source={{ uri }} style={[styles.episodePhotoThumb, photoSlotStyle, fieldCorner, { backgroundColor: content.contentPhotoPlaceholder, borderColor: content.contentBorder }]} />
                          <Pressable
                            style={styles.episodePhotoRemoveButton}
                            onPress={() => form.removeNewPhoto(index)}
                          >
                            <Text style={styles.episodePhotoRemoveButtonText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              </FormRow>
              <EpisodeFieldDivider />

              <FormRow label="説明" layout="vertical">
                <NoteBlockEditor
                  style={[styles.episodeDescriptionInput, fieldCorner, contentInputStyle(content)]}
                  placeholder="入力"
                  placeholderTextColor={content.contentTextSecondary}
                  value={form.description}
                  onChangeText={form.setDescription}
                  minHeight={86}
                  uncapped
                />
              </FormRow>
              <View style={styles.formActions}>
                <Pressable
                  style={[styles.formCancelButton, fieldCorner, saving ? styles.saveButtonBusy : null]}
                  onPress={requestClose}
                  disabled={saving}
                >
                  <Text style={styles.formCancelButtonText}>キャンセル</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.formSaveButton,
                    fieldCorner,
                    contentFilledButtonStyle(content),
                    saving ? styles.saveButtonBusy : null,
                  ]}
                  onPress={onSave}
                  disabled={saving}
                >
                  <Text style={[styles.formSaveButtonText, contentFilledButtonTextStyle(content)]}>
                    {form.editingEpisodeId ? '更新' : '保存'}
                  </Text>
                </Pressable>
              </View>
            </FormScreenSection>
          </FormScreenBody>
        </FormScreenTemplate>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={datePickerOpen || timePickerOpen}
        onRequestClose={closeDateTimePicker}
      >
        <View style={styles.dateTimeModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeDateTimePicker}
            accessibilityLabel="閉じる"
            accessibilityRole="button"
          />
          <View
            style={[
              styles.dateTimeModalCard,
              { backgroundColor: content.contentCard, borderColor: content.contentBorder },
            ]}
          >
            <Text style={[styles.dateTimeModalTitle, contentTextStyle(content)]}>
              {datePickerOpen ? '日付' : '時刻'}
            </Text>
            {datePickerOpen ? (
              <DateTimePicker
                value={parseEpisodeDateString(form.date)}
                mode="date"
                display="spinner"
                locale="ja-JP"
                style={styles.dateTimePicker}
                {...dateTimePickerProps}
                minimumDate={form.episodeDateMinimumDate ?? DATE_PICKER_MIN}
                maximumDate={form.episodeDateMaximumDate ?? DATE_PICKER_MAX_FAR}
                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                  if (selected) form.setDate(formatEpisodeDateToYMD(selected));
                }}
              />
            ) : (
              <DateTimePicker
                value={combineLocalDateTime(
                  form.date || formatEpisodeDateToYMD(new Date()),
                  form.time || formatTimeFromDate(new Date())
                )}
                mode="time"
                display="spinner"
                locale="ja-JP"
                style={styles.dateTimePicker}
                {...dateTimePickerProps}
                {...openRangeDatePickerBounds()}
                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                  if (selected) form.setTime(formatTimeFromDate(selected));
                }}
              />
            )}
            <Pressable
              style={[styles.dateTimeModalDone, fieldCorner, contentFilledButtonStyle(content)]}
              onPress={closeDateTimePicker}
            >
              <Text style={[styles.dateTimeModalDoneText, contentFilledButtonTextStyle(content)]}>完了</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <EntrySelectorModal
        visible={form.selectorVisible}
        selectorTab={form.selectorTab}
        onTabChange={form.setSelectorTab}
        nameFilter={form.selectorNameFilter}
        onNameFilterChange={form.setSelectorNameFilter}
        affiliationFilter={form.selectorAffiliationFilter}
        onAffiliationFilterChange={form.setSelectorAffiliationFilter}
        experienceFilter={form.selectorExperienceFilter}
        onExperienceFilterChange={form.setSelectorExperienceFilter}
        friends={form.selectorFriends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={affiliationOptions}
        selectedIndividualIds={form.selectedIndividualIds}
        selectedGroupValues={form.selectedGroupValues}
        onToggleIndividual={form.toggleSelectorIndividual}
        onToggleGroup={form.toggleSelectorGroup}
        onCancel={form.handleSelectorCancel}
        onConfirm={form.handleSelectorConfirm}
        onPersonCreated={form.selectorTarget === 'visibility' ? undefined : onPersonCreated}
        enableGroupTab={false}
        allowCreate={form.selectorTarget !== 'visibility'}
        selectionTitle={form.selectorTarget === 'visibility' ? '公開相手' : '対象者'}
        emptyListMessage={
          form.selectorTarget === 'visibility' ? 'コネクトしている人がいません' : undefined
        }
      />

      <EpisodePhotoLibraryModal
        visible={form.photoLibraryVisible}
        maxSelection={form.remainingPhotoSlots}
        registeredCount={form.visibleExistingPhotos.length + form.newPhotoUris.length}
        dismissedAssetIds={form.dismissedPhotoAssetIds}
        preparing={form.photoResolving}
        onClose={form.closePhotoLibrary}
        onRegister={form.beginPhotoEdits}
      >
        <PhotoCropModal
          embedded
          visible={form.photoCropUri != null}
          uri={form.photoCropUri}
          aspectRatio={EPISODE_PHOTO_ASPECT}
          hint="ピンチで拡大・ドラッグで位置調整（カード表示は横4:縦3）"
          previews={form.photoEditPreviews}
          activePreviewIndex={form.photoEditIndex}
          onSelectPreview={form.selectPhotoEdit}
          onCancel={form.cancelPhotoCrop}
          onConfirm={form.confirmPhotoCrop}
        />
      </EpisodePhotoLibraryModal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
  },
  saveButtonBusy: {
    opacity: 0.55,
  },
  saveButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  formCancelButton: {
    backgroundColor: 'transparent',
    borderColor: Theme.btnGhostBorder,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  formCancelButtonText: {
    color: Theme.btnGhostText,
    fontWeight: '700',
    fontSize: Typography.base,
  },
  formSaveButton: {
    backgroundColor: Theme.btnPrimaryBg,
    borderColor: Theme.btnPrimaryBg,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  formSaveButtonText: {
    color: Theme.btnPrimaryText,
    fontWeight: '700',
    fontSize: Typography.base,
  },
  episodeFormSection: {
    gap: 0,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  episodeFieldLabel: {
    width: 72,
    textAlign: 'left',
  },
  rowAlignStart: {
    alignItems: 'flex-start',
  },
  rowContentStack: {
    width: '100%',
    gap: 8,
  },
  audienceEmptyHint: {
    fontSize: Typography.sm,
    fontWeight: '600',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  suggestionLabel: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    flexShrink: 0,
  },
  suggestionWell: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  episodeInput: {
    minHeight: 38,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.sm,
    backgroundColor: Theme.bgSurface,
    color: '#0f172a',
    paddingHorizontal: 10,
    fontSize: 14,
    width: '100%',
  },
  episodeDateInput: { justifyContent: 'center' },
  episodeDateText: { fontSize: Typography.base, color: '#111827' },
  episodeDatePlaceholder: { fontSize: Typography.base, color: '#94a3b8' },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  dateTimeDate: {
    flex: 1,
    width: undefined,
  },
  dateTimeTime: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  timeTap: {
    flex: 1,
    justifyContent: 'center',
  },
  timeTapText: {
    fontSize: Typography.base,
  },
  timeClearText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 18,
    paddingLeft: 4,
  },
  dateTimeModalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  dateTimeModalCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 16,
  },
  dateTimeModalTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dateTimePicker: {
    height: 216,
    width: '100%',
  },
  dateTimeModalDone: {
    alignSelf: 'flex-end',
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
  },
  dateTimeModalDoneText: {
    fontSize: 14,
    fontWeight: '700',
  },
  linkToEventButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    backgroundColor: Theme.bgSurface,
  },
  linkToEventButtonText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: '#0f172a',
  },
  participantAddChip: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAddChipText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  photoAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  episodePhotoAddTile: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodePhotoAddTileText: {
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 22,
  },
  episodePhotoThumbScroll: { flexGrow: 1, flexShrink: 1 },
  episodePhotoThumbRow: { flexDirection: 'row', gap: 8 },
  episodePhotoThumbWrap: { position: 'relative' },
  episodePhotoThumb: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    backgroundColor: '#f1f5f9',
  },
  episodePhotoRemoveButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodePhotoRemoveButtonText: {
    color: Theme.bgSurface,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  episodePhotoAddButtonDisabled: {
    opacity: 0.45,
  },
  episodeDescriptionInput: {
    minHeight: 86,
    textAlignVertical: 'top',
    color: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 14,
    marginBottom: 8,
  },
  episodeErrorText: { color: '#b91c1c', marginBottom: 8, fontSize: 12 },
  episodeSelectButton: {
    minHeight: 38,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.sm,
    backgroundColor: Theme.bgSurface,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  selectChipButton: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  selectChipButtonLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  selectChipText: {
    fontSize: Typography.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  selectChipPlaceholder: {
    fontSize: Typography.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  selectChipChevron: {
    fontSize: 9,
    marginTop: 1,
  },
  episodeSelectText: { fontSize: 14 },
  episodeSelectPlaceholder: { fontSize: 14 },
});
