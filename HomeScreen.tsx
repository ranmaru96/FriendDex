import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  useWindowDimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BorderWidth, Radius, Spacing, Theme, Typography } from '@/constants/theme';

import {
  deleteProfileById,
  getDefaultProfile,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMyself,
  initializeDatabase,
  searchFriends,
} from './db';
import { Friend, FriendSearchFilters, MBTI_TYPES, MBTIType } from './types';

type Option = {
  label: string;
  value: string;
};

type SelectFieldProps = {
  label: string;
  value: string;
  options: Option[];
  onValueChange: (value: string) => void;
};

const birthMonthOptions: Option[] = Array.from({ length: 12 }, (_, index) => ({
  label: String(index + 1),
  value: String(index + 1),
}));

const toOptions = (values: string[]): Option[] => values.map((value) => ({ label: value, value }));

const CARD_GAP = 10;
/** 検索エリアの marginHorizontal とカード一覧の左右を揃える */
const LIST_HORIZONTAL_INSET = 12;
/** 人物カードの borderWidth（通常・本人とも 2px、本人は枠色のみ accent） */
const CARD_BORDER_WIDTH = BorderWidth.cardEmphasis;

function SelectField({ label, value, options, onValueChange }: SelectFieldProps) {
  const [visible, setVisible] = useState(false);

  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((item) => item.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={styles.fieldContainer}>
      <Pressable style={styles.selectButton} onPress={() => setVisible(true)}>
        <Text style={value ? styles.selectValue : styles.selectPlaceholder}>{displayLabel}</Text>
        <Text style={styles.selectChevron}>▼</Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={styles.modalOptions}>
              <Pressable
                style={[styles.modalOption, !value && styles.modalOptionSelected]}
                onPress={() => {
                  onValueChange('');
                  setVisible(false);
                }}
              >
                <Text style={styles.modalOptionText}>指定なし</Text>
              </Pressable>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.modalOption, option.value === value && styles.modalOptionSelected]}
                  onPress={() => {
                    onValueChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setVisible(false)}>
              <Text style={styles.modalCloseButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = useMemo(() => {
    const rowInnerWidth = screenWidth - LIST_HORIZONTAL_INSET * 2;
    return (rowInnerWidth - CARD_GAP * 2) / 3;
  }, [screenWidth]);

  const [name, setName] = useState('');
  const [affiliation1, setAffiliation1] = useState('');
  const [affiliation2, setAffiliation2] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [mbti, setMbti] = useState('');
  const [experience, setExperience] = useState('');

  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [imageErrorById, setImageErrorById] = useState<Record<string, boolean>>({});
  const [myselfId, setMyselfId] = useState<string | null>(null);

  const loadInitialData = useCallback(() => {
    initializeDatabase();
    setAffiliationOptions(toOptions(getDistinctAffiliations()));
    setExperienceOptions(toOptions(getDistinctExperiences()));
    setMyselfId(getMyself());
  }, []);

  const filters = useMemo((): FriendSearchFilters => {
    const next: FriendSearchFilters = {};
    if (name.trim()) next.name = name.trim();
    if (affiliation1) next.affiliation1 = affiliation1;
    if (affiliation2) next.affiliation2 = affiliation2;
    if (birthMonth) next.birthMonth = Number(birthMonth);
    if (mbti) next.mbti = mbti as MBTIType;
    if (experience) next.experience = experience;
    return next;
  }, [name, affiliation1, affiliation2, birthMonth, mbti, experience]);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    initializeDatabase();
    setFriends(searchFriends(filters));
  }, [filters]);

  useFocusEffect(
    useCallback(() => {
      loadInitialData();
      setImageErrorById({});
      setFriends(searchFriends(filtersRef.current));
    }, [loadInitialData])
  );

  const mbtiOptions = useMemo(() => toOptions(MBTI_TYPES as string[]), []);

  const handleLongPressDeleteProfile = useCallback((friend: Friend) => {
    const executeDelete = () => {
      initializeDatabase();
      const profile = getDefaultProfile(friend.id);
      if (!profile) {
        Alert.alert('エラー', 'プロフィールが見つかりませんでした。');
        return;
      }
      const ok = deleteProfileById(profile.id);
      if (!ok) {
        Alert.alert('エラー', '削除に失敗しました。');
        return;
      }
      setMyselfId(getMyself());
      setFriends(searchFriends(filtersRef.current));
    };

    Alert.alert('プロフィールを削除しますか？', 'この操作は元に戻せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '次へ',
        onPress: () => {
          Alert.alert(
            '本当に削除しますか？',
            `「${friend.name}」のデータが完全に削除されます。`,
            [
              { text: 'やっぱりやめる', style: 'cancel' },
              { text: '削除する', style: 'destructive', onPress: executeDelete },
            ]
          );
        },
      },
    ]);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 80 }]}
          ListHeaderComponent={
            <View style={styles.searchArea}>
              <View style={styles.row}>
                <View style={styles.fieldContainer}>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="名前"
                    placeholderTextColor={Theme.textSecondary}
                    style={styles.textInput}
                    autoCapitalize="none"
                  />
                </View>
                <SelectField
                  label="所属1"
                  value={affiliation1}
                  options={affiliationOptions}
                  onValueChange={setAffiliation1}
                />
                <SelectField
                  label="所属2"
                  value={affiliation2}
                  options={affiliationOptions}
                  onValueChange={setAffiliation2}
                />
              </View>

              <View style={styles.row}>
                <SelectField
                  label="経験"
                  value={experience}
                  options={experienceOptions}
                  onValueChange={setExperience}
                />
                <SelectField
                  label="MBTI"
                  value={mbti}
                  options={mbtiOptions}
                  onValueChange={setMbti}
                />
                <SelectField
                  label="誕生月"
                  value={birthMonth}
                  options={birthMonthOptions}
                  onValueChange={setBirthMonth}
                />
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isMyself = myselfId === item.id;
            return (
              <View style={[styles.cardShadow, { width: cardWidth }]}>
                <Pressable
                  style={[styles.cardOuter, isMyself && styles.cardOuterMyself]}
                  onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
                  onLongPress={() => handleLongPressDeleteProfile(item)}
                  delayLongPress={400}
                >
                  {isMyself ? (
                    <View style={styles.myselfBadge} pointerEvents="none">
                      <Text style={styles.myselfBadgeText}>本人</Text>
                    </View>
                  ) : null}
                  <View style={[styles.photoOuterFrame, isMyself && styles.photoOuterFrameMyself]}>
                    <View style={[styles.photoInnerFrame, isMyself && styles.photoInnerFrameMyself]}>
                      {item.photoUri && !imageErrorById[item.id] ? (
                        <Image
                          source={{ uri: item.photoUri }}
                          style={styles.cardPhoto}
                          resizeMode="cover"
                          onError={() =>
                            setImageErrorById((prev) => ({
                              ...prev,
                              [item.id]: true,
                            }))
                          }
                        />
                      ) : (
                        <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
                          <Text style={styles.cardPhotoPlaceholderText}>No Image</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.cardTextBlock}>
                    <Text style={styles.cardMainName}>{item.name}</Text>
                  </View>
                </Pressable>
              </View>
            );
          }}
          numColumns={3}
          columnWrapperStyle={styles.column}
          ListEmptyComponent={<Text style={styles.emptyText}>人物データがありません</Text>}
        />

        <Pressable style={styles.fab} onPress={() => router.push('/edit')}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a1e2e',
  },
  container: {
    flex: 1,
    backgroundColor: '#1a1e2e',
    paddingTop: 8,
  },
  listContent: {
    paddingBottom: 100,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
  },
  searchArea: {
    backgroundColor: '#252a3a',
    borderColor: '#3a4060',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  fieldContainer: {
    flex: 1,
  },
  textInput: {
    backgroundColor: Theme.card,
    borderColor: Theme.border,
    borderWidth: BorderWidth.input,
    borderRadius: Radius.md,
    color: Theme.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
  },
  selectButton: {
    backgroundColor: Theme.card,
    borderColor: Theme.border,
    borderWidth: BorderWidth.input,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 38,
  },
  selectValue: {
    fontSize: Typography.base,
    color: Theme.textPrimary,
    flex: 1,
  },
  selectPlaceholder: {
    fontSize: Typography.base,
    color: Theme.textSecondary,
    flex: 1,
  },
  selectChevron: {
    fontSize: 10,
    color: Theme.textSecondary,
    marginLeft: 6,
  },
  column: {
    justifyContent: 'flex-start',
    marginBottom: CARD_GAP,
    gap: CARD_GAP,
  },
  cardShadow: {
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 16,
  },
  cardOuter: {
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: '#c8d0e0',
    backgroundColor: '#1a1e2e',
    overflow: 'hidden',
    paddingBottom: 4,
  },
  cardOuterMyself: {
    borderColor: Theme.accent,
  },
  photoOuterFrame: {
    marginTop: -2,
    marginLeft: -2,
    marginRight: -2,
    borderWidth: 3,
    borderColor: '#c8d0e0',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  photoOuterFrameMyself: {
    borderColor: Theme.accent,
  },
  photoInnerFrame: {
    borderWidth: 2,
    borderColor: '#4a5a7a',
    borderRadius: Radius.md - 3,
    overflow: 'hidden',
  },
  photoInnerFrameMyself: {
    borderColor: Theme.accent,
  },
  myselfBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 3,
    backgroundColor: Theme.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.accent,
  },
  myselfBadgeText: {
    color: Theme.onAccent,
    fontSize: 11,
    fontWeight: '800',
  },
  cardTextBlock: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhoto: {
    width: '100%',
    aspectRatio: 1,
  },
  cardPhotoPlaceholder: {
    backgroundColor: '#2a3050',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhotoPlaceholderText: {
    fontSize: 12,
    color: '#6a7090',
  },
  cardMainName: {
    width: '100%',
    fontSize: 13,
    fontWeight: '800',
    color: '#e8eaf6',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  emptyText: {
    textAlign: 'center',
    color: Theme.textSecondary,
    marginTop: 20,
  },
  fab: {
    position: 'absolute',
    right: 14,
    bottom: 18,
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: '#67e8f9',
    borderColor: '#0891b2',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    fontSize: 34,
    lineHeight: 34,
    color: '#0f172a',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlay,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: Theme.card,
    borderRadius: Radius.md,
    padding: 14,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Theme.heading,
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
    backgroundColor: Theme.accentLight,
  },
  modalOptionText: {
    fontSize: 14,
    color: Theme.textPrimary,
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: Theme.borderSoft,
  },
  modalCloseButtonText: {
    color: Theme.heading,
    fontWeight: '600',
  },
});

