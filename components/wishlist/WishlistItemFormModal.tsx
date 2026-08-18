import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DesignPatternColors, DesignPatternShape } from '@/constants/designPatterns';
import type { WishlistItem, WishlistKind } from '@/types';
import type { WishlistOption } from '@/utils/wishlistHelpers';
import { uniqueWishlistLabels } from '@/utils/wishlistHelpers';

type WishlistItemFormModalProps = {
  visible: boolean;
  kind: WishlistKind;
  item: WishlistItem | null;
  purposeOptions: WishlistOption[];
  locationOptions: WishlistOption[];
  cuisineOptions: WishlistOption[];
  colors: DesignPatternColors;
  shape: DesignPatternShape;
  onClose: () => void;
  onSave: (draft: {
    name: string;
    purposeTags: string[];
    location: string;
    cuisine: string;
    memo: string;
    link: string;
  }) => void;
};

function ChoiceChip({
  label,
  selected,
  colors,
  radius,
  onPress,
}: {
  label: string;
  selected: boolean;
  colors: DesignPatternColors;
  radius: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.chipOn : colors.chipBg,
          borderColor: selected ? colors.chipOn : colors.headerBorder,
          borderRadius: radius,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.chipOnInk : colors.cardMuted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function WishlistItemFormModal({
  visible,
  kind,
  item,
  purposeOptions,
  locationOptions,
  cuisineOptions,
  colors,
  shape,
  onClose,
  onSave,
}: WishlistItemFormModalProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [purposeTags, setPurposeTags] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [memo, setMemo] = useState('');
  const [link, setLink] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [customCuisine, setCustomCuisine] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }
    setName(item?.name ?? '');
    setPurposeTags(item?.purposeTags ?? []);
    setLocation(item?.location ?? '');
    setCuisine(item?.cuisine ?? '');
    setMemo(item?.memo ?? '');
    setLink(item?.link ?? '');
    setCustomTag('');
    setCustomLocation('');
    setCustomCuisine('');
    setError('');
  }, [item, visible]);

  const nameLabel = kind === 'visit' ? '場所の名前' : '店の名前';
  const kicker = item ? 'EDIT PIN' : 'NEW PIN';
  const title = item
    ? kind === 'visit'
      ? '行きたい場所を編集'
      : '食べたい店を編集'
    : kind === 'visit'
      ? '行きたい場所'
      : '食べたい店';

  const purposeChoices = useMemo(() => {
    return uniqueWishlistLabels([...purposeOptions.map((option) => option.value), ...purposeTags]);
  }, [purposeOptions, purposeTags]);

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(`${nameLabel}を入力してください。`);
      return;
    }
    onSave({
      name: trimmedName,
      purposeTags: uniqueWishlistLabels(purposeTags),
      location: location.trim(),
      cuisine: cuisine.trim(),
      memo: memo.trim(),
      link: link.trim(),
    });
  };

  const addCustom = (
    value: string,
    setter: (next: string) => void,
    apply: (next: string) => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    apply(trimmed);
    setter('');
  };

  const inputBorder = {
    borderColor: colors.headerBorder,
    borderRadius: shape.innerRadius,
    color: colors.cardInk,
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.cyan,
              borderRadius: shape.cardBorderRadius,
              borderWidth: shape.cardBorderWidth,
              paddingBottom: Math.max(16, insets.bottom),
            },
          ]}
        >
          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            extraScrollHeight={48}
          >
            <Text style={[styles.kicker, { color: colors.cyan, letterSpacing: Math.max(1.2, shape.kickerLetterSpacing) }]}>
              {kicker}
            </Text>
            <Text style={[styles.title, { color: colors.cardInk }]}>{title}</Text>

            <TextInput
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError('');
              }}
              placeholder={kind === 'visit' ? '金沢、直島、下北沢…' : '店の名前'}
              placeholderTextColor={colors.cardMuted}
              style={[styles.nameInput, inputBorder]}
              autoFocus={!item}
            />

            {kind === 'visit' ? (
              <View style={styles.block}>
                <Text style={[styles.blockLabel, { color: colors.gold }]}>目的</Text>
                <View style={styles.chipWrap}>
                  {purposeChoices.map((tag) => {
                    const selected = purposeTags.includes(tag);
                    return (
                      <ChoiceChip
                        key={tag}
                        label={tag}
                        selected={selected}
                        colors={colors}
                        radius={Math.max(2, shape.innerRadius / 2)}
                        onPress={() =>
                          setPurposeTags((current) =>
                            selected
                              ? current.filter((value) => value !== tag)
                              : uniqueWishlistLabels([...current, tag])
                          )
                        }
                      />
                    );
                  })}
                </View>
                <View style={styles.customRow}>
                  <TextInput
                    value={customTag}
                    onChangeText={setCustomTag}
                    placeholder="目的を追加"
                    placeholderTextColor={colors.cardMuted}
                    style={[styles.customInput, inputBorder]}
                    onSubmitEditing={() =>
                      addCustom(customTag, setCustomTag, (next) =>
                        setPurposeTags((current) => uniqueWishlistLabels([...current, next]))
                      )
                    }
                  />
                  <Pressable
                    onPress={() =>
                      addCustom(customTag, setCustomTag, (next) =>
                        setPurposeTags((current) => uniqueWishlistLabels([...current, next]))
                      )
                    }
                    style={[styles.customAdd, { backgroundColor: colors.addBtn, borderRadius: shape.innerRadius }]}
                  >
                    <Text style={[styles.customAddText, { color: colors.addBtnInk }]}>追加</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.block}>
                  <Text style={[styles.blockLabel, { color: colors.gold }]}>場所</Text>
                  <View style={styles.chipWrap}>
                    {locationOptions.map((option) => (
                      <ChoiceChip
                        key={option.value}
                        label={option.label}
                        selected={location === option.value}
                        colors={colors}
                        radius={Math.max(2, shape.innerRadius / 2)}
                        onPress={() => setLocation(location === option.value ? '' : option.value)}
                      />
                    ))}
                  </View>
                  <View style={styles.customRow}>
                    <TextInput
                      value={customLocation}
                      onChangeText={setCustomLocation}
                      placeholder="新しい場所"
                      placeholderTextColor={colors.cardMuted}
                      style={[styles.customInput, inputBorder]}
                      onSubmitEditing={() =>
                        addCustom(customLocation, setCustomLocation, setLocation)
                      }
                    />
                    <Pressable
                      onPress={() => addCustom(customLocation, setCustomLocation, setLocation)}
                      style={[styles.customAdd, { backgroundColor: colors.addBtn, borderRadius: shape.innerRadius }]}
                    >
                      <Text style={[styles.customAddText, { color: colors.addBtnInk }]}>使う</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.block}>
                  <Text style={[styles.blockLabel, { color: colors.gold }]}>料理</Text>
                  <View style={styles.chipWrap}>
                    {cuisineOptions.map((option) => (
                      <ChoiceChip
                        key={option.value}
                        label={option.label}
                        selected={cuisine === option.value}
                        colors={colors}
                        radius={Math.max(2, shape.innerRadius / 2)}
                        onPress={() => setCuisine(cuisine === option.value ? '' : option.value)}
                      />
                    ))}
                  </View>
                  <View style={styles.customRow}>
                    <TextInput
                      value={customCuisine}
                      onChangeText={setCustomCuisine}
                      placeholder="新しい種類"
                      placeholderTextColor={colors.cardMuted}
                      style={[styles.customInput, inputBorder]}
                      onSubmitEditing={() =>
                        addCustom(customCuisine, setCustomCuisine, setCuisine)
                      }
                    />
                    <Pressable
                      onPress={() => addCustom(customCuisine, setCustomCuisine, setCuisine)}
                      style={[styles.customAdd, { backgroundColor: colors.addBtn, borderRadius: shape.innerRadius }]}
                    >
                      <Text style={[styles.customAddText, { color: colors.addBtnInk }]}>使う</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            )}

            <View style={styles.block}>
              <Text style={[styles.blockLabel, { color: colors.gold }]}>メモ</Text>
              <TextInput
                value={memo}
                onChangeText={setMemo}
                placeholder="いつ行くか、誰と、何が気になるか"
                placeholderTextColor={colors.cardMuted}
                multiline
                textAlignVertical="top"
                style={[
                  styles.memoWell,
                  inputBorder,
                  { backgroundColor: colors.logBg },
                ]}
              />
            </View>

            <View style={styles.block}>
              <Text style={[styles.blockLabel, { color: colors.gold }]}>リンク</Text>
              <TextInput
                value={link}
                onChangeText={setLink}
                placeholder="地図や記事のURL"
                placeholderTextColor={colors.cardMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[styles.linkInput, inputBorder]}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </KeyboardAwareScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.cardMuted }]}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.addBtn, borderRadius: shape.innerRadius }]}
              onPress={submit}
            >
              <Text style={[styles.saveText, { color: colors.addBtnInk }]}>
                {item ? '保存' : '記録する'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,10,20,0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '88%',
    marginHorizontal: 12,
    marginBottom: 12,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 8,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  nameInput: {
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 22,
    fontWeight: '800',
  },
  block: {
    gap: 8,
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customInput: {
    flex: 1,
    borderWidth: 1.5,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '600',
  },
  customAdd: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customAddText: {
    fontSize: 13,
    fontWeight: '800',
  },
  memoWell: {
    minHeight: 140,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  },
  linkInput: {
    borderWidth: 1.5,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#e11d48',
    fontSize: 13,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
