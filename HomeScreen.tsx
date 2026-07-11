import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  useWindowDimensions,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Theme } from '@/constants/theme';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { FriendHomeCard } from '@/components/friend/FriendHomeCard';
import {
  SearchArea,
  SearchAreaDivider,
  SearchAreaRow,
  SearchAreaSelectField,
  SearchAreaTextInputField,
} from '@/components/ui/SearchArea';
import { ListScreenTemplate } from '@/components/screen-templates';
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

const birthMonthOptions: Option[] = Array.from({ length: 12 }, (_, index) => ({
  label: String(index + 1),
  value: String(index + 1),
}));

const toOptions = (values: string[]): Option[] => values.map((value) => ({ label: value, value }));

export default function HomeScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const { width: screenWidth } = useWindowDimensions();
  const listPaddingHorizontal = kit.listScreenPaddingHorizontal;
  const cardGap = kit.friendHomeCardGap;
  const cardWidth = useMemo(() => {
    const rowInnerWidth = screenWidth - listPaddingHorizontal * 2;
    return (rowInnerWidth - cardGap * 2) / 3;
  }, [screenWidth, listPaddingHorizontal, cardGap]);

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
    <ListScreenTemplate
      fab={
        <AddCircleButton
          style={styles.fab}
          onPress={() => router.push('/edit')}
          accessibilityLabel="人物を追加"
        />
      }
    >
      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: listPaddingHorizontal, paddingBottom: 80 },
        ]}
        ListHeaderComponent={
          <>
            <SearchArea>
              <SearchAreaRow>
                <SearchAreaTextInputField
                  label="名前"
                  value={homeFilter.name}
                  onChangeText={(text) => setHomeFilter((prev) => ({ ...prev, name: text }))}
                  autoCapitalize="none"
                />
                <SearchAreaSelectField
                  label="所属1"
                  value={homeFilter.affiliation1}
                  options={affiliationOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, affiliation1: value }))}
                />
                <SearchAreaSelectField
                  label="所属2"
                  value={homeFilter.affiliation2}
                  options={affiliationOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, affiliation2: value }))}
                />
              </SearchAreaRow>

              <SearchAreaRow>
                <SearchAreaSelectField
                  label="経験"
                  value={homeFilter.experience}
                  options={experienceOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, experience: value }))}
                />
                <SearchAreaSelectField
                  label="MBTI"
                  value={homeFilter.mbti}
                  options={mbtiOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, mbti: value }))}
                />
                <SearchAreaSelectField
                  label="誕生月"
                  value={homeFilter.birthMonth}
                  options={birthMonthOptions}
                  onValueChange={(value) => setHomeFilter((prev) => ({ ...prev, birthMonth: value }))}
                />
              </SearchAreaRow>
            </SearchArea>
            <SearchAreaDivider />
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
        columnWrapperStyle={[styles.column, { marginBottom: cardGap, gap: cardGap }]}
        ListEmptyComponent={<Text style={styles.emptyText}>人物データがありません</Text>}
      />

      <PendingEpisodeReviewModal
        visible={reviewModalVisible}
        items={pendingReviewItems}
        onClose={() => setReviewModalVisible(false)}
        onChanged={reloadPendingReviews}
      />
    </ListScreenTemplate>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 100,
  },
  column: {
    justifyContent: 'flex-start',
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
});

