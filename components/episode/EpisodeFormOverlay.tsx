import { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
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
import { Theme, Radius, Typography } from '@/constants/theme';
import { FormRow } from '@/components/ui/FormRow';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentPersonTagStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTagTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { FormOverlayTemplate, FormScreenBody, FormScreenSection } from '@/components/screen-templates';
import {
  formatEpisodeDateToYMD,
  isEpisodeVisibilityMode,
  parseEpisodeDateString,
  VISIBILITY_MODE_OPTIONS,
  type Option,
} from '@/components/episode/types';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { PhotoCropModal, EPISODE_PHOTO_ASPECT } from '@/components/photo/PhotoCropModal';
import type { useEpisodeForm } from '@/hooks/useEpisodeForm';
import type { Friend } from '@/types';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';

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
  onLinkToEvent?: () => void;
};

function SelectInput({
  value,
  placeholder,
  options,
  onChange,
  style,
  includeEmptyOption = true,
  variant,
}: {
  value: string;
  placeholder: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  includeEmptyOption?: boolean;
  variant?: 'field' | 'chip';
}) {
  const kit = useUiKit();
  const content = useContentColors();
  const resolvedVariant = variant ?? (kit.formLayout === 'horizontal' ? 'chip' : 'field');
  const [modalVisible, setModalVisible] = useState(false);
  const selectedLabel = useMemo(() => {
    const selected = options.find((option) => option.value === value);
    return selected?.label ?? placeholder;
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
        onPress={() => setModalVisible(true)}
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
      <Modal transparent animationType="fade" visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.modalTitle, contentTextStyle(content)]}>{placeholder}</Text>
            <ScrollView style={styles.modalOptionsScroll} keyboardShouldPersistTaps="handled">
              {includeEmptyOption ? (
                <Pressable
                  style={[
                    styles.modalOption,
                    value === '' ? contentSelectedOptionStyle(content) : null,
                  ]}
                  onPress={() => {
                    onChange('');
                    setModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, contentTextStyle(content)]}>{placeholder}</Text>
                </Pressable>
              ) : null}
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.modalOption,
                    value === option.value ? contentSelectedOptionStyle(content) : null,
                  ]}
                  onPress={() => {
                    onChange(option.value);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, contentTextStyle(content)]}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={[styles.modalCloseButton, contentInputStyle(content)]} onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalCloseButtonText, contentTextStyle(content)]}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  onLinkToEvent,
}: EpisodeFormOverlayProps) {
  const kit = useUiKit();
  const content = useContentColors();
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

  if (!visible) {
    return null;
  }

  return (
    <>
      <FormOverlayTemplate title={form.editingEpisodeId ? 'エピソードを編集' : 'エピソードを追加'}>
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

            <FormRow label="日付">
              <Pressable
                style={[styles.episodeInput, fieldCorner, contentInputStyle(content), styles.episodeDateInput]}
                onPress={() => form.setShowDatePicker(true)}
              >
                <Text style={form.date ? [styles.episodeDateText, contentTextStyle(content)] : [styles.episodeDatePlaceholder, contentMutedTextStyle(content)]}>
                  {form.date || 'YYYY-MM-DD'}
                </Text>
              </Pressable>
            </FormRow>
            {form.showDatePicker ? (
              <View style={styles.datePickerWrap}>
                <DateTimePicker
                  value={parseEpisodeDateString(form.date)}
                  mode="date"
                  display="spinner"
                  locale="ja-JP"
                  style={styles.datePickerSelf}
                  minimumDate={form.allowedEventDateRange?.minimumDate}
                  maximumDate={form.allowedEventDateRange?.maximumDate}
                  onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== 'ios') form.setShowDatePicker(false);
                    if (selected) form.setDate(formatEpisodeDateToYMD(selected));
                  }}
                />
                <Pressable style={[styles.datePickerDone, fieldCorner, contentInputStyle(content)]} onPress={() => form.setShowDatePicker(false)}>
                  <Text style={[styles.datePickerDoneText, contentTextStyle(content)]}>完了</Text>
                </Pressable>
              </View>
            ) : null}

            <FormRow label="参加者" contentLayout="action">
              <Pressable style={[styles.addParticipantButton, fieldCorner, contentInputStyle(content)]} onPress={form.openParticipantSelector}>
                <Text style={[styles.addParticipantButtonText, contentTextStyle(content)]}>参加者を選ぶ</Text>
              </Pressable>
            </FormRow>
            <Pressable style={[styles.selectedEntryTagArea, fieldCorner, contentSurfaceStyle(content)]} onPress={form.openParticipantSelector}>
              {participantChips.length > 0 ? (
                <ParticipantChipList chips={participantChips} layout="wrap" />
              ) : (
                <Text style={[styles.selectedEntryEmptyText, contentMutedTextStyle(content)]}>参加者が選択されていません</Text>
              )}
            </Pressable>

            <FormRow label="タグ" contentLayout="compact">
              <SelectInput
                value={form.tag}
                placeholder="未設定"
                options={episodeTagOptions}
                onChange={form.setTag}
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
              <>
                <FormRow label="公開先" contentLayout="action">
                  <Pressable style={[styles.addParticipantButton, fieldCorner, contentInputStyle(content)]} onPress={form.openVisibilitySelector}>
                    <Text style={[styles.addParticipantButtonText, contentTextStyle(content)]}>公開先を選ぶ</Text>
                  </Pressable>
                </FormRow>
                <Pressable style={[styles.selectedEntryTagArea, fieldCorner, contentSurfaceStyle(content)]} onPress={form.openVisibilitySelector}>
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
                    <Text style={[styles.selectedEntryEmptyText, contentMutedTextStyle(content)]}>公開先が選択されていません</Text>
                  )}
                </Pressable>
              </>
            ) : null}

            <FormRow label="写真" contentLayout="action">
              <Pressable
                style={[styles.episodePhotoAddButton, fieldCorner, contentInputStyle(content), form.isPhotoLimitReached && styles.episodePhotoAddButtonDisabled]}
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
            </FormRow>
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

            <TextInput
              style={[styles.episodeDescriptionInput, fieldCorner, contentInputStyle(content)]}
              placeholder="説明文の記入（記入式）"
              placeholderTextColor={content.contentTextSecondary}
              multiline
              value={form.description}
              onChangeText={form.setDescription}
            />
            {form.formError ? <Text style={styles.episodeErrorText}>{form.formError}</Text> : null}
            {form.editingEpisodeId && !form.linkedEventId && onLinkToEvent ? (
              <Pressable style={[styles.linkToEventButton, fieldCorner, contentSurfaceStyle(content)]} onPress={onLinkToEvent}>
                <Text style={[styles.linkToEventButtonText, contentTextStyle(content)]}>予定に紐づける</Text>
              </Pressable>
            ) : null}
            <View style={styles.episodeFormActions}>
              <Pressable style={[styles.episodeCancelButton, fieldCorner]} onPress={onClose}>
                <Text style={styles.episodeCancelButtonText}>キャンセル</Text>
              </Pressable>
              <Pressable style={[styles.episodeCreateButton, fieldCorner]} onPress={onSave}>
                <Text style={styles.episodeCreateButtonText}>
                  {form.editingEpisodeId ? '更新' : '保存'}
                </Text>
              </Pressable>
            </View>
          </FormScreenSection>
        </FormScreenBody>
      </FormOverlayTemplate>

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
  episodeFormSection: {
    gap: 8,
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
  datePickerWrap: { marginBottom: 8 },
  datePickerSelf: { alignSelf: 'flex-end' },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
    marginTop: 8,
  },
  datePickerDoneText: { color: '#0f172a', fontWeight: '600', fontSize: Typography.base },
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
  episodeFormActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  episodeCancelButton: {
    backgroundColor: 'transparent',
    borderColor: Theme.btnGhostBorder,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  episodeCancelButtonText: { color: Theme.btnGhostText, fontWeight: '700', fontSize: Typography.base },
  episodeCreateButton: {
    backgroundColor: Theme.btnPrimaryBg,
    borderColor: Theme.btnPrimaryBg,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  episodeCreateButtonText: { color: Theme.btnPrimaryText, fontWeight: '700', fontSize: Typography.base },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    borderRadius: Radius.md,
    padding: 14,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  modalOptionsScroll: { marginBottom: 10 },
  modalOption: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radius.sm },
  modalOptionText: { fontSize: 14 },
  modalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
  },
  modalCloseButtonText: { fontWeight: '600' },
});
