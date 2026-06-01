import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';

import {
  createFriend,
  getFriendById,
  initializeDatabase,
  resyncEpisodesForFriendAffiliationChange,
  updateFriend,
} from './db';
import { FriendInput, MBTI_TYPES } from './types';

type Option = { label: string; value: string };

type SelectFieldProps = {
  label: string;
  value: string;
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
};

type DynamicInputListProps = {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
};

const formatDateToYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDateString = (s: string): Date => {
  const parts = s.split('-').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
};

const mbtiOptions: Option[] = [{ label: '未選択', value: '' }, ...MBTI_TYPES.map((type) => ({ label: type, value: type }))];

const EMPTY_FORM: FriendInput = {
  name: '',
  nickname: '',
  origin: '',
  residence: '',
  mbti: '',
  birthday: '',
  height: null,
  weight: null,
  category: '',
  description: '',
  photoUri: null,
  affiliations: [''],
  personalities: [''],
  experiences: [''],
  traits: [''],
  likes: [''],
  dislikes: [''],
};

const cleanArray = (values: string[]): string[] => values.map((item) => item.trim()).filter(Boolean);

function SelectField({ label, value, options, placeholder = '選択', onChange }: SelectFieldProps) {
  const [visible, setVisible] = useState(false);
  const selectedLabel = useMemo(() => {
    const item = options.find((option) => option.value === value);
    return item?.label ?? placeholder;
  }, [options, placeholder, value]);

  return (
    <View style={styles.formRow}>
      <Text style={styles.formLabel}>{label}</Text>
      <Pressable style={styles.selectButton} onPress={() => setVisible(true)}>
        <Text style={styles.selectValue}>{selectedLabel}</Text>
        <Text style={styles.selectIcon}>▼</Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={styles.modalOptions}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.modalOption, option.value === value && styles.modalOptionSelected]}
                  onPress={() => {
                    onChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setVisible(false)}>
              <Text style={styles.modalCloseText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DynamicInputList({ title, values, onChange, placeholder }: DynamicInputListProps) {
  const updateItem = (index: number, text: string) => {
    const next = [...values];
    next[index] = text;
    onChange(next);
  };

  const addItem = () => onChange([...values, '']);
  const removeItem = (index: number) => onChange(values.filter((_, itemIndex) => itemIndex !== index));

  return (
    <View style={styles.multiSection}>
      <View style={styles.multiSectionHeader}>
        <Text style={styles.multiSectionTitle}>{title}</Text>
        <Pressable style={styles.circleButton} onPress={addItem}>
          <Text style={styles.circleButtonText}>＋</Text>
        </Pressable>
      </View>

      {values.map((value, index) => (
        <View key={`${title}-${index}`} style={styles.multiRow}>
          <TextInput
            value={value}
            onChangeText={(text) => updateItem(index, text)}
            placeholder={placeholder}
            style={styles.multiInput}
          />
          {values.length > 1 && (
            <Pressable style={styles.removeButton} onPress={() => removeItem(index)}>
              <Text style={styles.removeButtonText}>削除</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

export default function EditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const friendId = useMemo(() => {
    if (Array.isArray(params.id)) return params.id[0] ?? '';
    return params.id ?? '';
  }, [params.id]);

  const isEditMode = !!friendId;
  const [form, setForm] = useState<FriendInput>(EMPTY_FORM);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [nameSaveAttempted, setNameSaveAttempted] = useState(false);
  const prevFriendIdRef = useRef(friendId);

  useEffect(() => {
    if (prevFriendIdRef.current !== friendId) {
      prevFriendIdRef.current = friendId;
      setNameSaveAttempted(false);
    }
  }, [friendId]);

  const loadFriend = useCallback(() => {
    initializeDatabase();
    if (!friendId) {
      setForm(EMPTY_FORM);
      return;
    }
    const friend = getFriendById(friendId);
    if (!friend) {
      Alert.alert('エラー', '編集対象の人物データが見つかりません。');
      router.back();
      return;
    }
    setForm({
      name: friend.name,
      nickname: friend.nickname,
      origin: friend.origin,
      residence: friend.residence,
      mbti: friend.mbti,
      birthday: friend.birthday,
      height: friend.height,
      weight: friend.weight,
      category: friend.category,
      description: friend.description,
      photoUri: friend.photoUri,
      affiliations: friend.affiliations.length > 0 ? friend.affiliations : [''],
      personalities: friend.personalities.length > 0 ? friend.personalities : [''],
      experiences: friend.experiences.length > 0 ? friend.experiences : [''],
      traits: friend.traits.length > 0 ? friend.traits : [''],
      likes: friend.likes.length > 0 ? friend.likes : [''],
      dislikes: friend.dislikes.length > 0 ? friend.dislikes : [''],
      episodes: friend.episodes,
      sayings: friend.sayings,
    });
  }, [friendId, router]);

  useFocusEffect(
    useCallback(() => {
      loadFriend();
    }, [loadFriend])
  );

  const onPickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setForm((prev) => ({ ...prev, photoUri: result.assets[0].uri }));
    }
  };

  const handleDeletePhoto = () => {
    if (!form.photoUri) return;
    Alert.alert('確認', '写真を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          setForm((prev) => ({ ...prev, photoUri: null }));
        },
      },
    ]);
  };

  const updateText = (key: keyof FriendInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateNumber = (key: 'height' | 'weight', value: string) => {
    const normalized = value.replace(/[^0-9.]/g, '');
    if (normalized === '') {
      setForm((prev) => ({ ...prev, [key]: null }));
      return;
    }
    const parsed = Number(normalized);
    setForm((prev) => ({ ...prev, [key]: Number.isNaN(parsed) ? null : parsed }));
  };

  const trimmedName = form.name.trim();
  const nameIsValid = trimmedName.length > 0;
  const showNameError = nameSaveAttempted && !nameIsValid;

  const handleSave = () => {
    if (!nameIsValid) {
      setNameSaveAttempted(true);
      return;
    }

    const payload: FriendInput = {
      ...form,
      name: trimmedName,
      nickname: form.nickname.trim(),
      origin: form.origin.trim(),
      residence: form.residence.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      birthday: form.birthday.trim(),
      mbti: form.mbti,
      affiliations: cleanArray(form.affiliations),
      personalities: cleanArray(form.personalities),
      experiences: cleanArray(form.experiences),
      traits: cleanArray(form.traits),
      likes: cleanArray(form.likes),
      dislikes: cleanArray(form.dislikes),
    };

    if (isEditMode) {
      const existing = getFriendById(friendId);
      if (!existing) {
        Alert.alert('保存エラー', '更新対象の人物データが見つかりません。');
        return;
      }
      const success = updateFriend(friendId, {
        ...payload,
        episodes: existing.episodes,
        sayings: existing.sayings,
      });
      if (!success) {
        Alert.alert('保存エラー', '更新に失敗しました。');
        return;
      }
      Alert.alert('保存完了', '人物データを更新しました。', [
        { text: 'OK', onPress: () => router.replace({ pathname: '/detail', params: { id: friendId } }) },
      ]);
      return;
    }

    const created = createFriend(payload);
    Alert.alert('保存完了', '人物データを登録しました。', [
      { text: 'OK', onPress: () => router.replace({ pathname: '/detail', params: { id: created.id } }) },
    ]);
  };

  const handleResyncAffiliationEpisodes = () => {
    if (!isEditMode) {
      return;
    }
    Alert.alert('確認', '所属グループのエピソードをこの人物に同期しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '同期する',
        onPress: () => {
          resyncEpisodesForFriendAffiliationChange(friendId);
          Alert.alert('完了', '同期が完了しました');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topActions}>
        <Pressable style={styles.saveButtonFloating} onPress={handleSave}>
          <Text style={styles.saveButtonText}>保存</Text>
        </Pressable>
        {isEditMode && (
          <Pressable style={styles.syncButton} onPress={handleResyncAffiliationEpisodes}>
            <Text style={styles.syncButtonText}>所属グループのエピソードを同期</Text>
          </Pressable>
        )}
        <Pressable style={styles.homeButton} onPress={() => router.replace('/')}>
          <Text style={styles.homeButtonText}>Home</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={20}
      >
        <View style={styles.topBar}>
          <Text style={styles.screenTitle}>{isEditMode ? '人物編集' : '新規登録'}</Text>
        </View>

        <View style={styles.profileBlock}>
          <View>
            <Pressable onPress={onPickImage} style={styles.photoBox}>
              {form.photoUri ? (
                <Image source={{ uri: form.photoUri }} style={styles.photoImage} />
              ) : (
                <Text style={styles.photoPlaceholder}>No Image</Text>
              )}
            </Pressable>
            {form.photoUri ? (
              <Pressable style={styles.photoDeleteButton} onPress={handleDeletePhoto}>
                <Text style={styles.photoDeleteButtonText}>写真を削除</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.profileFields}>
            <View style={styles.nameFieldBlock}>
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>名前</Text>
                <TextInput
                  value={form.name}
                  onChangeText={(text) => updateText('name', text)}
                  style={[styles.input, showNameError && styles.inputNameError]}
                  placeholder="苗字 名前"
                  placeholderTextColor={Theme.inputPlaceholder}
                />
              </View>
              {showNameError ? <Text style={styles.nameErrorText}>名前は必須項目です</Text> : null}
            </View>
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>通称</Text>
              <TextInput value={form.nickname} onChangeText={(text) => updateText('nickname', text)} style={styles.input} placeholder="記入式" />
            </View>
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>出身</Text>
              <TextInput value={form.origin} onChangeText={(text) => updateText('origin', text)} style={styles.input} placeholder="記入式" />
            </View>
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>居住地</Text>
              <TextInput value={form.residence} onChangeText={(text) => updateText('residence', text)} style={styles.input} placeholder="記入式" />
            </View>
            <SelectField label="MBTI" value={form.mbti} options={mbtiOptions} onChange={(value) => updateText('mbti', value)} />
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>誕生日</Text>
              <Pressable style={styles.dateButton} onPress={() => setShowBirthdayPicker(true)}>
                <Text style={form.birthday ? styles.dateButtonText : styles.dateButtonPlaceholder}>
                  {form.birthday || 'YYYY-MM-DD'}
                </Text>
              </Pressable>
            </View>
            {showBirthdayPicker && (
              <View style={styles.datePickerWrap}>
                <DateTimePicker
                  value={form.birthday ? parseDateString(form.birthday) : new Date()}
                  mode="date"
                  display="spinner"
                  locale="ja-JP"
                  style={styles.datePickerSelf}
                  onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== 'ios') setShowBirthdayPicker(false);
                    if (selected) updateText('birthday', formatDateToYMD(selected));
                  }}
                />
                <Pressable style={styles.datePickerDone} onPress={() => setShowBirthdayPicker(false)}>
                  <Text style={styles.datePickerDoneText}>完了</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>身長</Text>
              <TextInput
                value={form.height === null ? '' : String(form.height)}
                onChangeText={(text) => updateNumber('height', text)}
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="数字のみ"
              />
            </View>
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>体重</Text>
              <TextInput
                value={form.weight === null ? '' : String(form.weight)}
                onChangeText={(text) => updateNumber('weight', text)}
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="数字のみ"
              />
            </View>
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>分類</Text>
              <TextInput value={form.category} onChangeText={(text) => updateText('category', text)} style={styles.input} placeholder="記入式" />
            </View>
          </View>
        </View>

        <View style={styles.descriptionBlock}>
          <Text style={styles.descriptionLabel}>説明</Text>
          <TextInput
            value={form.description}
            onChangeText={(text) => updateText('description', text)}
            style={styles.descriptionInput}
            placeholder="複数行で入力"
            multiline
            textAlignVertical="top"
          />
        </View>

        <DynamicInputList
          title="所属"
          values={form.affiliations}
          onChange={(values) => setForm((prev) => ({ ...prev, affiliations: values }))}
          placeholder="記入式"
        />
        <DynamicInputList
          title="性格"
          values={form.personalities}
          onChange={(values) => setForm((prev) => ({ ...prev, personalities: values }))}
          placeholder="記入式"
        />
        <DynamicInputList
          title="経験"
          values={form.experiences}
          onChange={(values) => setForm((prev) => ({ ...prev, experiences: values }))}
          placeholder="記入式"
        />
        <DynamicInputList
          title="好きなこと"
          values={form.likes}
          onChange={(values) => setForm((prev) => ({ ...prev, likes: values }))}
          placeholder="記入式"
        />
        <DynamicInputList
          title="苦手なこと"
          values={form.dislikes}
          onChange={(values) => setForm((prev) => ({ ...prev, dislikes: values }))}
          placeholder="記入式"
        />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2f5f8',
  },
  container: {
    paddingHorizontal: 12,
    paddingTop: 52,
    paddingBottom: 24,
    gap: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  saveButtonFloating: {
    backgroundColor: Theme.btnPrimaryBg,
    borderColor: Theme.btnPrimaryBg,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  saveButtonText: {
    color: Theme.btnPrimaryText,
    fontWeight: '700',
    fontSize: 15,
  },
  syncButton: {
    backgroundColor: '#e0e7ff',
    borderColor: '#6366f1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  syncButtonText: {
    color: '#312e81',
    fontWeight: '700',
    fontSize: 12,
  },
  topActions: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  homeButton: {
    backgroundColor: '#e2e8f0',
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  homeButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 15,
  },
  profileBlock: {
    backgroundColor: Theme.bgSurface,
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    flexDirection: 'row',
    gap: 10,
  },
  photoBox: {
    width: 118,
    height: 150,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderColor: '#94a3b8',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  photoPlaceholder: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoDeleteButton: {
    marginTop: 8,
    alignSelf: 'center',
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoDeleteButtonText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '700',
  },
  profileFields: {
    flex: 1,
    gap: 6,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameFieldBlock: {
    gap: 4,
  },
  nameErrorText: {
    marginLeft: 60,
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
  inputNameError: {
    borderColor: '#dc2626',
    borderWidth: 2,
  },
  formLabel: {
    width: 52,
    fontSize: Typography.base,
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    flex: 1,
    backgroundColor: Theme.inputBg,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    fontSize: Typography.base,
    color: Theme.inputText,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dateButton: {
    flex: 1,
    backgroundColor: Theme.inputBg,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
  },
  dateButtonText: {
    fontSize: Typography.base,
    color: '#111827',
  },
  dateButtonPlaceholder: {
    fontSize: Typography.base,
    color: '#94a3b8',
  },
  datePickerWrap: {
    marginBottom: 8,
  },
  datePickerSelf: {
    alignSelf: 'flex-end',
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
    marginTop: 4,
  },
  datePickerDoneText: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: Typography.base,
  },
  selectButton: {
    flex: 1,
    backgroundColor: Theme.inputBg,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectValue: {
    color: '#0f172a',
    fontSize: Typography.base,
  },
  selectIcon: {
    color: '#475569',
    fontSize: 10,
  },
  descriptionBlock: {
    backgroundColor: Theme.bgSurface,
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
  },
  descriptionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  descriptionInput: {
    minHeight: 80,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: Theme.inputBg,
    color: Theme.inputText,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    lineHeight: 20,
  },
  multiSection: {
    backgroundColor: Theme.bgSurface,
    borderColor: '#94a3b8',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    gap: 8,
  },
  multiSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  multiSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  circleButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e0f2fe',
    borderColor: '#0891b2',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleButtonText: {
    color: '#0c4a6e',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  multiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  multiInput: {
    flex: 1,
    backgroundColor: Theme.inputBg,
    borderColor: Theme.inputBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    color: Theme.inputText,
    fontSize: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  removeButton: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  removeButtonText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '600',
  },
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
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  modalOptions: {
    marginBottom: 10,
  },
  modalOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  modalOptionSelected: {
    backgroundColor: '#e0f2fe',
  },
  modalOptionText: {
    fontSize: 14,
    color: '#1e293b',
  },
  modalClose: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: '#e2e8f0',
  },
  modalCloseText: {
    color: '#0f172a',
    fontWeight: '600',
  },
});

