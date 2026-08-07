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
import { FriendHomeCard, formatFriendBirthdayBadge } from '@/components/friend/FriendHomeCard';
import {
  SearchArea,
  SearchAreaDivider,
  SearchAreaRow,
  SearchAreaSelectField,
  SearchAreaTextInputField,
} from '@/components/ui/SearchArea';
import { ListScreenTemplate } from '@/components/screen-templates';
import { AddCircleButton } from '@/components/AddCircleButton';
import { CircleIconButton } from '@/components/CircleIconButton';
import { PendingEpisodeReviewModal } from '@/components/episode/PendingEpisodeReviewModal';
import { useContentColors } from '@/utils/useContentColors';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';

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
import { Friend, FriendSearchFilters, MBTI_TYPES, PendingReviewEpisodeRef } from './types';
import { sortFriendsByDefaultOrder } from '@/utils/friendDefaultSort';

type Option = {
  label: string;
  value: string;
};

/** Birthday-month filter keeps day-of-month order from DB; otherwise ⓪–⑥ default. */
function loadHomeFriends(filters: FriendSearchFilters): Friend[] {
  const results = searchFriends(filters);
  if (filters.birthMonth && filters.birthMonth >= 1 && filters.birthMonth <= 12) {
    return results;
  }
  return sortFriendsByDefaultOrder(results);
}

const birthMonthOptions: Option[] = Array.from({ length: 12 }, (_, index) => ({
  label: String(index + 1),
  value: String(index + 1),
}));

const toOptions = (values: string[]): Option[] => values.map((value) => ({ label: value, value }));

export default function HomeScreen() {
  const router = useRouter();
  const kit = useUiKit();
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const isBlack = appTheme?.variant === 'black';
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

  const handleWritePendingEpisode = useCallback(
    (item: PendingReviewEpisodeRef) => {
      setReviewModalVisible(false);
      const ownerId = item.episode.authorFriendId.trim() || item.friendId;
      router.push({
        pathname: '/episode-detail',
        params: {
          episodeId: item.episode.id,
          ownerId,
          edit: '1',
        },
      });
    },
    [router]
  );

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
    setFriends(loadHomeFriends(filters));
  }, [filters]);

  useFocusEffect(
    useCallback(() => {
      loadInitialData();
      setFriends(loadHomeFriends(filtersRef.current));
    }, [loadInitialData])
  );

  const showBirthdayBadges = Boolean(
    filters.birthMonth && filters.birthMonth >= 1 && filters.birthMonth <= 12
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
      setFriends(loadHomeFriends(filtersRef.current));
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
        <>
          <View
            style={[
              styles.fabLeft,
              {
                backgroundColor: isBlack ? 'rgba(28, 28, 28, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: content.contentBorder,
                borderWidth: 1,
              },
            ]}
          >
            <CircleIconButton
              icon="pricetag-outline"
              onPress={() => router.push('/commonitems')}
              accessibilityLabel="共通項目"
            />
          </View>
          <View
            style={[
              styles.fabRow,
              {
                backgroundColor: isBlack ? 'rgba(28, 28, 28, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: content.contentBorder,
                borderWidth: 1,
              },
            ]}
          >
            <CircleIconButton
              icon="qr-code-outline"
              onPress={() => router.push('/myprofile-qr')}
              accessibilityLabel="QRコードを表示"
            />
            <CircleIconButton
              icon="scan-outline"
              onPress={() => router.push('/scan')}
              accessibilityLabel="QRコードを読み取る"
            />
            <AddCircleButton
              onPress={() => router.push('/edit')}
              accessibilityLabel="人物を追加"
            />
          </View>
        </>
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
              birthdayBadgeText={
                showBirthdayBadges ? formatFriendBirthdayBadge(item.birthday) : null
              }
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
        onWrite={handleWritePendingEpisode}
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
  fabLeft: {
    position: 'absolute',
    left: 14,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 28,
  },
  fabRow: {
    position: 'absolute',
    right: 14,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 28,
  },
});

