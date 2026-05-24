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

const formatBirthdayForCard = (birthday: string): string => {
  if (!birthday.trim()) return '-';
  const parts = birthday.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '-';
  const [, month, day] = parts;
  return `${month}月${day}日`;
};

const CARD_GAP = 10;
/** 検索エリアの marginHorizontal とカード一覧の左右を揃える */
const LIST_HORIZONTAL_INSET = 12;
/** 人物カードの borderWidth */
const CARD_BORDER_WIDTH = 2;

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
        <View style={styles.topNavRow}>
          <View style={styles.profileNavPill}>
            <Text style={styles.profileNavText}>Profile一覧</Text>
          </View>
          <View style={styles.topNavSecondary}>
            <Pressable
              style={({ pressed }) => [styles.secondaryNavPill, pressed ? styles.secondaryNavPillPressed : null]}
              onPress={() => router.push('/episode')}
            >
              <Text style={styles.secondaryNavText} numberOfLines={2}>
                エピソード
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryNavPill, pressed ? styles.secondaryNavPillPressed : null]}
              onPress={() => router.push('/commonitems')}
            >
              <Text style={styles.secondaryNavText} numberOfLines={2}>
                共通項目
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryNavPill, pressed ? styles.secondaryNavPillPressed : null]}
              onPress={() => router.push('/friends')}
            >
              <Text style={styles.secondaryNavText} numberOfLines={2}>
                友達
              </Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.searchArea}>
              <View style={styles.row}>
                <View style={styles.fieldContainer}>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="名前"
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
              <Pressable
                style={[styles.card, { width: cardWidth }, isMyself && styles.cardMyself]}
                onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
                onLongPress={() => handleLongPressDeleteProfile(item)}
                delayLongPress={400}
              >
                {isMyself ? (
                  <View style={styles.myselfBadge} pointerEvents="none">
                    <Text style={styles.myselfBadgeText}>本人</Text>
                  </View>
                ) : null}
                <View style={[styles.photoWrapper, isMyself && styles.photoWrapperMyself]}>
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
                <View style={styles.cardTextBlock}>
                  <Text style={styles.cardMainName}>{item.name}</Text>
                  <Text style={styles.cardSubText}>
                    {birthMonth ? formatBirthdayForCard(item.birthday) : item.nickname || '-'}
                  </Text>
                </View>
              </Pressable>
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
    backgroundColor: '#f2f5f8',
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginHorizontal: LIST_HORIZONTAL_INSET,
    marginBottom: 8,
  },
  profileNavPill: {
    flexShrink: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#aaa',
    backgroundColor: '#3d3d3d',
    paddingHorizontal: 10,
    paddingVertical: 9.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileNavText: {
    fontSize: 14.4,
    fontWeight: '700',
    color: '#fff',
  },
  topNavSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  secondaryNavPill: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#aaa',
    backgroundColor: '#e5e5e5',
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryNavPillPressed: {
    opacity: 0.85,
  },
  secondaryNavText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#555',
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 100,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
  },
  searchArea: {
    backgroundColor: '#dfe9ef',
    borderColor: '#7e8b94',
    borderWidth: 1,
    borderRadius: 12,
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
    backgroundColor: '#fff',
    borderColor: '#8aa0ad',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  selectButton: {
    backgroundColor: '#fff',
    borderColor: '#8aa0ad',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 38,
  },
  selectValue: {
    fontSize: 13,
    color: '#111827',
    flex: 1,
  },
  selectPlaceholder: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  selectChevron: {
    fontSize: 10,
    color: '#475569',
    marginLeft: 6,
  },
  column: {
    justifyContent: 'flex-start',
    marginBottom: CARD_GAP,
    gap: CARD_GAP,
  },
  card: {
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: '#aaa',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'visible',
    padding: 0,
  },
  cardMyself: {
    borderColor: '#0d9488',
    backgroundColor: '#f0fdfa',
  },
  myselfBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 3,
    backgroundColor: '#0d9488',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0f766e',
  },
  myselfBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  photoWrapper: {
    marginTop: -2,
    marginLeft: -2,
    marginRight: -2,
    borderWidth: 2,
    borderColor: '#aaa',
    borderRadius: 10,
    overflow: 'hidden',
  },
  photoWrapperMyself: {
    borderColor: '#0d9488',
  },
  cardTextBlock: {
    padding: 8,
  },
  cardPhoto: {
    width: '100%',
    aspectRatio: 1,
  },
  cardPhotoPlaceholder: {
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhotoPlaceholderText: {
    fontSize: 12,
    color: '#64748b',
  },
  cardMainName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  cardSubText: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 0,
  },
  emptyText: {
    textAlign: 'center',
    color: '#475569',
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
    color: '#082f49',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
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
    borderRadius: 8,
  },
  modalOptionSelected: {
    backgroundColor: '#e0f2fe',
  },
  modalOptionText: {
    fontSize: 14,
    color: '#1e293b',
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  modalCloseButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
});

