import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  useWindowDimensions,
  FlatList,
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
import { Radius, ScreenHorizontalInset, Theme } from '@/constants/theme';
import { FRIEND_HOME_CARD_GAP, FriendHomeCard } from '@/components/friend/FriendHomeCard';
import { searchAreaStyles } from '@/utils/searchAreaStyles';
import { AddCircleButton } from '@/components/AddCircleButton';
import { PendingEpisodeReviewModal } from '@/components/episode/PendingEpisodeReviewModal';

import {
  deleteProfileById,
  getDefaultProfile,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMyself,
  getPendingReviewEpisodes,
  initializeDatabase,
  searchFriends,
} from './db';
import { usePersistedFilter, FILTER_KEYS } from '@/hooks/usePersistedFilter';
import {
  DEFAULT_HOME_FILTER,
  homeFilterToSearchFilters,
  isHomeFilterState,
} from '@/utils/persistedFilterTypes';
import { Friend, MBTI_TYPES, PendingReviewEpisodeRef } from './types';

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

const CARD_GAP = FRIEND_HOME_CARD_GAP;

function SelectField({ label, value, options, onValueChange }: SelectFieldProps) {
  const [visible, setVisible] = useState(false);

  const displayLabel = useMemo(() => {
    if (!value) return label;
    return options.find((item) => item.value === value)?.label ?? label;
  }, [label, options, value]);

  return (
    <View style={searchAreaStyles.fieldContainer}>
      <Pressable style={searchAreaStyles.selectButton} onPress={() => setVisible(true)}>
        <Text style={value ? searchAreaStyles.selectValue : searchAreaStyles.selectPlaceholder}>{displayLabel}</Text>
        <Text style={searchAreaStyles.selectChevron}>▼</Text>
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
    const rowInnerWidth = screenWidth - ScreenHorizontalInset * 2;
    return (rowInnerWidth - CARD_GAP * 2) / 3;
  }, [screenWidth]);

  const [homeFilter, setHomeFilter] = usePersistedFilter(FILTER_KEYS.home, DEFAULT_HOME_FILTER, {
    validate: isHomeFilterState,
  });

  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [pendingReviewItems, setPendingReviewItems] = useState<PendingReviewEpisodeRef[]>([]);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);

  const reloadPendingReviews = useCallback(() => {
    const pending = getPendingReviewEpisodes();
    setPendingReviewItems(pending);
    setReviewModalVisible(pending.length > 0);
  }, []);

  const loadInitialData = useCallback(() => {
    initializeDatabase();
    setAffiliationOptions(toOptions(getDistinctAffiliations()));
    setExperienceOptions(toOptions(getDistinctExperiences()));
    setMyselfId(getMyself());
    reloadPendingReviews();
  }, [reloadPendingReviews]);

  const filters = useMemo(() => homeFilterToSearchFilters(homeFilter), [homeFilter]);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    initializeDatabase();
    setFriends(searchFriends(filters));
  }, [filters]);

  useFocusEffect(
    useCallback(() => {
      loadInitialData();
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
            <>
              <View style={searchAreaStyles.area}>
              <View style={searchAreaStyles.row}>
                <View style={searchAreaStyles.fieldContainer}>
                  <TextInput
                    value={homeFilter.name}
                    onChangeText={(text) => setHomeFilter((prev) => ({ ...prev, name: text }))}
                    placeholder="名前"
                    placeholderTextColor={Theme.textSecondary}
                    style={searchAreaStyles.textInput}
                    autoCapitalize="none"
                  />
                </View>
                <SelectField
                  label="所属1"
                  value={homeFilter.affiliation1}
                  options={affiliationOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, affiliation1: value }))}
                />
                <SelectField
                  label="所属2"
                  value={homeFilter.affiliation2}
                  options={affiliationOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, affiliation2: value }))}
                />
              </View>

              <View style={searchAreaStyles.row}>
                <SelectField
                  label="経験"
                  value={homeFilter.experience}
                  options={experienceOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, experience: value }))}
                />
                <SelectField
                  label="MBTI"
                  value={homeFilter.mbti}
                  options={mbtiOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, mbti: value }))}
                />
                <SelectField
                  label="誕生月"
                  value={homeFilter.birthMonth}
                  options={birthMonthOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, birthMonth: value }))}
                />
              </View>
            </View>
              <View style={searchAreaStyles.areaDivider} />
            </>
          }
          renderItem={({ item }) => {
            const isMyself = myselfId === item.id;
            return (
              <FriendHomeCard
                friend={item}
                width={cardWidth}
                isMyself={isMyself}
                onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
                onLongPress={() => handleLongPressDeleteProfile(item)}
                delayLongPress={400}
              />
            );
          }}
          numColumns={3}
          columnWrapperStyle={styles.column}
          ListEmptyComponent={<Text style={styles.emptyText}>人物データがありません</Text>}
        />

        <AddCircleButton
          style={styles.fab}
          onPress={() => router.push('/edit')}
          accessibilityLabel="人物を追加"
        />
      </View>

      <PendingEpisodeReviewModal
        visible={reviewModalVisible}
        items={pendingReviewItems}
        onClose={() => setReviewModalVisible(false)}
        onChanged={reloadPendingReviews}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.screenBase,
  },
  container: {
    flex: 1,
    paddingTop: 8,
  },
  listContent: {
    paddingBottom: 100,
    paddingHorizontal: ScreenHorizontalInset,
  },
  column: {
    justifyContent: 'flex-start',
    marginBottom: CARD_GAP,
    gap: CARD_GAP,
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

