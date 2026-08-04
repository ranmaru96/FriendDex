import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { DetailTabKey } from '@/constants/detailThemes';
import { DETAIL_TAB_KEYS } from '@/constants/detailThemes/tabs';
import { Radius, Theme, Typography, Spacing } from '@/constants/theme';
import { TabScreenTemplate } from '@/components/screen-templates';
import { ScreenTopBar } from '@/components/screen/ScreenTopBar';
import { EpisodeListCard } from '@/components/episode/EpisodeListCard';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { useSharedHeaderChromeOptional } from '@/contexts/SharedHeaderChromeContext';
import { setNextStackAnimation } from '@/utils/tabTransition';
import { useKeyboardBottomInset } from '@/utils/useKeyboardBottomInset';
import { useBottomNavScrollClearance } from '@/hooks/useBottomNavScrollClearance';
import { useDetailDesign } from './contexts/DetailDesignContext';
import { isMonochromeAppTheme } from '@/constants/appThemes';
import { useAppTheme } from './contexts/AppThemeContext';
import { createDetailStyles } from './utils/detailStyles';
import { bridgeDetailBundleForAppTheme } from '@/utils/bridgeDetailForAppTheme';
import { useContentColors } from '@/utils/useContentColors';
import { contentDateTimePickerProps } from '@/utils/contentStyleHelpers';
import { computeProfileCompleteness } from '@/utils/profileCompleteness';
import { sortFriendsBySelectedIds } from '@/utils/selectionSortHelpers';
import {
  getAllFriendsInDefaultOrder,
  sortFriendsByDefaultOrder,
} from '@/utils/friendDefaultSort';
import {
  createEpisode,
  createSayings,
  deleteSaying,
  deleteEpisode,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMergedEpisodeTagLabels,
  getEpisodeListPhotoUrisMap,
  getEpisodeParticipantFriendIds,
  getFriendById,
  getMyself,
  getProfilesByFriendId,
  initializeDatabase,
  searchFriends,
  setDefaultProfile,
  updateFriend,
  updateEpisode,
  updateSaying,
} from './db';
import {
  Episode,
  Friend,
  Profile,
  Saying,
} from './types';
import {
  buildParticipantChips,
  canManageEpisode,
  formatEpisodeDateForCard,
  getVisibilityModeIconColor,
  getVisibilityModeIconName,
  getVisibilityModeLabel,
  resolveEpisodeRecordOwnerId,
} from './utils/episodeHelpers';
import { EpisodeFormOverlay } from '@/components/episode/EpisodeFormOverlay';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { useEpisodeForm } from '@/hooks/useEpisodeForm';
import { usePersistedFilter, FILTER_KEYS } from '@/hooks/usePersistedFilter';
import {
  DEFAULT_DETAIL_EPISODE_FILTER,
  DEFAULT_HOME_FILTER,
  homeFilterToSearchFilters,
  isDetailEpisodeFilterState,
  isHomeFilterState,
} from '@/utils/persistedFilterTypes';
import {
  EVENT_CREATE_FAILED_MESSAGE,
  resolveEpisodeSaveEventId,
} from './utils/episodeEventLinking';

const EPISODE_PICKER_COLUMNS = 3;
const EPISODE_PICKER_GAP = 6;
const DETAIL_SLIDE_MS = 260;

type AdjacentDirection = 'prev' | 'next';
/** none=写真なし / pending=読み込み中 / loaded|failed=成否確定 */
type ProfileImageStatus = 'none' | 'pending' | 'loaded' | 'failed';
type AdjacentSlideSnapshot = {
  friend: Friend;
  activeTab: DetailTabKey;
  habitCount: number;
  sayingCount: number;
  sinceYear: string;
  profileCompleteness: number;
  profileImageStatus: ProfileImageStatus;
  showProfileSwitcher: boolean;
  profileByLabel: string;
};
type AdjacentTransition = {
  outgoing: AdjacentSlideSnapshot;
  incoming: AdjacentSlideSnapshot;
  targetId: string;
};
type MultiValueRow = {
  title: string;
  values: string[];
};

const resolveAdjacentProfileMeta = (
  friend: Friend,
  profiles: Profile[],
  myselfId: string | null,
  friendNameById: Map<string, string>
): { showProfileSwitcher: boolean; profileByLabel: string } => {
  const hasOnlyOneSelfProfile =
    profiles.length === 1 &&
    (profiles[0].source === 'self' || (myselfId !== null && profiles[0].authorUserId === myselfId));
  const showProfileSwitcher =
    friend.importSource !== 'qr_scan' && profiles.length > 0 && !hasOnlyOneSelfProfile;
  const selected =
    (friend.activeProfileId
      ? profiles.find((profile) => profile.id === friend.activeProfileId)
      : undefined) ??
    profiles.find(
      (profile) =>
        profile.source === 'self' || (myselfId !== null && profile.authorUserId === myselfId)
    ) ??
    profiles[0];
  if (!selected) {
    return { showProfileSwitcher, profileByLabel: '' };
  }
  const isSelf =
    selected.source === 'self' || (myselfId !== null && selected.authorUserId === myselfId);
  if (isSelf) {
    return { showProfileSwitcher, profileByLabel: 'me' };
  }
  if (!selected.authorUserId) {
    return { showProfileSwitcher, profileByLabel: '' };
  }
  return {
    showProfileSwitcher,
    profileByLabel: friendNameById.get(selected.authorUserId) ?? '',
  };
};

const resolveProfileImageStatus = (
  friend: Friend,
  known?: ProfileImageStatus
): ProfileImageStatus => {
  if (known) {
    return known;
  }
  // 未観測の相手は URI があれば pending（Completeness は出さない）
  return friend.photoUri?.trim() ? 'pending' : 'none';
};

const buildAdjacentSlideSnapshot = (
  friend: Friend,
  activeTab: DetailTabKey,
  options?: {
    habitCount?: number;
    sinceYear?: string;
    profileImageStatus?: ProfileImageStatus;
    showProfileSwitcher?: boolean;
    profileByLabel?: string;
  }
): AdjacentSlideSnapshot => {
  const profileImageStatus = resolveProfileImageStatus(friend, options?.profileImageStatus);
  const hasPhoto = profileImageStatus === 'loaded';
  return {
    friend,
    activeTab,
    habitCount: options?.habitCount ?? friend.traits.length,
    sayingCount: friend.sayings.length,
    sinceYear: options?.sinceYear ?? '—',
    profileCompleteness: computeProfileCompleteness(friend, hasPhoto),
    profileImageStatus,
    showProfileSwitcher: options?.showProfileSwitcher ?? false,
    profileByLabel: options?.profileByLabel ?? '',
  };
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

const formatProfileSinceYear = (createdAt: string | undefined): string => {
  if (!createdAt?.trim()) {
    return '—';
  }
  const year = new Date(createdAt).getFullYear();
  return Number.isNaN(year) ? '—' : String(year);
};

type Option = {
  label: string;
  value: string;
};

function MultiValueSummarySection({
  rows,
  withCard = true,
  styles,
  infoChipStyles,
  colors: c,
}: {
  rows: MultiValueRow[];
  withCard?: boolean;
  styles: ReturnType<typeof createDetailStyles>;
  infoChipStyles: Record<string, { backgroundColor: string; borderColor: string; color: string; borderWidth: number }>;
  colors: ReturnType<typeof useDetailDesign>['bundle']['colors'];
}) {
  return (
    <View style={withCard ? styles.multiValueCard : styles.multiValuePlainContainer}>
      {rows.map((row, rowIndex) => {
        const chipColors = infoChipStyles[row.title] ?? {
          backgroundColor: 'transparent',
          borderColor: c.border,
          color: c.textSecondary,
          borderWidth: 1.5,
        };
        return (
          <View
            key={row.title}
            style={[
              styles.multiValueRow,
              rowIndex < rows.length - 1 && styles.multiValueRowWithDivider,
              rowIndex === rows.length - 1 && styles.multiValueRowLast,
            ]}
          >
            <Text style={styles.multiValueLabel}>{row.title}</Text>
            <View style={styles.multiValueChipArea}>
              {(row.values.length > 0 ? row.values : ['-']).map((value, index) => (
                <View
                  key={`${row.title}-${index}-${value}`}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: chipColors.backgroundColor,
                      borderColor: chipColors.borderColor,
                      borderWidth: chipColors.borderWidth,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: chipColors.color }]}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** 前後移動中だけ使う静止スナップショット（退場・入場とも同じ見た目） */
function DetailAdjacentSlidePanel({
  snapshot,
  styles,
  detailTabs,
  bundle,
  c,
  isMonochromeTheme,
  isFlatProfileCard,
}: {
  snapshot: AdjacentSlideSnapshot;
  styles: ReturnType<typeof createDetailStyles>;
  detailTabs: ReturnType<typeof useDetailDesign>['bundle']['detailTabs'];
  bundle: ReturnType<typeof useDetailDesign>['bundle'];
  c: ReturnType<typeof useDetailDesign>['bundle']['colors'];
  isMonochromeTheme: boolean;
  isFlatProfileCard: boolean;
}) {
  const {
    friend,
    activeTab,
    habitCount,
    sayingCount,
    sinceYear,
    profileCompleteness,
    profileImageStatus,
    showProfileSwitcher,
    profileByLabel,
  } = snapshot;
  const contentColors = useContentColors();
  const { variant: appThemeVariant } = useAppTheme();
  const profileCardBorderColor = contentColors.contentBorder;
  const heroPhotoOuterStyle =
    appThemeVariant === 'white'
      ? {
          borderColor: contentColors.contentTextSecondary,
          borderWidth: 1 as const,
        }
      : { borderColor: profileCardBorderColor };
  const heroPhotoInnerStyle =
    appThemeVariant === 'white'
      ? { borderColor: contentColors.contentPhotoInnerBorder }
      : null;
  const birthdayLabel = (() => {
    if (!friend.birthday.trim()) return '';
    const formatted = formatEpisodeDateForCard(friend.birthday);
    return formatted === '-' ? '' : formatted;
  })();
  const [photoFailed, setPhotoFailed] = useState(profileImageStatus === 'failed');
  const photoUri = friend.photoUri?.trim() ?? '';
  const showPhoto = Boolean(photoUri) && !photoFailed && profileImageStatus !== 'failed';
  const isCompletenessReady = profileImageStatus !== 'pending';

  return (
    <ScrollView
      style={{ flex: 1, marginHorizontal: isFlatProfileCard ? 0 : 6 }}
      contentContainerStyle={{ paddingBottom: 60 }}
      scrollEnabled={false}
      pointerEvents="none"
    >
      <View
        style={[
          styles.profileCardShadow,
          { marginHorizontal: 0 },
          isFlatProfileCard
            ? {
                marginHorizontal: 0,
                borderRadius: 0,
                elevation: 0,
                shadowOpacity: 0,
                shadowRadius: 0,
                shadowOffset: { width: 0, height: 0 },
              }
            : null,
        ]}
      >
        <View
          style={[
            styles.profileCardOuter,
            {
              borderColor: profileCardBorderColor,
              borderWidth: isFlatProfileCard ? 0 : Theme.homeCardBorderWidth,
              borderRadius: isFlatProfileCard ? 0 : 12,
            },
          ]}
        >
          <View style={[styles.hero, isMonochromeTheme ? { paddingTop: 8 } : null]}>
            <View style={styles.heroIdentityRow}>
              <View style={[styles.heroPhotoOuterFrame, heroPhotoOuterStyle]}>
                <View style={[styles.heroPhotoInnerFrame, heroPhotoInnerStyle]}>
                  {showPhoto ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.heroPhoto}
                      resizeMode="cover"
                      onError={() => setPhotoFailed(true)}
                    />
                  ) : (
                    <View style={styles.heroPhotoPlaceholder}>
                      <Text style={styles.heroPhotoPlaceholderText}>No Image</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.heroIdentityCol}>
                <View style={styles.heroNameRow}>
                  <Text style={styles.heroName} numberOfLines={2}>
                    {friend.name}
                  </Text>
                  <View style={styles.heroEditButton}>
                    <Ionicons name="pencil-outline" size={16} color={c.accent} />
                  </View>
                </View>
                {friend.nickname.trim() || friend.importSource === 'qr_scan' ? (
                  <View style={styles.heroNicknameRow}>
                    {friend.nickname.trim() ? (
                      <Text style={styles.heroNickname}>{friend.nickname}</Text>
                    ) : null}
                    {friend.importSource === 'qr_scan' ? (
                      <Ionicons name="qr-code-outline" size={14} color={c.textMuted} />
                    ) : null}
                  </View>
                ) : null}
                {showProfileSwitcher ? (
                  <Text style={styles.heroByTag}>
                    {profileByLabel ? `by ${profileByLabel}` : 'プロフィールを切り替え'}
                  </Text>
                ) : null}
                {friend.mbti || birthdayLabel || friend.category.trim() ? (
                  <View style={styles.heroTagRow}>
                    {friend.mbti ? (
                      <View style={styles.heroTagMbti}>
                        <Text style={styles.heroTagMbtiText}>{friend.mbti}</Text>
                      </View>
                    ) : null}
                    {birthdayLabel ? (
                      <View style={styles.heroTagBirthday}>
                        <Text style={styles.heroTagBirthdayText}>{birthdayLabel}</Text>
                      </View>
                    ) : null}
                    {friend.category.trim() ? (
                      <View style={styles.heroTagCategory}>
                        <Text style={styles.heroTagCategoryText}>{friend.category}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {friend.description.trim() ? (
                  <Text style={styles.heroDescription}>{friend.description}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatCell}>
                <Text style={styles.heroStatLabel}>EPISODES</Text>
                <View style={styles.heroStatValueRow}>
                  <Text style={styles.heroStatValue}>{friend.episodes.length}</Text>
                  <Text style={styles.heroStatUnit}>件</Text>
                </View>
              </View>
              <View style={styles.heroStatCell}>
                <Text style={styles.heroStatLabel}>習性 + 彼曰く</Text>
                <View style={styles.heroStatValueRow}>
                  <Text style={styles.heroStatValue}>{habitCount + sayingCount}</Text>
                  <Text style={styles.heroStatUnit}>件</Text>
                </View>
              </View>
              <View style={styles.heroStatCell}>
                <Text style={styles.heroStatLabel}>SINCE</Text>
                <View style={styles.heroStatValueRow}>
                  <Text style={styles.heroStatValue}>{sinceYear}</Text>
                  <Text style={styles.heroStatUnit}>年〜</Text>
                </View>
              </View>
            </View>
            <View style={styles.heroCompletenessSection}>
              <View style={styles.heroCompletenessHeader}>
                <Text style={styles.heroCompletenessLabel}>PROFILE COMPLETENESS</Text>
                <Text style={styles.heroCompletenessPercent}>
                  {isCompletenessReady ? `${profileCompleteness}%` : ''}
                </Text>
              </View>
              <View style={styles.heroCompletenessTrack}>
                <View
                  style={[
                    styles.heroCompletenessFill,
                    { width: `${isCompletenessReady ? profileCompleteness : 0}%` },
                  ]}
                />
              </View>
            </View>
          </View>
          <View style={styles.tabSection}>
            <View style={styles.tabTrack}>
              <View style={styles.tabInner}>
                {detailTabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  const activeColor = bundle.tabMode === 'perTab' ? tab.color : c.accent;
                  const inactiveIconBg = bundle.tabMode === 'perTab' ? tab.color : c.tabInactive;
                  return (
                    <View
                      key={tab.key}
                      style={[
                        styles.tabPill,
                        isActive
                          ? { borderColor: activeColor, backgroundColor: activeColor }
                          : null,
                      ]}
                    >
                      <View style={styles.tabPillContent}>
                        <View
                          style={[
                            styles.tabPillIconCircle,
                            isActive
                              ? styles.tabPillIconCircleActive
                              : { backgroundColor: inactiveIconBg },
                          ]}
                        >
                          {tab.iconSet === 'material' ? (
                            <MaterialCommunityIcons
                              name={tab.icon as ComponentProps<typeof MaterialCommunityIcons>['name']}
                              size={16}
                              color={c.onAccent}
                            />
                          ) : (
                            <Ionicons
                              name={tab.icon as ComponentProps<typeof Ionicons>['name']}
                              size={16}
                              color={c.onAccent}
                            />
                          )}
                        </View>
                        <Text
                          style={[
                            styles.tabPillCaption,
                            isActive ? styles.tabPillCaptionActive : styles.tabPillCaptionInactive,
                          ]}
                        >
                          {tab.caption}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
            {activeTab === '情報' ? (
              <MultiValueSummarySection
                withCard
                styles={styles}
                infoChipStyles={bundle.infoChipStyles}
                colors={c}
                rows={[
                  { title: '所属', values: friend.affiliations },
                  { title: '経験', values: friend.experiences },
                  { title: '性格', values: friend.personalities },
                  { title: '好物', values: friend.likes },
                  { title: '苦手', values: friend.dislikes },
                ]}
              />
            ) : (
              <View style={[styles.tabPane, { minHeight: 80 }]} />
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export default function DetailScreen() {
  const { bundle: rawBundle, reload: reloadDetailDesign } = useDetailDesign();
  const { colors: appTheme, variant: appThemeVariant } = useAppTheme();
  const content = useContentColors();
  const isMonochromeTheme = isMonochromeAppTheme(appThemeVariant);
  const dateTimePickerProps = contentDateTimePickerProps(appThemeVariant);
  const bundle = useMemo(
    () =>
      bridgeDetailBundleForAppTheme(
        rawBundle,
        appThemeVariant,
        content,
        appTheme.screenBackground
      ),
    [appTheme.screenBackground, appThemeVariant, content, rawBundle]
  );
  const c = bundle.colors;
  const styles = useMemo(() => createDetailStyles(c), [c]);
  const detailTabs = bundle.detailTabs;
  const kit = useUiKit();
  const sharedHeaderApi = useSharedHeaderChromeOptional();
  const setSharedDetailHeader = sharedHeaderApi?.setDetailHeader;
  const useSharedHeaderChrome = Boolean(kit.sharedHeaderChrome && setSharedDetailHeader);
  const showLocalDetailHeader = !useSharedHeaderChrome;
  const useSharedEpisodeCard = kit.episodeListCardLayout === 'photoRight';
  const listItemEmbedded = kit.listItemStyle === 'panelSections';
  const isFlatProfileCard = true;
  const profileChromeSideBorder = isFlatProfileCard ? 0 : Theme.homeCardBorderWidth;
  const profileCardShadowFlatStyle = isFlatProfileCard
    ? {
        marginHorizontal: 0,
        borderRadius: 0,
        elevation: 0,
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
      }
    : null;
  const profileCardOuterFlatStyle = isFlatProfileCard
    ? { borderRadius: 0, borderWidth: 0 }
    : null;
  const profileHeroFlatStyle = isFlatProfileCard
    ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 }
    : null;
  const profileTabSectionFlatStyle = isFlatProfileCard
    ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
    : null;
  const router = useRouter();
  const { width: screenWidth, height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const outgoingSlideX = useSharedValue(0);
  const incomingSlideX = useSharedValue(0);
  const isAdjacentSlidingRef = useRef(false);
  const pendingAdjacentDirectionRef = useRef<AdjacentDirection | null>(null);
  const [adjacentTransition, setAdjacentTransition] = useState<AdjacentTransition | null>(null);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [hasAttemptedFriendLoad, setHasAttemptedFriendLoad] = useState(false);
  const [episodePhotoUrisById, setEpisodePhotoUrisById] = useState<Map<string, string[]>>(
    () => new Map()
  );
  const [profileImageStatus, setProfileImageStatus] = useState<ProfileImageStatus>('none');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTabKey>('情報');
  const isEpisodeTab = activeTab === 'エピソード';
  const bottomNavClearance = useBottomNavScrollClearance();
  const keyboardBottomInset = useKeyboardBottomInset();
  const detailListRef = useRef<FlatList<Episode>>(null);
  const detailScrollOffsetRef = useRef(0);
  const noteFormAnchorRef = useRef<View>(null);
  const [habitNotes, setHabitNotes] = useState<string[]>([]);
  const [isHabitFormVisible, setIsHabitFormVisible] = useState(false);
  const [editingHabitIndex, setEditingHabitIndex] = useState<number | null>(null);
  const [habitText, setHabitText] = useState('');
  const [habitInputHeight, setHabitInputHeight] = useState(48);
  const [habitFormError, setHabitFormError] = useState('');
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [episodeFilterSelectedIdsDraft, setEpisodeFilterSelectedIdsDraft] = useState<Set<string>>(
    () => new Set()
  );
  const [isEpisodeParticipantPickerOpen, setIsEpisodeParticipantPickerOpen] = useState(false);
  const [episodePickerGridWidth, setEpisodePickerGridWidth] = useState(0);
  const [episodeTitleDraft, setEpisodeTitleDraft] = useState('');
  const [isEpisodeFormVisible, setIsEpisodeFormVisible] = useState(false);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [episodeTagOptions, setEpisodeTagOptions] = useState<Option[]>([]);
  const [showSayingDatePicker, setShowSayingDatePicker] = useState(false);
  const [isSayingFormVisible, setIsSayingFormVisible] = useState(false);
  const [editingSayingId, setEditingSayingId] = useState<string | null>(null);
  const [sayingText, setSayingText] = useState('');
  const [sayingDate, setSayingDate] = useState('');
  const [sayingInputHeight, setSayingInputHeight] = useState(48);
  const [sayingFormError, setSayingFormError] = useState('');

  const isNoteFormOpen =
    ((activeTab === '習性' || activeTab === 'メモ') && isHabitFormVisible) ||
    (activeTab === '彼曰く' && isSayingFormVisible);

  const scrollNoteFormAboveKeyboard = useCallback(() => {
    if (keyboardBottomInset <= 0) {
      return;
    }
    noteFormAnchorRef.current?.measureInWindow((_x, y, _width, height) => {
      const keyboardTop = windowHeight - keyboardBottomInset;
      const formBottom = y + height;
      const overlap = formBottom - (keyboardTop - 16);
      if (overlap <= 0) {
        return;
      }
      detailListRef.current?.scrollToOffset({
        offset: Math.max(0, detailScrollOffsetRef.current + overlap),
        animated: true,
      });
    });
  }, [keyboardBottomInset, windowHeight]);

  useEffect(() => {
    if (!isNoteFormOpen || keyboardBottomInset <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      scrollNoteFormAboveKeyboard();
    }, 80);
    return () => clearTimeout(timer);
  }, [isNoteFormOpen, keyboardBottomInset, scrollNoteFormAboveKeyboard]);

  const friendId = useMemo(() => {
    if (Array.isArray(params.id)) {
      return params.id[0] ?? '';
    }
    return params.id ?? '';
  }, [params.id]);

  useEffect(() => {
    const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    if (raw && (DETAIL_TAB_KEYS as readonly string[]).includes(raw)) {
      setActiveTab(raw as DetailTabKey);
    }
  }, [friendId, params.tab]);

  const [homeFilter] = usePersistedFilter(FILTER_KEYS.home, DEFAULT_HOME_FILTER, {
    validate: isHomeFilterState,
  });

  const homeAdjacentFriendIds = useMemo(() => {
    initializeDatabase();
    const filters = homeFilterToSearchFilters(homeFilter);
    const searched = searchFriends(filters);
    const ordered =
      filters.birthMonth && filters.birthMonth >= 1 && filters.birthMonth <= 12
        ? searched
        : sortFriendsByDefaultOrder(searched);
    const orderedIds = ordered.map((friend) => friend.id);
    const index = friendId ? orderedIds.indexOf(friendId) : -1;
    return {
      prevId: index > 0 ? orderedIds[index - 1] ?? null : null,
      nextId: index >= 0 && index < orderedIds.length - 1 ? orderedIds[index + 1] ?? null : null,
    };
  }, [friendId, homeFilter]);

  const pendingCommitTargetIdRef = useRef<string | null>(null);
  const loadFriendRef = useRef<(idOverride?: string) => void>(() => {});

  const finishAdjacentSlide = useCallback(() => {
    const targetId = pendingCommitTargetIdRef.current;
    pendingCommitTargetIdRef.current = null;
    if (targetId) {
      loadFriendRef.current(targetId);
      router.setParams({ id: targetId });
    }
    // 本番ヒーローの1フレーム目を用意してからスナップショットを外し、位置ずれを防ぐ
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAdjacentTransition(null);
        outgoingSlideX.value = 0;
        incomingSlideX.value = 0;
        isAdjacentSlidingRef.current = false;
      });
    });
  }, [incomingSlideX, outgoingSlideX, router]);

  const outgoingSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: outgoingSlideX.value }],
  }));
  const incomingSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: incomingSlideX.value }],
  }));

  const detailEpisodeFilterKey = useMemo(
    () => (friendId ? FILTER_KEYS.detailEpisode(friendId) : FILTER_KEYS.detailEpisodeInactive),
    [friendId]
  );
  const [detailEpisodeFilter, setDetailEpisodeFilter] = usePersistedFilter(
    detailEpisodeFilterKey,
    DEFAULT_DETAIL_EPISODE_FILTER,
    { validate: isDetailEpisodeFilterState }
  );
  const episodeFilterSelectedIds = useMemo(
    () => new Set(detailEpisodeFilter.participantIds),
    [detailEpisodeFilter.participantIds]
  );
  const episodeTitleFilter = detailEpisodeFilter.title;

  useEffect(() => {
    setEpisodeTitleDraft(detailEpisodeFilter.title);
    setEpisodeFilterSelectedIdsDraft(new Set(detailEpisodeFilter.participantIds));
  }, [detailEpisodeFilter.title, detailEpisodeFilter.participantIds]);

  useFocusEffect(
    useCallback(() => {
      reloadDetailDesign();
    }, [reloadDetailDesign])
  );

  const navigateHome = useCallback(() => {
    setNextStackAnimation('slide_from_right');
    router.replace('/');
  }, [router]);

  const loadFriend = useCallback((idOverride?: string) => {
    initializeDatabase();
    const id = (idOverride ?? friendId).trim();
    if (!id) {
      setFriend(null);
      setProfiles([]);
      setMyselfId(null);
      setAllFriends([]);
      setProfileImageStatus('none');
      setHasAttemptedFriendLoad(true);
      return;
    }
    const loadedProfiles = getProfilesByFriendId(id);
    const currentMyselfId = getMyself();
    let loaded = getFriendById(id);
    if (loaded && loadedProfiles.length > 0 && !loaded.activeProfileId) {
      const selfProfile = loadedProfiles.find(
        (profile) => profile.source === 'self' || (currentMyselfId !== null && profile.authorUserId === currentMyselfId)
      );
      const fallbackProfile = selfProfile ?? loadedProfiles[0];
      if (fallbackProfile && setDefaultProfile(id, fallbackProfile.id)) {
        loaded = getFriendById(id);
      }
    }
    setFriend(loaded);
    setEpisodePhotoUrisById(
      getEpisodeListPhotoUrisMap((loaded?.episodes ?? []).map((episode) => episode.id))
    );
    setProfiles(loadedProfiles);
    setMyselfId(currentMyselfId);
    setProfileImageStatus(loaded?.photoUri?.trim() ? 'pending' : 'none');
    const loadedTraits = loaded?.traits ?? [];
    setHabitNotes(loadedTraits);
    setAllFriends(getAllFriendsInDefaultOrder());
    setAffiliationOptions(getDistinctAffiliations().map((v) => ({ label: v, value: v })));
    setExperienceOptions(getDistinctExperiences().map((v) => ({ label: v, value: v })));
    setEpisodeTagOptions(getMergedEpisodeTagLabels().map((v) => ({ label: v, value: v })));
    setHasAttemptedFriendLoad(true);
  }, [friendId]);

  loadFriendRef.current = loadFriend;

  const skipNextFocusReloadRef = useRef(true);

  useLayoutEffect(() => {
    skipNextFocusReloadRef.current = true;
    loadFriend();
  }, [friendId, loadFriend]);

  useFocusEffect(
    useCallback(() => {
      if (skipNextFocusReloadRef.current) {
        skipNextFocusReloadRef.current = false;
        return;
      }
      loadFriend();
    }, [loadFriend])
  );

  const hiddenParticipantIds = useMemo(() => {
    const ids: string[] = [];
    if (friendId) ids.push(friendId);
    if (myselfId) ids.push(myselfId);
    return ids;
  }, [friendId, myselfId]);

  const implicitParticipantEntries = useMemo(
    () => (friendId ? [{ kind: 'individual' as const, value: friendId }] : []),
    [friendId]
  );

  const episodeForm = useEpisodeForm({
    friends: allFriends,
    hiddenParticipantIds,
    implicitParticipantEntries,
  });

  useEffect(() => {
    setActiveTab('情報');
    setIsHabitFormVisible(false);
    setEditingHabitIndex(null);
    setHabitText('');
    setHabitInputHeight(48);
    setHabitFormError('');
    setIsEpisodeParticipantPickerOpen(false);
    setIsEpisodeFormVisible(false);
    episodeForm.reset();
    setIsSayingFormVisible(false);
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    setSayingFormError('');
    setShowSayingDatePicker(false);
  }, [friendId, episodeForm.reset]);

  const friendNameById = useMemo(() => {
    const map = new Map<string, string>();
    allFriends.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [allFriends]);
  const friendPhotoById = useMemo(() => {
    const map = new Map<string, string | null>();
    allFriends.forEach((item) => map.set(item.id, item.photoUri ?? null));
    return map;
  }, [allFriends]);
  const selectedProfile = useMemo(() => {
    if (!friend || profiles.length === 0) {
      return null;
    }
    const current = friend.activeProfileId ? profiles.find((profile) => profile.id === friend.activeProfileId) : undefined;
    if (current) {
      return current;
    }
    const selfProfile = profiles.find(
      (profile) => profile.source === 'self' || (myselfId !== null && profile.authorUserId === myselfId)
    );
    return selfProfile ?? profiles[0] ?? null;
  }, [friend, profiles, myselfId]);
  const selectableProfiles = useMemo(() => {
    if (!friend || friend.importSource === 'qr_scan' || profiles.length === 0) return [];
    const hasOnlyOneSelfProfile =
      profiles.length === 1 &&
      (profiles[0].source === 'self' || (myselfId !== null && profiles[0].authorUserId === myselfId));
    if (hasOnlyOneSelfProfile) {
      return [];
    }
    return profiles;
  }, [friend, profiles, myselfId]);
  const profileTagLabel = useMemo(() => {
    if (!selectedProfile) return '';
    const isSelf =
      selectedProfile.source === 'self' || (myselfId !== null && selectedProfile.authorUserId === myselfId);
    if (isSelf) {
      return 'me';
    }
    if (!selectedProfile.authorUserId) {
      return '';
    }
    return friendNameById.get(selectedProfile.authorUserId) ?? '';
  }, [selectedProfile, myselfId, friendNameById]);
  const episodePickerCardWidth = useMemo(() => {
    if (episodePickerGridWidth <= 0) {
      return undefined;
    }
    const totalGap = EPISODE_PICKER_GAP * (EPISODE_PICKER_COLUMNS - 1);
    return (episodePickerGridWidth - totalGap) / EPISODE_PICKER_COLUMNS;
  }, [episodePickerGridWidth]);

  const episodePickerFriends = useMemo(
    () => sortFriendsBySelectedIds(allFriends, episodeFilterSelectedIdsDraft),
    [allFriends, episodeFilterSelectedIdsDraft]
  );

  const episodeParticipantFilterSummary = useMemo(() => {
    if (episodeFilterSelectedIds.size === 0) {
      return '指定なし';
    }
    const names = Array.from(episodeFilterSelectedIds)
      .map((id) => friendNameById.get(id) ?? '')
      .filter((name) => name.length > 0);
    if (names.length <= 2) {
      return names.join('、');
    }
    return `${names.length}名`;
  }, [episodeFilterSelectedIds, friendNameById]);

  const toggleEpisodeFilterParticipant = useCallback((id: string) => {
    setEpisodeFilterSelectedIdsDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const sortedEpisodes = useMemo(() => {
    if (!friend) return [];
    return [...friend.episodes].sort((a, b) => b.date.localeCompare(a.date));
  }, [friend]);

  const filteredEpisodes = useMemo(() => {
    return sortedEpisodes.filter((episode) => {
      if (episodeFilterSelectedIds.size > 0) {
        const participantIds = getEpisodeParticipantFriendIds(episode);
        const matchesSelected = Array.from(episodeFilterSelectedIds).some((id) =>
          participantIds.includes(id)
        );
        if (!matchesSelected) return false;
      }
      if (episodeTitleFilter.trim()) {
        if (!episode.title.toLowerCase().includes(episodeTitleFilter.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [episodeFilterSelectedIds, episodeTitleFilter, sortedEpisodes]);


  const sortedSayings = useMemo(() => {
    if (!friend) return [];
    return [...friend.sayings].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return -1;
      if (!b.date) return 1;
      return b.date.localeCompare(a.date);
    });
  }, [friend]);

  const heroBirthdayLabel = useMemo(() => {
    if (!friend?.birthday.trim()) {
      return '';
    }
    const formatted = formatEpisodeDateForCard(friend.birthday);
    return formatted === '-' ? '' : formatted;
  }, [friend]);

  const profileCompleteness = useMemo(() => {
    if (!friend) {
      return 0;
    }
    const hasPhoto = profileImageStatus === 'loaded';
    return computeProfileCompleteness(friend, hasPhoto);
  }, [friend, profileImageStatus]);
  const isProfileCompletenessReady = profileImageStatus !== 'pending';

  const profileCardBorderColor = content.contentBorder;
  const heroPhotoOuterStyle =
    appThemeVariant === 'white'
      ? {
          borderColor: content.contentTextSecondary,
          borderWidth: 1 as const,
        }
      : { borderColor: profileCardBorderColor };
  const heroPhotoInnerStyle =
    appThemeVariant === 'white'
      ? { borderColor: content.contentPhotoInnerBorder }
      : null;

  const sinceYear = useMemo(
    () => formatProfileSinceYear(selectedProfile?.createdAt),
    [selectedProfile]
  );

  const goToAdjacentFriend = useCallback(
    (targetId: string | null, direction: AdjacentDirection) => {
      if (!targetId || !friend || isAdjacentSlidingRef.current) {
        return;
      }
      initializeDatabase();
      const nextFriend = getFriendById(targetId);
      if (!nextFriend) {
        return;
      }

      const nextProfiles = getProfilesByFriendId(targetId);
      const nextDefaultProfile =
        (nextFriend.activeProfileId
          ? nextProfiles.find((profile) => profile.id === nextFriend.activeProfileId)
          : undefined) ??
        nextProfiles.find((profile) => profile.source === 'self') ??
        nextProfiles[0];
      const outgoingProfileMeta = {
        showProfileSwitcher: selectableProfiles.length > 0,
        profileByLabel: profileTagLabel,
      };
      const incomingProfileMeta = resolveAdjacentProfileMeta(
        nextFriend,
        nextProfiles,
        myselfId,
        friendNameById
      );

      isAdjacentSlidingRef.current = true;
      pendingAdjacentDirectionRef.current = direction;
      pendingCommitTargetIdRef.current = targetId;
      setAdjacentTransition({
        outgoing: buildAdjacentSlideSnapshot(friend, activeTab, {
          habitCount: habitNotes.length,
          sinceYear,
          profileImageStatus,
          ...outgoingProfileMeta,
        }),
        incoming: buildAdjacentSlideSnapshot(nextFriend, activeTab, {
          sinceYear: formatProfileSinceYear(nextDefaultProfile?.createdAt),
          ...incomingProfileMeta,
        }),
        targetId,
      });
      // 本番の friend / params 切替はアニメ完了後（finishAdjacentSlide）
    },
    [
      activeTab,
      friend,
      friendNameById,
      habitNotes.length,
      myselfId,
      profileImageStatus,
      profileTagLabel,
      selectableProfiles.length,
      sinceYear,
    ]
  );

  const homeAdjacentFriendIdsRef = useRef(homeAdjacentFriendIds);
  homeAdjacentFriendIdsRef.current = homeAdjacentFriendIds;
  const goToAdjacentFriendRef = useRef(goToAdjacentFriend);
  goToAdjacentFriendRef.current = goToAdjacentFriend;

  useLayoutEffect(() => {
    if (!useSharedHeaderChrome || !setSharedDetailHeader) {
      return;
    }
    setSharedDetailHeader({
      onBack: navigateHome,
      prevEnabled: Boolean(homeAdjacentFriendIds.prevId),
      nextEnabled: Boolean(homeAdjacentFriendIds.nextId),
      onPrev: () => goToAdjacentFriend(homeAdjacentFriendIds.prevId, 'prev'),
      onNext: () => goToAdjacentFriend(homeAdjacentFriendIds.nextId, 'next'),
      activeIconColor: appTheme.topBarText,
      mutedIconColor: appTheme.topBarTextMuted,
    });
    return () => {
      setSharedDetailHeader(null);
    };
  }, [
    useSharedHeaderChrome,
    setSharedDetailHeader,
    navigateHome,
    homeAdjacentFriendIds.prevId,
    homeAdjacentFriendIds.nextId,
    goToAdjacentFriend,
    appTheme.topBarText,
    appTheme.topBarTextMuted,
  ]);

  const handleBodySwipeAdjacent = useCallback((direction: AdjacentDirection) => {
    const { prevId, nextId } = homeAdjacentFriendIdsRef.current;
    if (direction === 'next') {
      goToAdjacentFriendRef.current(nextId, 'next');
    } else {
      goToAdjacentFriendRef.current(prevId, 'prev');
    }
  }, []);

  const detailBodySwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-28, 28])
        .failOffsetY([-24, 24])
        .onEnd((event) => {
          'worklet';
          if (event.translationX <= -56) {
            runOnJS(handleBodySwipeAdjacent)('next');
          } else if (event.translationX >= 56) {
            runOnJS(handleBodySwipeAdjacent)('prev');
          }
        }),
    [handleBodySwipeAdjacent]
  );

  useLayoutEffect(() => {
    const direction = pendingAdjacentDirectionRef.current;
    if (!adjacentTransition || !direction) {
      return;
    }
    pendingAdjacentDirectionRef.current = null;
    const exitTo = direction === 'next' ? -screenWidth : screenWidth;
    const enterFrom = direction === 'next' ? screenWidth : -screenWidth;
    outgoingSlideX.value = 0;
    incomingSlideX.value = enterFrom;
    outgoingSlideX.value = withTiming(exitTo, { duration: DETAIL_SLIDE_MS });
    incomingSlideX.value = withTiming(0, { duration: DETAIL_SLIDE_MS }, () => {
      runOnJS(finishAdjacentSlide)();
    });
  }, [
    adjacentTransition,
    finishAdjacentSlide,
    incomingSlideX,
    outgoingSlideX,
    screenWidth,
  ]);

  const openEpisodeParticipantPicker = useCallback(() => {
    setEpisodeFilterSelectedIdsDraft(new Set(episodeFilterSelectedIds));
    setIsEpisodeParticipantPickerOpen(true);
  }, [episodeFilterSelectedIds]);

  const handleParticipantPickerSearch = useCallback(() => {
    setDetailEpisodeFilter((prev) => ({
      ...prev,
      participantIds: Array.from(episodeFilterSelectedIdsDraft),
    }));
    setIsEpisodeParticipantPickerOpen(false);
  }, [episodeFilterSelectedIdsDraft, setDetailEpisodeFilter]);

  const handleEpisodeTitleSubmit = useCallback(() => {
    setDetailEpisodeFilter((prev) => ({ ...prev, title: episodeTitleDraft }));
  }, [episodeTitleDraft, setDetailEpisodeFilter]);

  const handleSaveSayings = () => {
    const text = sayingText.trim();
    const date = sayingDate.trim();
    if (!text) {
      setSayingFormError('本文を入力してください。');
      return;
    }
    if (editingSayingId) {
      const updated = updateSaying(friendId, editingSayingId, { text, date });
      if (!updated) {
        setSayingFormError('彼曰くの更新に失敗しました。');
        return;
      }
    } else {
      const created = createSayings(friendId, [{ text, date }]);
      if (created.length === 0) {
        setSayingFormError('彼曰くの登録に失敗しました。');
        return;
      }
    }

    setSayingFormError('');
    setIsSayingFormVisible(false);
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    setShowSayingDatePicker(false);
    loadFriend();
  };

  const startCreateSaying = () => {
    setSayingFormError('');
    setEditingSayingId(null);
    setSayingText('');
    setSayingDate('');
    setSayingInputHeight(48);
    setShowSayingDatePicker(false);
    setIsSayingFormVisible(true);
  };

  const startEditSaying = (saying: Saying) => {
    setSayingFormError('');
    setEditingSayingId(saying.id);
    setSayingText(saying.text);
    setSayingDate(saying.date);
    setSayingInputHeight(48);
    setShowSayingDatePicker(false);
    setIsSayingFormVisible(true);
  };

  const handleDeleteSaying = (sayingId: string) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const deleted = deleteSaying(friendId, sayingId);
          if (!deleted) {
            setSayingFormError('彼曰くの削除に失敗しました。');
            return;
          }
          if (editingSayingId === sayingId) {
            setIsSayingFormVisible(false);
            setEditingSayingId(null);
            setSayingText('');
            setSayingDate('');
            setSayingInputHeight(48);
            setShowSayingDatePicker(false);
          }
          loadFriend();
        },
      },
    ]);
  };

  const handleLongPressSaying = (saying: Saying) => {
    Alert.alert('操作を選択', 'この項目に対する操作を選んでください。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '編集', onPress: () => startEditSaying(saying) },
      { text: '削除', style: 'destructive', onPress: () => handleDeleteSaying(saying.id) },
    ]);
  };

  const persistTraits = (nextTraits: string[]) => {
    if (!friend) {
      return;
    }
    const normalizedTraits = nextTraits.map((item) => item.trim()).filter((item) => item.length > 0);
    const success = updateFriend(friend.id, {
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
      affiliations: friend.affiliations,
      personalities: friend.personalities,
      experiences: friend.experiences,
      traits: normalizedTraits,
      likes: friend.likes,
      dislikes: friend.dislikes,
      episodes: friend.episodes,
      sayings: friend.sayings,
    });
    if (success) {
      setFriend((prev) => (prev ? { ...prev, traits: normalizedTraits } : prev));
    }
  };

  const startCreateHabit = () => {
    setIsHabitFormVisible(true);
    setEditingHabitIndex(null);
    setHabitText('');
    setHabitInputHeight(48);
    setHabitFormError('');
  };

  const startEditHabit = (index: number) => {
    setIsHabitFormVisible(true);
    setEditingHabitIndex(index);
    setHabitText(habitNotes[index] ?? '');
    setHabitInputHeight(48);
    setHabitFormError('');
  };

  const handleSaveHabit = () => {
    const text = habitText.trim();
    if (!text) {
      setHabitFormError('習性を入力してください。');
      return;
    }
    const next = [...habitNotes];
    if (editingHabitIndex === null) {
      next.push(text);
    } else {
      next[editingHabitIndex] = text;
    }
    setHabitNotes(next);
    persistTraits(next);
    setIsHabitFormVisible(false);
    setEditingHabitIndex(null);
    setHabitText('');
    setHabitInputHeight(48);
    setHabitFormError('');
  };

  const handleDeleteHabit = (index: number) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const next = habitNotes.filter((_, itemIndex) => itemIndex !== index);
          setHabitNotes(next);
          persistTraits(next);
          if (editingHabitIndex === index) {
            setIsHabitFormVisible(false);
            setEditingHabitIndex(null);
            setHabitText('');
            setHabitInputHeight(48);
            setHabitFormError('');
          }
        },
      },
    ]);
  };

  const handleLongPressHabit = (index: number) => {
    Alert.alert('操作を選択', 'この習性に対する操作を選んでください。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '編集', onPress: () => startEditHabit(index) },
      { text: '削除', style: 'destructive', onPress: () => handleDeleteHabit(index) },
    ]);
  };

  const resetEpisodeForm = () => {
    episodeForm.reset();
  };

  const startCreateEpisode = () => {
    if (!myselfId) {
      Alert.alert('案内', '本人が設定されていません。');
      return;
    }
    episodeForm.reset();
    setIsEpisodeFormVisible(true);
  };

  const startEditEpisode = (episode: Episode) => {
    episodeForm.loadFromEpisode(episode);
    setIsEpisodeFormVisible(true);
  };

  const handleDeleteEpisode = (episodeId: string) => {
    Alert.alert('確認', '本当に削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const target = friend?.episodes.find((item) => item.id === episodeId);
          if (!target || !myselfId) {
            Alert.alert('エラー', 'エピソードの削除に失敗しました。');
            return;
          }
          const authorId = resolveEpisodeRecordOwnerId(target, myselfId);
          const deleted = deleteEpisode(authorId, episodeId);
          if (!deleted) {
            Alert.alert('エラー', 'エピソードの削除に失敗しました。');
            return;
          }
          if (episodeForm.editingEpisodeId === episodeId) {
            episodeForm.reset();
            setIsEpisodeFormVisible(false);
          }
          loadFriend();
        },
      },
    ]);
  };

  const renderSharedEpisodeItem = useCallback<ListRenderItem<Episode>>(
    ({ item: episode }) => {
      if (!friend) return null;
      const canManage = canManageEpisode(episode, friend.id, myselfId);
      const episodeOwnerId = resolveEpisodeRecordOwnerId(episode, friend.id);
      const chips = buildParticipantChips(episode, friendNameById, {
        excludeFriendIds: myselfId ? [myselfId] : [],
        friendPhotoById,
      });
      const posterName = friendNameById.get(episode.authorFriendId) ?? episode.authorFriendId;
      return (
        <View
          style={{
            backgroundColor: c.tabPaneBackground,
            borderColor: profileCardBorderColor,
            borderLeftWidth: profileChromeSideBorder,
            borderRightWidth: profileChromeSideBorder,
            // タブバー（tabTrack marginHorizontal: 12）と同じくカード端から 12
            paddingHorizontal: 12,
          }}
        >
          <EpisodeListCard
            embedded={listItemEmbedded}
            title={episode.title}
            date={episode.date}
            episodeTag={episode.tag}
            chips={chips}
            visibilityMode={canManage ? episode.visibilityMode : undefined}
            posterName={canManage ? null : posterName}
            photoUris={episodePhotoUrisById.get(episode.id) ?? []}
            onPress={() =>
              router.push({
                pathname: '/episode-detail',
                params: {
                  episodeId: episode.id,
                  ownerId: episodeOwnerId,
                },
              })
            }
            onLongPress={
              canManage
                ? () => {
                    Alert.alert('操作を選択', 'このエピソードに対する操作を選んでください。', [
                      { text: 'キャンセル', style: 'cancel' },
                      { text: '編集', onPress: () => startEditEpisode(episode) },
                      {
                        text: '削除',
                        style: 'destructive',
                        onPress: () => handleDeleteEpisode(episode.id),
                      },
                    ]);
                  }
                : undefined
            }
          />
        </View>
      );
    },
    [
      c.tabPaneBackground,
      episodePhotoUrisById,
      friend,
      friendNameById,
      friendPhotoById,
      listItemEmbedded,
      myselfId,
      profileCardBorderColor,
      profileChromeSideBorder,
      router,
      startEditEpisode,
      handleDeleteEpisode,
    ]
  );

  const renderLegacyEpisodeItem = useCallback<ListRenderItem<Episode>>(
    ({ item: episode }) => {
      if (!friend) return null;
      const canManage = canManageEpisode(episode, friend.id, myselfId);
      const episodeOwnerId = resolveEpisodeRecordOwnerId(episode, friend.id);
      const chips = buildParticipantChips(episode, friendNameById, {
        excludeFriendIds: myselfId ? [myselfId] : [],
        friendPhotoById,
      });
      const posterName = friendNameById.get(episode.authorFriendId) ?? episode.authorFriendId;
      return (
        <View
          style={{
            backgroundColor: c.tabPaneBackground,
            borderColor: profileCardBorderColor,
            borderLeftWidth: profileChromeSideBorder,
            borderRightWidth: profileChromeSideBorder,
            paddingHorizontal: 12,
          }}
        >
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/episode-detail',
              params: {
                episodeId: episode.id,
                ownerId: episodeOwnerId,
              },
            })
          }
          onLongPress={
            canManage
              ? () => {
                  Alert.alert('操作を選択', 'このエピソードに対する操作を選んでください。', [
                    { text: 'キャンセル', style: 'cancel' },
                    { text: '編集', onPress: () => startEditEpisode(episode) },
                    {
                      text: '削除',
                      style: 'destructive',
                      onPress: () => handleDeleteEpisode(episode.id),
                    },
                  ]);
                }
              : undefined
          }
          delayLongPress={300}
        >
          <View style={styles.episodeCard}>
            <View style={styles.episodeCardRow1}>
              <Text style={styles.episodeCardTitle} numberOfLines={1}>
                {episode.title || '-'}
              </Text>
              <Text style={styles.episodeCardDateText}>{formatEpisodeDateForCard(episode.date)}</Text>
              {canManage ? (
                <View
                  style={styles.visibilityModeIconWrap}
                  accessibilityRole="image"
                  accessibilityLabel={getVisibilityModeLabel(episode.visibilityMode)}
                >
                  <Ionicons
                    name={getVisibilityModeIconName(episode.visibilityMode)}
                    size={16}
                    color={getVisibilityModeIconColor(episode.visibilityMode)}
                  />
                </View>
              ) : (
                <View style={styles.episodeParticipantTag}>
                  <Text style={styles.episodeParticipantTagName} numberOfLines={1}>
                    {posterName || '-'}
                  </Text>
                </View>
              )}
            </View>
            {chips.length > 0 ? (
              <View style={styles.episodeCardRow2}>
                <View style={styles.episodeParticipantChipList}>
                  <ParticipantChipList chips={chips} layout="scroll" compact />
                </View>
              </View>
            ) : null}
          </View>
        </Pressable>
        </View>
      );
    },
    [
      c.tabPaneBackground,
      friend,
      friendNameById,
      friendPhotoById,
      myselfId,
      profileCardBorderColor,
      profileChromeSideBorder,
      router,
      styles,
      startEditEpisode,
      handleDeleteEpisode,
    ]
  );

  const episodeItemSeparator = useCallback(
    () => (
      <View
        style={{
          height: kit.episodeListCardGap,
          backgroundColor: c.tabPaneBackground,
          borderColor: profileCardBorderColor,
          borderLeftWidth: profileChromeSideBorder,
          borderRightWidth: profileChromeSideBorder,
        }}
      />
    ),
    [
      c.tabPaneBackground,
      kit.episodeListCardGap,
      profileCardBorderColor,
      profileChromeSideBorder,
    ]
  );

  const handleSaveEpisode = () => {
    if (!friend) {
      episodeForm.setFormError('人物データが見つかりません。');
      return;
    }
    if (!myselfId) {
      episodeForm.setFormError('本人が設定されていません。');
      return;
    }
    const payload = episodeForm.buildSavePayload();
    if (!payload) {
      return;
    }
    const resolved = resolveEpisodeSaveEventId(payload, () => {
      Alert.alert('エラー', EVENT_CREATE_FAILED_MESSAGE);
      episodeForm.setFormError(EVENT_CREATE_FAILED_MESSAGE);
    });
    if (!resolved.ok) {
      return;
    }
    const { createLinkedEvent: _createLinkedEvent, eventId: _formEventId, ...episodeFields } =
      payload;
    const episodeInput = {
      ...episodeFields,
      eventId: resolved.eventId,
    };

    if (episodeForm.editingEpisodeId) {
      const updated = updateEpisode(myselfId, episodeForm.editingEpisodeId, episodeInput);
      if (!updated) {
        episodeForm.setFormError('エピソードの更新に失敗しました。');
        return;
      }
      episodeForm.persistPhotos(episodeForm.editingEpisodeId, true);
    } else {
      const created = createEpisode(episodeInput);
      if (!created) {
        episodeForm.setFormError('エピソードの追加に失敗しました。');
        return;
      }
      episodeForm.persistPhotos(created.id, false);
    }
    episodeForm.reset();
    setIsEpisodeFormVisible(false);
    loadFriend();
  };

  if (!friend) {
    return (
      <TabScreenTemplate
        contentContainerStyle={{ flex: 1 }}
        safeAreaEdges={
          useSharedHeaderChrome || !showLocalDetailHeader
            ? ['right', 'left']
            : ['top', 'right', 'left']
        }
        header={
          showLocalDetailHeader ? (
            <ScreenTopBar title="詳細" onBack={navigateHome} />
          ) : undefined
        }
      >
        {hasAttemptedFriendLoad ? (
          <View style={styles.missingContainer}>
            <Text style={styles.missingText}>人物データが見つかりませんでした。</Text>
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: appTheme.screenBackground }} />
        )}
      </TabScreenTemplate>
    );
  }

  const openProfileSwitcher = () => {
    if (!friend || selectableProfiles.length === 0) {
      return;
    }
    const buttons = selectableProfiles.map((profile) => {
      const isSelf = profile.source === 'self' || (myselfId !== null && profile.authorUserId === myselfId);
      const label = isSelf
        ? 'me'
        : profile.authorUserId
          ? friendNameById.get(profile.authorUserId) ?? ''
          : '';
      return {
        text: label ? `by ${label}` : profile.name || 'プロフィール',
        onPress: () => {
          const changed = setDefaultProfile(friend.id, profile.id);
          if (changed) {
            loadFriend();
          }
        },
      };
    });
    Alert.alert('プロフィール切替', '表示するプロフィールを選択してください。', [
      ...buttons,
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  return (
    <>
      <TabScreenTemplate
        scrollable={false}
        useScreenPadding={false}
        safeAreaEdges={
          useSharedHeaderChrome || !showLocalDetailHeader
            ? ['right', 'left']
            : ['top', 'right', 'left']
        }
        contentContainerStyle={[
          styles.scrollContent,
          { flex: 1, paddingBottom: 0 },
          isMonochromeTheme ? { paddingTop: 0 } : null,
        ]}
        extraScrollHeight={18}
        header={
          showLocalDetailHeader ? (
          <ScreenTopBar
            title="Profile"
            onBack={navigateHome}
            titleLeading={
              <Pressable
                onPress={() => goToAdjacentFriend(homeAdjacentFriendIds.prevId, 'prev')}
                disabled={!homeAdjacentFriendIds.prevId}
                accessibilityLabel="前の人物"
                hitSlop={8}
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={
                    homeAdjacentFriendIds.prevId ? appTheme.topBarText : appTheme.topBarTextMuted
                  }
                />
              </Pressable>
            }
            titleTrailing={
              <Pressable
                onPress={() => goToAdjacentFriend(homeAdjacentFriendIds.nextId, 'next')}
                disabled={!homeAdjacentFriendIds.nextId}
                accessibilityLabel="次の人物"
                hitSlop={8}
                style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={
                    homeAdjacentFriendIds.nextId ? appTheme.topBarText : appTheme.topBarTextMuted
                  }
                />
              </Pressable>
            }
          />
          ) : undefined
        }
      >
        <GestureDetector gesture={detailBodySwipeGesture}>
        <View style={{ overflow: 'hidden', width: '100%', flex: 1 }}>
          {adjacentTransition ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: screenWidth,
                    zIndex: 1,
                    backgroundColor: appTheme.screenBackground,
                  },
                  outgoingSlideStyle,
                ]}
              >
                <DetailAdjacentSlidePanel
                  snapshot={adjacentTransition.outgoing}
                  styles={styles}
                  detailTabs={detailTabs}
                  bundle={bundle}
                  c={c}
                  isMonochromeTheme={isMonochromeTheme}
                  isFlatProfileCard={isFlatProfileCard}
                />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: screenWidth,
                    zIndex: 2,
                    backgroundColor: appTheme.screenBackground,
                  },
                  incomingSlideStyle,
                ]}
              >
                <DetailAdjacentSlidePanel
                  snapshot={adjacentTransition.incoming}
                  styles={styles}
                  detailTabs={detailTabs}
                  bundle={bundle}
                  c={c}
                  isMonochromeTheme={isMonochromeTheme}
                  isFlatProfileCard={isFlatProfileCard}
                />
              </Animated.View>
            </>
          ) : null}
          <View
            style={{
              flex: 1,
              opacity: adjacentTransition ? 0 : 1,
            }}
            pointerEvents={adjacentTransition ? 'none' : 'auto'}
          >
            <FlatList
                ref={detailListRef}
                style={{ flex: 1, marginHorizontal: isFlatProfileCard ? 0 : 6 }}
                data={isEpisodeTab ? filteredEpisodes : []}
                keyExtractor={(item) => item.id}
                renderItem={useSharedEpisodeCard ? renderSharedEpisodeItem : renderLegacyEpisodeItem}
                ItemSeparatorComponent={episodeItemSeparator}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                initialNumToRender={6}
                maxToRenderPerBatch={6}
                windowSize={7}
                removeClippedSubviews
                showsVerticalScrollIndicator
                onScroll={(event) => {
                  detailScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                contentContainerStyle={{
                  paddingBottom:
                    (bottomNavClearance > 0 ? 60 : Spacing.lg) +
                    (isNoteFormOpen ? keyboardBottomInset : 0),
                }}
                ListHeaderComponentStyle={{ marginBottom: 0 }}
                ListEmptyComponent={
                  isEpisodeTab ? (
                  <View
                    style={{
                      backgroundColor: c.tabPaneBackground,
                      borderColor: profileCardBorderColor,
                      borderLeftWidth: profileChromeSideBorder,
                      borderRightWidth: profileChromeSideBorder,
                      paddingHorizontal: 12,
                      paddingTop: 8,
                      paddingBottom: 10,
                    }}
                  >
                    <Text style={styles.emptyEpisodeText}>該当するエピソードはありません。</Text>
                  </View>
                  ) : null
                }
                ListFooterComponent={
                  isEpisodeTab ? (
                  filteredEpisodes.length === 0 ? (
                    <View
                      style={{
                        backgroundColor: c.tabPaneBackground,
                        borderColor: profileCardBorderColor,
                        borderLeftWidth: profileChromeSideBorder,
                        borderRightWidth: profileChromeSideBorder,
                        borderBottomWidth: isFlatProfileCard ? 0 : Theme.homeCardBorderWidth,
                        borderBottomLeftRadius: isFlatProfileCard ? 0 : 12,
                        borderBottomRightRadius: isFlatProfileCard ? 0 : 12,
                        height: 10,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        backgroundColor: c.tabPaneBackground,
                        borderColor: profileCardBorderColor,
                        borderLeftWidth: profileChromeSideBorder,
                        borderRightWidth: profileChromeSideBorder,
                        borderBottomWidth: isFlatProfileCard ? 0 : Theme.homeCardBorderWidth,
                        borderBottomLeftRadius: isFlatProfileCard ? 0 : 12,
                        borderBottomRightRadius: isFlatProfileCard ? 0 : 12,
                        paddingBottom: 10,
                      }}
                    />
                  )
                  ) : null
                }
                ListHeaderComponent={
                  <>
            <View
              style={[
                styles.profileCardShadow,
                { marginHorizontal: 0 },
                isEpisodeTab
                  ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
                  : null,
                profileCardShadowFlatStyle,
              ]}
            >
        <View
          style={[
            styles.profileCardOuter,
            {
              borderColor: profileCardBorderColor,
              borderWidth: Theme.homeCardBorderWidth,
              ...(isEpisodeTab
                ? {
                    borderBottomWidth: 0,
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                  }
                : null),
            },
            profileCardOuterFlatStyle,
          ]}
        >
        <View
          style={[
            styles.hero,
            profileHeroFlatStyle,
            isMonochromeTheme ? { paddingTop: 8 } : null,
          ]}
        >
          <View style={styles.heroIdentityRow}>
            <View
              style={[
                styles.heroPhotoOuterFrame,
                heroPhotoOuterStyle,
              ]}
            >
              <View style={[styles.heroPhotoInnerFrame, heroPhotoInnerStyle]}>
                {friend.photoUri && profileImageStatus !== 'failed' ? (
                  <Image
                    source={{ uri: friend.photoUri }}
                    style={styles.heroPhoto}
                    resizeMode="cover"
                    onLoad={() => setProfileImageStatus('loaded')}
                    onError={() => setProfileImageStatus('failed')}
                  />
                ) : (
                  <View style={styles.heroPhotoPlaceholder}>
                    <Text style={styles.heroPhotoPlaceholderText}>No Image</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.heroIdentityCol}>
              <View style={styles.heroNameRow}>
                <Text style={styles.heroName} numberOfLines={2}>
                  {friend.name}
                </Text>
                <Pressable
                  style={styles.heroEditButton}
                  onPress={() => router.push({ pathname: '/edit', params: { id: friend.id } })}
                  accessibilityLabel="編集"
                  hitSlop={8}
                >
                  <Ionicons name="pencil-outline" size={16} color={c.accent} />
                </Pressable>
              </View>
              {(friend.nickname.trim() || friend.importSource === 'qr_scan') ? (
                <View style={styles.heroNicknameRow}>
                  {friend.nickname.trim() ? (
                    <Text style={styles.heroNickname}>{friend.nickname}</Text>
                  ) : null}
                  {friend.importSource === 'qr_scan' ? (
                    <Ionicons name="qr-code-outline" size={14} color={c.textMuted} />
                  ) : null}
                </View>
              ) : null}
              {selectableProfiles.length > 0 ? (
                <Pressable onPress={openProfileSwitcher}>
                  <Text style={styles.heroByTag}>
                    {profileTagLabel ? `by ${profileTagLabel}` : 'プロフィールを切り替え'}
                  </Text>
                </Pressable>
              ) : null}
              {friend.mbti || heroBirthdayLabel || friend.category.trim() ? (
                <View style={styles.heroTagRow}>
                  {friend.mbti ? (
                    <View style={styles.heroTagMbti}>
                      <Text style={styles.heroTagMbtiText}>{friend.mbti}</Text>
                    </View>
                  ) : null}
                  {heroBirthdayLabel ? (
                    <View style={styles.heroTagBirthday}>
                      <Text style={styles.heroTagBirthdayText}>{heroBirthdayLabel}</Text>
                    </View>
                  ) : null}
                  {friend.category.trim() ? (
                    <View style={styles.heroTagCategory}>
                      <Text style={styles.heroTagCategoryText}>{friend.category}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {friend.description.trim() ? (
                <Text style={styles.heroDescription}>{friend.description}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCell}>
              <Text style={styles.heroStatLabel}>EPISODES</Text>
              <View style={styles.heroStatValueRow}>
                <Text style={styles.heroStatValue}>{friend.episodes.length}</Text>
                <Text style={styles.heroStatUnit}>件</Text>
              </View>
            </View>
            <View style={styles.heroStatCell}>
              <Text style={styles.heroStatLabel}>習性 + 彼曰く</Text>
              <View style={styles.heroStatValueRow}>
                <Text style={styles.heroStatValue}>{habitNotes.length + sortedSayings.length}</Text>
                <Text style={styles.heroStatUnit}>件</Text>
              </View>
            </View>
            <View style={styles.heroStatCell}>
              <Text style={styles.heroStatLabel}>SINCE</Text>
              <View style={styles.heroStatValueRow}>
                <Text style={styles.heroStatValue}>{sinceYear}</Text>
                <Text style={styles.heroStatUnit}>年〜</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroCompletenessSection}>
            <View style={styles.heroCompletenessHeader}>
              <Text style={styles.heroCompletenessLabel}>PROFILE COMPLETENESS</Text>
              <Text style={styles.heroCompletenessPercent}>
                {isProfileCompletenessReady ? `${profileCompleteness}%` : ''}
              </Text>
            </View>
            <View style={styles.heroCompletenessTrack}>
              <View
                style={[
                  styles.heroCompletenessFill,
                  { width: `${isProfileCompletenessReady ? profileCompleteness : 0}%` },
                ]}
              />
            </View>
          </View>
        </View>

        <View
          style={[
            styles.tabSection,
            isEpisodeTab ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null,
            profileTabSectionFlatStyle,
          ]}
        >
          <View style={styles.tabTrack}>
            <View style={styles.tabInner}>
              {detailTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                const activeColor = bundle.tabMode === 'perTab' ? tab.color : c.accent;
                // 非選択: メインはカテゴリ色そのまま / ライトは tabInactive（半透明化しない）
                const inactiveIconBg = bundle.tabMode === 'perTab' ? tab.color : c.tabInactive;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setActiveTab(tab.key)}
                    style={[
                      styles.tabPill,
                      isActive
                        ? {
                            borderColor: activeColor,
                            backgroundColor: activeColor,
                          }
                        : null,
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={tab.key}
                  >
                    <View style={styles.tabPillContent}>
                      <View
                        style={[
                          styles.tabPillIconCircle,
                          isActive
                            ? styles.tabPillIconCircleActive
                            : { backgroundColor: inactiveIconBg },
                        ]}
                      >
                        {tab.iconSet === 'material' ? (
                          <MaterialCommunityIcons
                            name={tab.icon as ComponentProps<typeof MaterialCommunityIcons>['name']}
                            size={16}
                            color={c.onAccent}
                          />
                        ) : (
                          <Ionicons
                            name={tab.icon as ComponentProps<typeof Ionicons>['name']}
                            size={16}
                            color={c.onAccent}
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.tabPillCaption,
                          isActive ? styles.tabPillCaptionActive : styles.tabPillCaptionInactive,
                        ]}
                      >
                        {tab.caption}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>


          <View style={styles.tabContentArea}>
          {activeTab === 'エピソード' && (
            <View style={[styles.tabPane, { paddingBottom: 0 }]}>
            <View style={styles.episodeToolbarRow}>
              <Pressable
                style={[styles.episodeFilterField, styles.episodeParticipantFilterField]}
                onPress={openEpisodeParticipantPicker}
              >
                <Text style={styles.episodeFilterFieldLabel}>参加者</Text>
                <Text style={styles.episodeFilterFieldValue} numberOfLines={1}>
                  {episodeParticipantFilterSummary}
                </Text>
              </Pressable>
              <TextInput
                style={[styles.episodeFilterField, styles.episodeTitleFilterField]}
                placeholder="タイトル"
                placeholderTextColor={c.inputPlaceholder}
                value={episodeTitleDraft}
                onChangeText={setEpisodeTitleDraft}
                onSubmitEditing={handleEpisodeTitleSubmit}
                returnKeyType="search"
                blurOnSubmit
                autoCapitalize="none"
              />
              <Pressable
                style={styles.episodeToolbarAddButton}
                onPress={() => {
                  if (isEpisodeFormVisible && !episodeForm.editingEpisodeId) {
                    episodeForm.reset();
                    setIsEpisodeFormVisible(false);
                  } else {
                    startCreateEpisode();
                  }
                }}
              >
                <Text style={styles.episodeAddButtonText}>
                  {isEpisodeFormVisible && !episodeForm.editingEpisodeId ? '閉じる' : '+ 追加'}
                </Text>
              </Pressable>
            </View>

            {isEpisodeParticipantPickerOpen && (
              <View style={styles.episodeParticipantPickerPanel}>
                <View
                  style={styles.episodeParticipantPickerGrid}
                  onLayout={(event) => {
                    const width = event.nativeEvent.layout.width;
                    if (width > 0) {
                      setEpisodePickerGridWidth(width);
                    }
                  }}
                >
                  {episodePickerFriends.map((person) => {
                    const checked = episodeFilterSelectedIdsDraft.has(person.id);
                    return (
                      <Pressable
                        key={person.id}
                        style={[styles.episodePersonRow, { width: episodePickerCardWidth }]}
                        onPress={() => toggleEpisodeFilterParticipant(person.id)}
                      >
                        <View
                          style={[styles.episodePersonCheckbox, checked && styles.episodePersonCheckboxChecked]}
                        >
                          {checked ? <Text style={styles.episodePersonCheckmark}>✓</Text> : null}
                        </View>
                        <Text style={styles.episodePersonName} numberOfLines={1}>
                          {person.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable style={styles.episodePickerSearchButton} onPress={handleParticipantPickerSearch}>
                  <Text style={styles.episodeSearchButtonText}>検索</Text>
                </Pressable>
              </View>
            )}

            </View>
          )}

          {activeTab === '情報' && (
            <MultiValueSummarySection
              withCard
              styles={styles}
              infoChipStyles={bundle.infoChipStyles}
              colors={c}
              rows={[
                { title: '所属', values: friend.affiliations },
                { title: '経験', values: friend.experiences },
                { title: '性格', values: friend.personalities },
                { title: '好物', values: friend.likes },
                { title: '苦手', values: friend.dislikes },
              ]}
            />
          )}

          {activeTab === 'ステータス' && (
            <View style={styles.tabContentFrame}>
              {[
                { label: '出身', value: friend.origin.trim() || '—' },
                { label: '居住地', value: friend.residence.trim() || '—' },
                { label: '誕生日', value: heroBirthdayLabel || '—' },
                {
                  label: '身長',
                  value: friend.height != null ? `${friend.height} cm` : '—',
                },
                {
                  label: '体重',
                  value: friend.weight != null ? `${friend.weight} kg` : '—',
                },
              ].map((row, index, rows) => (
                <View
                  key={row.label}
                  style={[styles.statusRow, index < rows.length - 1 && styles.statusRowDivider]}
                >
                  <Text style={styles.statusLabel}>{row.label}</Text>
                  <Text style={styles.statusValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          )}

          {(activeTab === '習性' || activeTab === 'メモ') && (
            <View style={styles.tabPane}>
            <View style={styles.sayingTopRow}>
              <View />
              <Pressable
                style={styles.episodeAddButton}
                onPress={() => {
                  if (isHabitFormVisible && editingHabitIndex === null) {
                    setIsHabitFormVisible(false);
                    setHabitText('');
                    setHabitInputHeight(48);
                    setHabitFormError('');
                  } else {
                    startCreateHabit();
                  }
                }}
              >
                <Text style={styles.episodeAddButtonText}>
                  {isHabitFormVisible && editingHabitIndex === null ? '閉じる' : '+ 追加'}
                </Text>
              </Pressable>
            </View>

            {isHabitFormVisible && (
              <View ref={noteFormAnchorRef} collapsable={false} style={styles.sayingFormCard}>
                <TextInput
                  style={[styles.sayingTextInput, { height: Math.max(48, habitInputHeight) }]}
                  placeholder="習性（自由記入）"
                  placeholderTextColor={c.inputPlaceholder}
                  multiline
                  value={habitText}
                  onContentSizeChange={(event) => {
                    setHabitInputHeight(event.nativeEvent.contentSize.height + 20);
                    if (keyboardBottomInset > 0) {
                      setTimeout(() => scrollNoteFormAboveKeyboard(), 50);
                    }
                  }}
                  onChangeText={setHabitText}
                  onFocus={() => {
                    setTimeout(() => scrollNoteFormAboveKeyboard(), 80);
                  }}
                />
                <View style={styles.sayingActionRow}>
                  <Pressable
                    style={styles.episodeCancelButton}
                    onPress={() => {
                      setIsHabitFormVisible(false);
                      setEditingHabitIndex(null);
                      setHabitText('');
                      setHabitInputHeight(48);
                      setHabitFormError('');
                    }}
                  >
                    <Text style={styles.episodeCancelButtonText}>閉じる</Text>
                  </Pressable>
                  <Pressable style={styles.episodeCreateButton} onPress={handleSaveHabit}>
                    <Text style={styles.episodeCreateButtonText}>登録</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {habitFormError ? <Text style={styles.episodeErrorText}>{habitFormError}</Text> : null}

            {habitNotes.length === 0 ? (
              <Text style={styles.emptyEpisodeText}>登録済みの習性はありません。</Text>
            ) : (
              habitNotes.map((note, index) => (
                <Pressable
                  key={`habit-${index}`}
                  style={styles.habitCard}
                  onLongPress={() => handleLongPressHabit(index)}
                  delayLongPress={300}
                >
                  <View style={styles.habitCardAccent} />
                  <Text style={styles.habitCardText}>{note}</Text>
                </Pressable>
              ))
            )}
            </View>
          )}

          {activeTab === '彼曰く' && (
            <View style={styles.tabPane}>
            <View style={styles.sayingTopRow}>
              <View />
              <Pressable
                style={styles.episodeAddButton}
                onPress={() => {
                  if (isSayingFormVisible && !editingSayingId) {
                    setIsSayingFormVisible(false);
                    setSayingFormError('');
                    setSayingText('');
                    setSayingDate('');
                    setSayingInputHeight(48);
                    setShowSayingDatePicker(false);
                  } else {
                    startCreateSaying();
                  }
                }}
              >
                <Text style={styles.episodeAddButtonText}>
                  {isSayingFormVisible && !editingSayingId ? '閉じる' : '+ 追加'}
                </Text>
              </Pressable>
            </View>

            {isSayingFormVisible && (
              <View ref={noteFormAnchorRef} collapsable={false} style={styles.sayingFormCard}>
                <TextInput
                  style={[styles.sayingTextInput, { height: Math.max(48, sayingInputHeight) }]}
                  placeholder="彼曰く（自由記入）"
                  placeholderTextColor={c.inputPlaceholder}
                  multiline
                  value={sayingText}
                  onContentSizeChange={(event) => {
                    setSayingInputHeight(event.nativeEvent.contentSize.height + 20);
                    if (keyboardBottomInset > 0) {
                      setTimeout(() => scrollNoteFormAboveKeyboard(), 50);
                    }
                  }}
                  onChangeText={setSayingText}
                  onFocus={() => {
                    setTimeout(() => scrollNoteFormAboveKeyboard(), 80);
                  }}
                />
                <Pressable
                  style={[styles.episodeInput, styles.sayingDateInput]}
                  onPress={() => setShowSayingDatePicker(true)}
                >
                  <Text style={sayingDate ? styles.episodeDateText : styles.episodeDatePlaceholder}>
                    {sayingDate || 'YYYY-MM-DD（任意）'}
                  </Text>
                </Pressable>
                {showSayingDatePicker && (
                  <View style={styles.datePickerWrap}>
                    <DateTimePicker
                      value={parseDateString(sayingDate)}
                      mode="date"
                      display="spinner"
                      locale="ja-JP"
                      style={styles.datePickerSelf}
                      {...dateTimePickerProps}
                      onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                        if (Platform.OS !== 'ios') setShowSayingDatePicker(false);
                        if (selected) setSayingDate(formatDateToYMD(selected));
                      }}
                    />
                    <Pressable style={styles.datePickerDone} onPress={() => setShowSayingDatePicker(false)}>
                      <Text style={styles.datePickerDoneText}>完了</Text>
                    </Pressable>
                  </View>
                )}
                <View style={styles.sayingActionRow}>
                  <Pressable
                    style={styles.episodeCancelButton}
                    onPress={() => {
                      setIsSayingFormVisible(false);
                      setEditingSayingId(null);
                      setSayingText('');
                      setSayingDate('');
                      setSayingInputHeight(48);
                      setShowSayingDatePicker(false);
                      setSayingFormError('');
                    }}
                  >
                    <Text style={styles.episodeCancelButtonText}>閉じる</Text>
                  </Pressable>
                  <Pressable style={styles.episodeCreateButton} onPress={handleSaveSayings}>
                    <Text style={styles.episodeCreateButtonText}>登録</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {sayingFormError ? <Text style={styles.episodeErrorText}>{sayingFormError}</Text> : null}

            {sortedSayings.length === 0 ? (
              <Text style={styles.emptyEpisodeText}>登録済みの彼曰くはありません。</Text>
            ) : (
              sortedSayings.map((saying: Saying) => (
                <Pressable
                  key={saying.id}
                  style={styles.sayingQuoteCard}
                  onLongPress={() => handleLongPressSaying(saying)}
                  delayLongPress={300}
                >
                  <View style={styles.sayingQuoteAccent} />
                  <View style={styles.sayingQuoteBody}>
                    <Text style={styles.sayingQuoteText}>{saying.text}</Text>
                    {saying.date ? <Text style={styles.sayingQuoteDate}>{saying.date}</Text> : null}
                  </View>
                </Pressable>
              ))
            )}
            </View>
          )}
          </View>
        </View>
        </View>
        </View>
                  </>
                }
              />
          </View>
        </View>
        </GestureDetector>
      </TabScreenTemplate>
      <EpisodeFormOverlay
        visible={isEpisodeFormVisible}
        form={episodeForm}
        friends={allFriends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        episodeTagOptions={episodeTagOptions}
        onClose={() => {
          episodeForm.reset();
          setIsEpisodeFormVisible(false);
        }}
        onSave={handleSaveEpisode}
      />
    </>
  );
}