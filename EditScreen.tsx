import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Theme, Radius, Typography, Spacing } from '@/constants/theme';
import { FormRow } from '@/components/ui/FormRow';
import { FormScreenBody, FormScreenSection, FormScreenTemplate } from '@/components/screen-templates';
import { PhotoCropModal } from '@/components/photo/PhotoCropModal';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  contentDateTimePickerProps,
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';

import {
  createFriend,
  createFriendFromQrScan,
  getFriendById,
  initializeDatabase,
  resyncEpisodesForFriendAffiliationChange,
  updateFriend,
} from './db';
import { FriendInput, MBTIType, MBTI_TYPES } from './types';

const PHOTO_SIZE = 80;
const INPUT_H = 36;
const ICON_BTN = 36;

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

type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
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

function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color,
  backgroundColor,
  borderColor,
}: IconButtonProps) {
  const content = useContentColors();
  return (
    <Pressable
      style={[
        styles.iconButton,
        {
          backgroundColor: backgroundColor ?? content.contentInputBg,
          borderColor: borderColor ?? content.contentBorder,
        },
      ]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color={color ?? content.contentText} />
    </Pressable>
  );
}

function SelectField({ label, value, options, placeholder = '選択', onChange }: SelectFieldProps) {
  const content = useContentColors();
  const [visible, setVisible] = useState(false);
  const selectedLabel = useMemo(() => {
    const item = options.find((option) => option.value === value);
    return item?.label ?? placeholder;
  }, [options, placeholder, value]);

  return (
    <>
      <FormRow label={label}>
        <Pressable
          style={[styles.selectButton, contentInputStyle(content)]}
          onPress={() => setVisible(true)}
        >
          <Text style={[styles.selectValue, contentTextStyle(content)]} numberOfLines={1}>
            {selectedLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={content.contentTextSecondary} />
        </Pressable>
      </FormRow>

      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.modalTitle, contentTextStyle(content)]}>{label}</Text>
            <ScrollView style={styles.modalOptions}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.modalOption,
                    option.value === value ? contentSelectedOptionStyle(content) : null,
                  ]}
                  onPress={() => {
                    onChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, contentTextStyle(content)]}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.modalClose, contentTagStyle(content)]}
              onPress={() => setVisible(false)}
            >
              <Text style={[styles.modalCloseText, contentTextStyle(content)]}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function DynamicInputList({ title, values, onChange, placeholder }: DynamicInputListProps) {
  const content = useContentColors();
  const updateItem = (index: number, text: string) => {
    const next = [...values];
    next[index] = text;
    onChange(next);
  };

  const addItem = () => onChange([...values, '']);
  const removeItem = (index: number) => onChange(values.filter((_, itemIndex) => itemIndex !== index));

  return (
    <FormScreenSection>
      <View style={styles.multiSectionHeader}>
        <Text style={[styles.sectionCaption, contentMutedTextStyle(content)]}>{title}</Text>
        <Pressable
          style={[styles.addIconButton, contentTagStyle(content)]}
          onPress={addItem}
          accessibilityLabel={`${title}を追加`}
        >
          <Ionicons name="add" size={18} color={content.contentText} />
        </Pressable>
      </View>

      {values.map((value, index) => (
        <View key={`${title}-${index}`} style={styles.multiRow}>
          <TextInput
            value={value}
            onChangeText={(text) => updateItem(index, text)}
            placeholder={placeholder}
            placeholderTextColor={content.contentTextSecondary}
            style={[styles.multiInput, contentInputStyle(content)]}
          />
          {values.length > 1 && (
            <Pressable
              style={styles.removeIconButton}
              onPress={() => removeItem(index)}
              accessibilityLabel="削除"
            >
              <Ionicons name="close" size={16} color="#f87171" />
            </Pressable>
          )}
        </View>
      ))}
    </FormScreenSection>
  );
}

const getParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const parseOptionalNumber = (value: string): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export default function EditScreen() {
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const fieldIndent = kit.formLayout === 'horizontal' ? kit.formLabelWidth + kit.formRowGap : 0;
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    nickname?: string;
    birthday?: string;
    height?: string;
    weight?: string;
    origin?: string;
    residence?: string;
    mbti?: string;
    fromScan?: string;
    scannedUserId?: string;
    publicFields?: string;
  }>();

  const friendId = useMemo(() => {
    if (Array.isArray(params.id)) return params.id[0] ?? '';
    return params.id ?? '';
  }, [params.id]);

  const fromScan = getParam(params.fromScan) === 'true';
  const scannedUserId = getParam(params.scannedUserId);

  const isEditMode = !!friendId;
  const [form, setForm] = useState<FriendInput>(EMPTY_FORM);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [nameSaveAttempted, setNameSaveAttempted] = useState(false);
  const [cropSourceUri, setCropSourceUri] = useState<string | null>(null);
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
      if (fromScan) {
        setForm({
          ...EMPTY_FORM,
          name: getParam(params.name),
          nickname: getParam(params.nickname),
          birthday: getParam(params.birthday),
          height: parseOptionalNumber(getParam(params.height)),
          weight: parseOptionalNumber(getParam(params.weight)),
          origin: getParam(params.origin),
          residence: getParam(params.residence),
          mbti: getParam(params.mbti) as MBTIType,
        });
      } else {
        setForm(EMPTY_FORM);
      }
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
  }, [friendId, fromScan, params.birthday, params.height, params.mbti, params.name, params.nickname, params.origin, params.residence, params.weight, router]);

  useFocusEffect(
    useCallback(() => {
      loadFriend();
    }, [loadFriend])
  );

  const onPickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setCropSourceUri(result.assets[0].uri);
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

    const finishSave = (targetId: string, message = '人物データを登録しました。') => {
      Alert.alert('保存完了', message, [
        { text: 'OK', onPress: () => router.replace({ pathname: '/detail', params: { id: targetId } }) },
      ]);
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
      finishSave(friendId, '人物データを更新しました。');
      return;
    }

    if (fromScan) {
      const normalizedUserId = scannedUserId.trim();
      if (!normalizedUserId) {
        Alert.alert('保存エラー', 'QRコードのユーザー情報が不正です。');
        return;
      }
      const created = createFriendFromQrScan(payload, normalizedUserId);
      finishSave(created.id);
      return;
    }

    const created = createFriend(payload);
    finishSave(created.id);
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

  const topBarActions = (
    <View style={styles.topBarActions}>
      {isEditMode && (
        <IconButton
          icon="sync-outline"
          onPress={handleResyncAffiliationEpisodes}
          accessibilityLabel="所属グループのエピソードを同期"
          backgroundColor={content.contentInputBg}
          borderColor={content.contentText}
          color={content.contentText}
        />
      )}
      <IconButton
        icon="home-outline"
        onPress={() => router.replace('/')}
        accessibilityLabel="ホームへ戻る"
      />
      <Pressable style={styles.saveButton} onPress={handleSave} accessibilityLabel="保存">
        <Ionicons name="save-outline" size={18} color={Theme.btnPrimaryText} />
        <Text style={styles.saveButtonText}>保存</Text>
      </Pressable>
    </View>
  );

  return (
    <>
    <FormScreenTemplate
      title={isEditMode ? '人物編集' : '新規登録'}
      titleAlign="left"
      right={topBarActions}
    >
      <FormScreenBody>
        <FormScreenSection>
          <View style={styles.profileTopRow}>
            <View style={styles.photoColumn}>
              <Pressable
                onPress={onPickImage}
                style={[styles.photoBox, contentSurfaceStyle(content)]}
                accessibilityLabel="写真を選択"
              >
                {form.photoUri ? (
                  <Image source={{ uri: form.photoUri }} style={styles.photoImage} />
                ) : (
                  <Ionicons name="camera-outline" size={28} color={content.contentTextSecondary} />
                )}
              </Pressable>
              {form.photoUri ? (
                <Pressable
                  style={styles.photoDeleteIcon}
                  onPress={handleDeletePhoto}
                  accessibilityLabel="写真を削除"
                >
                  <Ionicons name="trash-outline" size={14} color="#f87171" />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.profileNameFields}>
              <View style={styles.nameFieldBlock}>
                <FormRow label="名前">
                  <TextInput
                    value={form.name}
                    onChangeText={(text) => updateText('name', text)}
                    style={[styles.input, contentInputStyle(content), showNameError && styles.inputNameError]}
                    placeholder="苗字 名前"
                    placeholderTextColor={content.contentTextSecondary}
                  />
                </FormRow>
                {showNameError ? (
                  <Text style={[styles.nameErrorText, { marginLeft: fieldIndent }]}>名前は必須項目です</Text>
                ) : null}
              </View>
              <FormRow label="通称">
                <TextInput
                  value={form.nickname}
                  onChangeText={(text) => updateText('nickname', text)}
                  style={[styles.input, contentInputStyle(content)]}
                  placeholder="記入式"
                  placeholderTextColor={content.contentTextSecondary}
                />
              </FormRow>
            </View>
          </View>

          <View style={styles.profileRestFields}>
            <FormRow label="出身">
              <TextInput
                value={form.origin}
                onChangeText={(text) => updateText('origin', text)}
                style={[styles.input, contentInputStyle(content)]}
                placeholder="記入式"
                placeholderTextColor={content.contentTextSecondary}
              />
            </FormRow>
            <FormRow label="居住地">
              <TextInput
                value={form.residence}
                onChangeText={(text) => updateText('residence', text)}
                style={[styles.input, contentInputStyle(content)]}
                placeholder="記入式"
                placeholderTextColor={content.contentTextSecondary}
              />
            </FormRow>
            <SelectField label="MBTI" value={form.mbti} options={mbtiOptions} onChange={(value) => updateText('mbti', value)} />
            <FormRow label="誕生日">
              <Pressable
                style={[styles.dateButton, contentInputStyle(content)]}
                onPress={() => setShowBirthdayPicker(true)}
              >
                <Text
                  style={
                    form.birthday
                      ? [styles.dateButtonText, contentTextStyle(content)]
                      : [styles.dateButtonPlaceholder, contentMutedTextStyle(content)]
                  }
                >
                  {form.birthday || 'YYYY-MM-DD'}
                </Text>
              </Pressable>
            </FormRow>
            {showBirthdayPicker ? (
              <View style={[styles.datePickerWrap, { marginLeft: fieldIndent }]}>
                <DateTimePicker
                  value={form.birthday ? parseDateString(form.birthday) : new Date()}
                  mode="date"
                  display="spinner"
                  locale="ja-JP"
                  style={styles.datePickerSelf}
                  {...dateTimePickerProps}
                  onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                    if (Platform.OS !== 'ios') setShowBirthdayPicker(false);
                    if (selected) updateText('birthday', formatDateToYMD(selected));
                  }}
                />
                <Pressable
                  style={[styles.datePickerDone, contentTagStyle(content)]}
                  onPress={() => setShowBirthdayPicker(false)}
                >
                  <Text style={[styles.datePickerDoneText, contentTextStyle(content)]}>完了</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.twinRow}>
              <FormRow label="身長" style={styles.twinField}>
                <TextInput
                  value={form.height === null ? '' : String(form.height)}
                  onChangeText={(text) => updateNumber('height', text)}
                  style={[styles.input, contentInputStyle(content)]}
                  keyboardType="decimal-pad"
                  placeholder="cm"
                  placeholderTextColor={content.contentTextSecondary}
                />
              </FormRow>
              <FormRow label="体重" style={styles.twinField}>
                <TextInput
                  value={form.weight === null ? '' : String(form.weight)}
                  onChangeText={(text) => updateNumber('weight', text)}
                  style={[styles.input, contentInputStyle(content)]}
                  keyboardType="decimal-pad"
                  placeholder="kg"
                  placeholderTextColor={content.contentTextSecondary}
                />
              </FormRow>
            </View>
            <FormRow label="分類">
              <TextInput
                value={form.category}
                onChangeText={(text) => updateText('category', text)}
                style={[styles.input, contentInputStyle(content)]}
                placeholder="記入式"
                placeholderTextColor={content.contentTextSecondary}
              />
            </FormRow>
          </View>
        </FormScreenSection>

        <FormScreenSection>
          <Text style={[styles.sectionCaption, contentMutedTextStyle(content)]}>説明</Text>
          <TextInput
            value={form.description}
            onChangeText={(text) => updateText('description', text)}
            style={[styles.descriptionInput, contentInputStyle(content)]}
            placeholder="複数行で入力"
            placeholderTextColor={content.contentTextSecondary}
            multiline
            textAlignVertical="top"
          />
        </FormScreenSection>

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
      </FormScreenBody>
    </FormScreenTemplate>

    <PhotoCropModal
      visible={cropSourceUri != null}
      uri={cropSourceUri}
      aspectRatio={1}
      onCancel={() => setCropSourceUri(null)}
      onConfirm={(croppedUri) => {
        setForm((prev) => ({ ...prev, photoUri: croppedUri }));
        setCropSourceUri(null);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    width: ICON_BTN,
    height: ICON_BTN,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: ICON_BTN,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Theme.btnPrimaryBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.btnPrimaryBg,
  },
  saveButtonText: {
    color: Theme.btnPrimaryText,
    fontWeight: '700',
    fontSize: 13,
  },
  profileTopRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  photoColumn: {
    alignItems: 'center',
    gap: 4,
  },
  photoBox: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 10,
    backgroundColor: Theme.background,
    borderColor: Theme.border,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
  },
  photoDeleteIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(248, 113, 113, 0.18)',
    borderColor: 'rgba(248, 113, 113, 0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileNameFields: {
    flex: 1,
    gap: 6,
  },
  profileRestFields: {
    gap: 6,
    marginTop: 2,
  },
  twinRow: {
    flexDirection: 'row',
    gap: 8,
  },
  twinField: {
    flex: 1,
  },
  nameFieldBlock: {
    gap: 2,
  },
  nameErrorText: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '600',
  },
  inputNameError: {
    borderColor: '#dc2626',
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    height: INPUT_H,
    backgroundColor: Theme.inputBg,
    borderColor: Theme.inputBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    fontSize: Typography.sm,
    color: Theme.inputText,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 0,
  },
  dateButton: {
    flex: 1,
    height: INPUT_H,
    backgroundColor: Theme.inputBg,
    borderColor: Theme.inputBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  dateButtonText: {
    fontSize: Typography.sm,
    color: Theme.inputText,
  },
  dateButtonPlaceholder: {
    fontSize: Typography.sm,
    color: Theme.inputPlaceholder,
  },
  datePickerWrap: {},
  datePickerSelf: {
    alignSelf: 'flex-start',
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Theme.background,
    marginTop: 4,
  },
  datePickerDoneText: {
    color: Theme.textPrimary,
    fontWeight: '600',
    fontSize: Typography.sm,
  },
  selectButton: {
    flex: 1,
    height: INPUT_H,
    backgroundColor: Theme.inputBg,
    borderColor: Theme.inputBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  selectValue: {
    flex: 1,
    color: Theme.inputText,
    fontSize: Typography.sm,
  },
  sectionCaption: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.textMuted,
    marginBottom: 2,
  },
  descriptionInput: {
    minHeight: 72,
    borderColor: Theme.inputBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    backgroundColor: Theme.inputBg,
    color: Theme.inputText,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sm,
    lineHeight: 18,
  },
  multiSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  multiInput: {
    flex: 1,
    height: INPUT_H,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    fontSize: Typography.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 0,
  },
  removeIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(248, 113, 113, 0.18)',
    borderColor: 'rgba(248, 113, 113, 0.45)',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlay,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalCard: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    maxHeight: '70%',
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: Typography.base,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  modalOptions: {
    marginBottom: Spacing.sm,
  },
  modalOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
  modalOptionText: {
    fontSize: Typography.sm,
  },
  modalClose: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalCloseText: {
    fontWeight: '600',
    fontSize: Typography.sm,
  },
});
