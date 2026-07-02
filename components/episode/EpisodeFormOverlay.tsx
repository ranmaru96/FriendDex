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
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Theme, Radius, Typography } from '@/constants/theme';
import {
  formatEpisodeDateToYMD,
  isEpisodeVisibilityMode,
  parseEpisodeDateString,
  VISIBILITY_MODE_OPTIONS,
  type Option,
} from '@/components/episode/types';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
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
}: {
  value: string;
  placeholder: string;
  options: Option[];
  onChange: (value: string) => void;
  style?: object;
  includeEmptyOption?: boolean;
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const selectedLabel = useMemo(() => {
    const selected = options.find((option) => option.value === value);
    return selected?.label ?? placeholder;
  }, [options, placeholder, value]);

  return (
    <>
      <Pressable style={[styles.episodeSelectButton, style]} onPress={() => setModalVisible(true)}>
        <Text style={value ? styles.episodeSelectText : styles.episodeSelectPlaceholder} numberOfLines={1}>
          {selectedLabel}
        </Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{placeholder}</Text>
            <ScrollView style={styles.modalOptionsScroll} keyboardShouldPersistTaps="handled">
              {includeEmptyOption ? (
                <Pressable
                  style={[styles.modalOption, value === '' && styles.modalOptionSelected]}
                  onPress={() => {
                    onChange('');
                    setModalVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{placeholder}</Text>
                </Pressable>
              ) : null}
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.modalOption, value === option.value && styles.modalOptionSelected]}
                  onPress={() => {
                    onChange(option.value);
                    setModalVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>閉じる</Text>
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
      <View style={styles.formOverlay}>
        <KeyboardAwareScrollView
          style={styles.formOverlayScroll}
          contentContainerStyle={styles.formOverlayScrollContent}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          extraScrollHeight={24}
        >
          <Text style={styles.formOverlayTitle}>
            {form.editingEpisodeId ? 'エピソードを編集' : 'エピソードを追加'}
          </Text>
          <View style={styles.episodeFormCard}>
            <View style={styles.episodeTitleDateRow}>
              <TextInput
                style={[styles.episodeInput, styles.episodeTitleInput]}
                placeholder="タイトル"
                placeholderTextColor={Theme.inputPlaceholder}
                value={form.title}
                onChangeText={form.setTitle}
              />
              <Pressable
                style={[styles.episodeInput, styles.episodeDateInput]}
                onPress={() => form.setShowDatePicker(true)}
              >
                <Text style={form.date ? styles.episodeDateText : styles.episodeDatePlaceholder}>
                  {form.date || 'YYYY-MM-DD'}
                </Text>
              </Pressable>
            </View>
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
                <Pressable style={styles.datePickerDone} onPress={() => form.setShowDatePicker(false)}>
                  <Text style={styles.datePickerDoneText}>完了</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.episodeParticipantRow}>
              <Text style={styles.episodeParticipantLabel}>エピソードタグ</Text>
              <SelectInput
                value={form.tag}
                placeholder="未設定"
                options={episodeTagOptions}
                onChange={form.setTag}
                style={styles.episodeTagSelect}
              />
            </View>

            <View style={styles.episodeParticipantRow}>
              <Text style={styles.episodeParticipantLabel}>参加者</Text>
              <Pressable style={styles.addParticipantButton} onPress={form.openParticipantSelector}>
                <Text style={styles.addParticipantButtonText}>参加者を選ぶ</Text>
              </Pressable>
            </View>
            <Pressable style={styles.selectedEntryTagArea} onPress={form.openParticipantSelector}>
              {participantChips.length > 0 ? (
                <ParticipantChipList chips={participantChips} layout="wrap" />
              ) : (
                <Text style={styles.selectedEntryEmptyText}>参加者が選択されていません</Text>
              )}
            </Pressable>

            <View style={styles.episodeParticipantRow}>
              <Text style={styles.episodeParticipantLabel}>公開設定</Text>
              <SelectInput
                value={form.visibilityMode}
                placeholder="公開設定"
                options={VISIBILITY_MODE_OPTIONS}
                onChange={(value) => {
                  if (isEpisodeVisibilityMode(value)) {
                    form.setVisibilityMode(value);
                  }
                }}
                style={styles.visibilityModeSelect}
                includeEmptyOption={false}
              />
            </View>
            {form.visibilityMode === 'limited' ? (
              <>
                <View style={styles.episodeParticipantRow}>
                  <Text style={styles.episodeParticipantLabel}>公開先</Text>
                  <Pressable style={styles.addParticipantButton} onPress={form.openVisibilitySelector}>
                    <Text style={styles.addParticipantButtonText}>公開先を選ぶ</Text>
                  </Pressable>
                </View>
                <Pressable style={styles.selectedEntryTagArea} onPress={form.openVisibilitySelector}>
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
                              style={styles.episodeParticipantTag}
                            >
                              <Text style={styles.episodeParticipantTagName}>{label}</Text>
                            </View>
                          );
                        })}
                    </View>
                  ) : (
                    <Text style={styles.selectedEntryEmptyText}>公開先が選択されていません</Text>
                  )}
                </Pressable>
              </>
            ) : null}

            <View style={styles.episodePhotoSection}>
              <Text style={styles.episodeParticipantLabel}>写真</Text>
              {(form.visibleExistingPhotos.length > 0 || form.newPhotoUris.length > 0) && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.episodePhotoThumbScroll}
                  contentContainerStyle={styles.episodePhotoThumbRow}
                >
                  {form.visibleExistingPhotos.map((photo) => (
                    <View key={`existing-photo-${photo.id}`} style={styles.episodePhotoThumbWrap}>
                      <Image source={{ uri: photo.photoUri }} style={styles.episodePhotoThumb} />
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
                      <Image source={{ uri }} style={styles.episodePhotoThumb} />
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
              <Pressable
                style={[styles.episodePhotoAddButton, form.isPhotoLimitReached && styles.episodePhotoAddButtonDisabled]}
                onPress={form.pickPhoto}
                disabled={form.isPhotoLimitReached}
              >
                <Text
                  style={[
                    styles.episodePhotoAddButtonText,
                    form.isPhotoLimitReached && styles.episodePhotoAddButtonTextDisabled,
                  ]}
                >
                  写真を追加
                </Text>
              </Pressable>
              {form.isPhotoLimitReached ? (
                <Text style={styles.episodePhotoUpgradeHint}>
                  プランをアップグレードするとさらに追加できます
                </Text>
              ) : null}
            </View>

            <TextInput
              style={styles.episodeDescriptionInput}
              placeholder="説明文の記入（記入式）"
              placeholderTextColor={Theme.inputPlaceholder}
              multiline
              value={form.description}
              onChangeText={form.setDescription}
            />
            {form.formError ? <Text style={styles.episodeErrorText}>{form.formError}</Text> : null}
            {form.editingEpisodeId && !form.linkedEventId && onLinkToEvent ? (
              <Pressable style={styles.linkToEventButton} onPress={onLinkToEvent}>
                <Text style={styles.linkToEventButtonText}>予定に紐づける</Text>
              </Pressable>
            ) : null}
            <View style={styles.episodeFormActions}>
              <Pressable style={styles.episodeCancelButton} onPress={onClose}>
                <Text style={styles.episodeCancelButtonText}>キャンセル</Text>
              </Pressable>
              <Pressable style={styles.episodeCreateButton} onPress={onSave}>
                <Text style={styles.episodeCreateButtonText}>
                  {form.editingEpisodeId ? '更新' : '保存'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
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
      />
    </>
  );
}

const styles = StyleSheet.create({
  formOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f1f5f9',
    zIndex: 100,
    elevation: 100,
  },
  formOverlayScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  formOverlayScrollContent: {
    paddingBottom: 28,
  },
  formOverlayTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  episodeFormCard: {
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: 10,
    backgroundColor: Theme.inputBg,
  },
  episodeTitleDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
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
  },
  episodeTitleInput: { flex: 1 },
  episodeDateInput: { width: 130, justifyContent: 'center' },
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
  episodeParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  episodeParticipantLabel: { fontSize: 14, color: '#0f172a', fontWeight: '700' },
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
  visibilityModeSelect: { minWidth: 120 },
  episodeTagSelect: { flex: 1, minWidth: 0 },
  episodePhotoSection: { marginBottom: 8 },
  episodePhotoThumbScroll: { marginBottom: 8 },
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
  episodeSelectText: { fontSize: 14, color: '#0f172a' },
  episodeSelectPlaceholder: { fontSize: 14, color: '#94a3b8' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.md,
    padding: 14,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  modalOptionsScroll: { marginBottom: 10 },
  modalOption: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: Radius.sm },
  modalOptionSelected: { backgroundColor: '#e0f2fe' },
  modalOptionText: { fontSize: 14, color: '#1e293b' },
  modalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
  },
  modalCloseButtonText: { color: '#0f172a', fontWeight: '600' },
});
