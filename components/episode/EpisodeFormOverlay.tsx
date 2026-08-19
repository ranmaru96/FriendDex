import { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Platform,
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
import { FormRow } from '@/components/ui/FormRow';
import { OptionPickerModal } from '@/components/ui/OptionPickerModal';
import { ViewportCappedMultilineTextInput } from '@/components/ui/ViewportCappedMultilineTextInput';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  contentDateTimePickerProps,
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentPersonTagStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTagTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import { DATE_PICKER_MAX_FAR, DATE_PICKER_MIN } from '@/utils/datePickerBounds';
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
import { PickerDoneOverlay } from '@/components/ui/PickerDoneOverlay';
import type { useEpisodeForm } from '@/hooks/useEpisodeForm';
import type { Friend } from '@/types';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';
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
  onPersonCreated?: (friend: Friend) => void;
};

function SelectInput({
  value,
  placeholder,
  modalTitle,
  options,
  onChange,
  style,
  includeEmptyOption = true,
  allowCustomValue = false,
  variant,
}: {
  value: string;
  placeholder: string;
  /** モーダル見出し。未指定時は placeholder を流用 */
  modalTitle?: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  includeEmptyOption?: boolean;
  allowCustomValue?: boolean;
  variant?: 'field' | 'chip';
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
  const fieldRadius = kit.formFieldBorderRadius;
  const chipRadius = fieldRadius === 0 ? 0 : Radius.full;

  return (
    <>
      <Pressable
        style={[
          isChip ? styles.selectChipButton : styles.episodeSelectButton,
          isChip ? styles.selectChipButtonLayout : null,
          { borderRadius: isChip ? chipRadius : fieldRadius },
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
        clearLabel={includeEmptyOption ? placeholder : null}
        allowCustomValue={allowCustomValue}
        customInputPlaceholder="新しいタグ名"
        customActionLabel="このタグを使う"
      />
    </>
  );
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
  onPersonCreated,
}: EpisodeFormOverlayProps) {
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const fieldRadius = kit.formFieldBorderRadius;
  const fieldCorner = { borderRadius: fieldRadius };
  const tagChipRadius = fieldRadius === 0 ? 0 : 999;
  const friendPhotoById = useMemo(
    () => new Map(friends.map((friend) => [friend.id, friend.photoUri ?? null])),
    [friends]
  );
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
        { friendPhotoById }
      ),
    [form.participants, form.friendNameById, friendPhotoById]
  );

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
          onBack={onClose}
          right={
            <Pressable
              style={[styles.saveButton, contentFilledButtonStyle(content)]}
              onPress={onSave}
            >
              <Text style={[styles.saveButtonText, contentFilledButtonTextStyle(content)]}>
                {form.editingEpisodeId ? '更新' : '保存'}
              </Text>
            </Pressable>
          }
          extraScrollHeight={140}
          scrollContentStyle={styles.scrollContent}
        >
          <FormScreenBody style={{ borderRadius: kit.formPanelBorderRadius }}>
            <FormScreenSection style={styles.episodeFormSection}>
              <FormRow label="タイトル">
                <TextInput
                  style={[styles.episodeInput, fieldCorner, contentInputStyle(content)]}
                  placeholder="入力"
                  placeholderTextColor={content.contentTextSecondary}
                  value={form.title}
                  onChangeText={form.setTitle}
                />
              </FormRow>

              <FormRow
                label="日付"
                style={styles.rowAlignStart}
              >
                <View style={styles.rowContentStack}>
                  <Pressable
                    style={[styles.episodeInput, fieldCorner, contentInputStyle(content), styles.episodeDateInput]}
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
                  {form.showDatePicker && !form.isLinkedEventSingleDay ? (
                    <View style={styles.datePickerWrap}>
                      <DateTimePicker
                        value={parseEpisodeDateString(form.date)}
                        mode="date"
                        display="spinner"
                        locale="ja-JP"
                        style={styles.datePickerSelf}
                        {...dateTimePickerProps}
                        minimumDate={form.episodeDateMinimumDate ?? DATE_PICKER_MIN}
                        maximumDate={form.episodeDateMaximumDate ?? DATE_PICKER_MAX_FAR}
                        onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                          if (Platform.OS !== 'ios') form.setShowDatePicker(false);
                          if (selected) form.setDate(formatEpisodeDateToYMD(selected));
                        }}
                      />
                      <PickerDoneOverlay
                        style={[fieldCorner, contentInputStyle(content)]}
                        textStyle={contentTextStyle(content)}
                        onPress={() => form.setShowDatePicker(false)}
                      />
                    </View>
                  ) : null}
                  <View style={styles.timeRow}>
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
                        {form.time ? `時刻 ${form.time}` : '時刻（任意）'}
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
                        <Text style={[styles.timeClearText, contentMutedTextStyle(content)]}>クリア</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {form.showTimePicker ? (
                    <View style={styles.datePickerWrap}>
                      <DateTimePicker
                        value={combineLocalDateTime(
                          form.date || formatEpisodeDateToYMD(new Date()),
                          form.time || formatTimeFromDate(new Date())
                        )}
                        mode="time"
                        display="spinner"
                        locale="ja-JP"
                        style={styles.datePickerSelf}
                        {...dateTimePickerProps}
                        onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                          if (Platform.OS !== 'ios') form.setShowTimePicker(false);
                          if (selected) form.setTime(formatTimeFromDate(selected));
                        }}
                      />
                      <PickerDoneOverlay
                        style={[fieldCorner, contentInputStyle(content)]}
                        textStyle={contentTextStyle(content)}
                        onPress={() => form.setShowTimePicker(false)}
                      />
                    </View>
                  ) : null}
                </View>
              </FormRow>

              <FormRow
                label={'対応する\n予定'}
                labelNumberOfLines={2}
                style={styles.rowAlignStart}
              >
                <EpisodeEventLinkField
                  dateKey={form.date}
                  mode={form.eventLinkMode}
                  linkedEventId={form.linkedEventId}
                  onModeChange={form.setEventLinkMode}
                  onSelectEvent={form.linkToEvent}
                  fieldCorner={fieldCorner}
                />
              </FormRow>

              <FormRow
                label="参加者"
                style={styles.rowAlignStart}
              >
                <View style={styles.rowContentStack}>
                  <Pressable
                    style={[styles.addParticipantButton, fieldCorner, contentInputStyle(content), styles.inlineActionButton]}
                    onPress={form.openParticipantSelector}
                  >
                    <Text style={[styles.addParticipantButtonText, contentTextStyle(content)]}>参加者を選ぶ</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.selectedEntryTagArea, fieldCorner, contentSurfaceStyle(content)]}
                    onPress={form.openParticipantSelector}
                  >
                    {participantChips.length > 0 ? (
                      <ParticipantChipList chips={participantChips} layout="wrap" />
                    ) : (
                      <Text style={[styles.selectedEntryEmptyText, contentMutedTextStyle(content)]}>
                        参加者が選択されていません
                      </Text>
                    )}
                  </Pressable>
                </View>
              </FormRow>

              <FormRow label="タグ" contentLayout="compact">
                <SelectInput
                  value={form.tag}
                  placeholder="未設定"
                  modalTitle="予定タグ"
                  options={episodeTagOptions}
                  onChange={form.setTag}
                  allowCustomValue
                />
              </FormRow>

              <FormRow label="公開設定" contentLayout="compact">
                <SelectInput
                  value={form.visibilityMode}
                  placeholder="公開設定"
                  options={VISIBILITY_MODE_OPTIONS}
                  onChange={(value) => {
                    if (isEpisodeVisibilityMode(value)) {
                      form.setVisibilityMode(value);
                    }
                  }}
                  includeEmptyOption={false}
                />
              </FormRow>
              {form.visibilityMode === 'limited' ? (
                <FormRow
                  label="公開先"
                  style={styles.rowAlignStart}
                >
                  <View style={styles.rowContentStack}>
                    <Pressable
                      style={[styles.addParticipantButton, fieldCorner, contentInputStyle(content), styles.inlineActionButton]}
                      onPress={form.openVisibilitySelector}
                    >
                      <Text style={[styles.addParticipantButtonText, contentTextStyle(content)]}>公開先を選ぶ</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.selectedEntryTagArea, fieldCorner, contentSurfaceStyle(content)]}
                      onPress={form.openVisibilitySelector}
                    >
                      {form.visibility.filter((entry) => entry.value.trim().length > 0).length > 0 ? (
                        <View style={styles.selectedEntryTagWrap}>
                          {form.visibility
                            .filter((entry) => entry.value.trim().length > 0)
                            .map((entry, index) => {
                              const label =
                                entry.kind === 'individual'
                                  ? form.friendNameById.get(entry.value) ?? entry.value
                                  : entry.value;
                              return (
                                <View
                                  key={`visibility-tag-${entry.kind}-${entry.value}-${index}`}
                                  style={[styles.episodeParticipantTag, contentPersonTagStyle(content), { borderRadius: tagChipRadius }]}
                                >
                                  <Text style={[styles.episodeParticipantTagName, contentTagTextStyle(content)]}>{label}</Text>
                                </View>
                              );
                            })}
                        </View>
                      ) : (
                        <Text style={[styles.selectedEntryEmptyText, contentMutedTextStyle(content)]}>
                          公開先が選択されていません
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </FormRow>
              ) : null}

              <FormRow
                label="写真"
                style={styles.rowAlignStart}
              >
                <View style={styles.rowContentStack}>
                  <Pressable
                    style={[
                      styles.episodePhotoAddButton,
                      fieldCorner,
                      contentInputStyle(content),
                      styles.inlineActionButton,
                      form.isPhotoLimitReached && styles.episodePhotoAddButtonDisabled,
                    ]}
                    onPress={form.pickPhoto}
                    disabled={form.isPhotoLimitReached}
                  >
                    <Text
                      style={[
                        styles.episodePhotoAddButtonText,
                        contentTextStyle(content),
                        form.isPhotoLimitReached && [styles.episodePhotoAddButtonTextDisabled, contentMutedTextStyle(content)],
                      ]}
                    >
                      写真を追加
                    </Text>
                  </Pressable>
                  {(form.visibleExistingPhotos.length > 0 || form.newPhotoUris.length > 0) && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.episodePhotoThumbScroll}
                      contentContainerStyle={styles.episodePhotoThumbRow}
                    >
                      {form.visibleExistingPhotos.map((photo) => (
                        <View key={`existing-photo-${photo.id}`} style={styles.episodePhotoThumbWrap}>
                          <Image source={{ uri: photo.photoUri }} style={[styles.episodePhotoThumb, fieldCorner, { backgroundColor: content.contentPhotoPlaceholder, borderColor: content.contentBorder }]} />
                          <Pressable
                            style={styles.episodePhotoRemoveButton}
                            onPress={() => form.removeExistingPhoto(photo.id)}
                          >
                            <Text style={styles.episodePhotoRemoveButtonText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                      {form.newPhotoUris.map((uri, index) => (
                        <View key={`new-photo-${index}-${uri}`} style={styles.episodePhotoThumbWrap}>
                          <Image source={{ uri }} style={[styles.episodePhotoThumb, fieldCorner, { backgroundColor: content.contentPhotoPlaceholder, borderColor: content.contentBorder }]} />
                          <Pressable
                            style={styles.episodePhotoRemoveButton}
                            onPress={() => form.removeNewPhoto(index)}
                          >
                            <Text style={styles.episodePhotoRemoveButtonText}>×</Text>
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  {form.isPhotoLimitReached ? (
                    <Text style={[styles.episodePhotoUpgradeHint, contentMutedTextStyle(content)]}>
                      プランをアップグレードするとさらに追加できます
                    </Text>
                  ) : null}
                </View>
              </FormRow>

              <ViewportCappedMultilineTextInput
                style={[styles.episodeDescriptionInput, fieldCorner, contentInputStyle(content)]}
                placeholder="説明文"
                placeholderTextColor={content.contentTextSecondary}
                value={form.description}
                onChangeText={form.setDescription}
                minHeight={86}
              />
              {form.formError ? <Text style={styles.episodeErrorText}>{form.formError}</Text> : null}
              <View style={styles.formActions}>
                <Pressable style={[styles.formCancelButton, fieldCorner]} onPress={onClose}>
                  <Text style={styles.formCancelButtonText}>キャンセル</Text>
                </Pressable>
                <Pressable
                  style={[styles.formSaveButton, fieldCorner, contentFilledButtonStyle(content)]}
                  onPress={onSave}
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
        friends={friends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={affiliationOptions}
        selectedIndividualIds={form.selectedIndividualIds}
        selectedGroupValues={form.selectedGroupValues}
        onToggleIndividual={form.toggleSelectorIndividual}
        onToggleGroup={form.toggleSelectorGroup}
        onCancel={form.handleSelectorCancel}
        onConfirm={form.handleSelectorConfirm}
        onPersonCreated={onPersonCreated}
        enableGroupTab={form.selectorTarget === 'visibility'}
      />

      <PhotoCropModal
        visible={form.photoCropUri != null}
        uri={form.photoCropUri}
        aspectRatio={EPISODE_PHOTO_ASPECT}
        hint="ピンチで拡大・ドラッグで位置調整（カード表示は横4:縦3）"
        onCancel={form.cancelPhotoCrop}
        onConfirm={form.confirmPhotoCrop}
      />
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
  saveButtonText: {
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    paddingTop: Spacing.md,
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
    gap: 8,
  },
  rowAlignStart: {
    alignItems: 'flex-start',
  },
  rowContentStack: {
    width: '100%',
    gap: 8,
  },
  inlineActionButton: {
    alignSelf: 'flex-start',
  },
  episodeInput: {
    minHeight: 38,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.bgSurface,
    color: '#0f172a',
    paddingHorizontal: 10,
    fontSize: 14,
    width: '100%',
  },
  episodeDateInput: { justifyContent: 'center' },
  episodeDateText: { fontSize: Typography.base, color: '#111827' },
  episodeDatePlaceholder: { fontSize: Typography.base, color: '#94a3b8' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    minHeight: 28,
  },
  timeTap: {
    flexShrink: 1,
    paddingVertical: 4,
  },
  timeTapText: {
    fontSize: 13,
  },
  timeClearText: {
    fontSize: 13,
    paddingHorizontal: 4,
  },
  datePickerWrap: { marginBottom: 8 },
  datePickerSelf: { alignSelf: 'flex-end' },
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
  addParticipantButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addParticipantButtonText: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  selectedEntryTagArea: {
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.bgSurface,
    padding: 8,
    marginBottom: 8,
  },
  selectedEntryTagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectedEntryEmptyText: { fontSize: Typography.base, color: '#94a3b8' },
  episodeParticipantTag: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  episodeParticipantTagName: { fontSize: 12, fontWeight: '600', color: '#0f172a' },
  episodePhotoThumbScroll: { marginBottom: 4 },
  episodePhotoThumbRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  episodePhotoThumbWrap: { position: 'relative', width: 72, height: 72 },
  episodePhotoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    backgroundColor: '#f1f5f9',
  },
  episodePhotoRemoveButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodePhotoRemoveButtonText: {
    color: Theme.bgSurface,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  episodePhotoAddButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  episodePhotoAddButtonDisabled: {
    opacity: 0.45,
    backgroundColor: '#e2e8f0',
    borderColor: Theme.inputBorder,
  },
  episodePhotoAddButtonText: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  episodePhotoAddButtonTextDisabled: { color: '#94a3b8' },
  episodePhotoUpgradeHint: { marginTop: 6, fontSize: 11, color: '#64748b' },
  episodeDescriptionInput: {
    minHeight: 86,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: Theme.bgSurface,
    textAlignVertical: 'top',
    color: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  episodeErrorText: { color: '#b91c1c', marginBottom: 8, fontSize: 12 },
  episodeSelectButton: {
    minHeight: 38,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.bgSurface,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  selectChipButton: {
    borderWidth: 1,
    borderRadius: Radius.full,
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
