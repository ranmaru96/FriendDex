import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Theme, Radius, Spacing } from '@/constants/theme';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { PillTabBar, type PillTabItem } from '@/components/screen/PillTabBar';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { MoneyLoanSessionCard } from '@/components/money-loan/MoneyLoanSessionCard';
import { MoneyLoanSessionEditModal } from '@/components/money-loan/MoneyLoanSessionEditModal';
import { useMoneyLoanFormStyles } from '@/components/money-loan/moneyLoanFormStyles';
import { MoneyLoanRecentCounterpartyChips } from '@/components/money-loan/MoneyLoanRecentCounterpartyChips';
import {
  createMoneyLoans,
  deleteMoneyLoanSession,
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getEpisodeParticipantFriendIds,
  getMoneyLoanSessions,
  getMoneyLoans,
  getMoneyLoanSession,
  getMyself,
  getOrCreateMoneyLoanSessionByTitle,
  initializeDatabase,
  setMoneyLoanRepaid,
} from '../../db';
import type { Friend, MoneyLoan, MoneyLoanDirection, MoneyLoanSession } from '../../types';
import { buildParticipantChipDisplays } from '../../utils/episodeHelpers';
import {
  buildActiveMoneyLoanSessionSummaries,
  buildFriendNameById,
  buildMoneyLoanParticipantsFromSelectorPicks,
  buildMoneyLoanPersonAggregates,
  buildSessionTitleById,
  buildSettledMoneyLoanSessionSummaries,
  formatMoneyLoanDateLabel,
  formatYen,
  getMoneyLoanSplitCount,
  resolveMoneyLoanSessionTitle,
  splitAmountEvenly,
} from '../../utils/moneyLoanHelpers';
import {
  buildMoneyLoanCounterpartyFriends,
  getRecentTogetherFriendIdsFromPastEvents,
} from '../../utils/eventRecencyHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

type MoneyLoanTab = 'register' | 'lent' | 'borrowed';
type RegisterMode = 'split' | 'individual';
type Option = { label: string; value: string };

type IndividualLineDraft = {
  friendId: string;
  amountText: string;
  direction: MoneyLoanDirection;
};

const TAB_LABELS: Record<MoneyLoanTab, string> = {
  register: '登録',
  lent: '貸',
  borrowed: '借',
};

const MONEY_LOAN_TABS: PillTabItem<MoneyLoanTab>[] = [
  { key: 'register', caption: TAB_LABELS.register, icon: 'create-outline', color: Theme.accent },
  { key: 'lent', caption: TAB_LABELS.lent, icon: 'arrow-up-circle-outline', color: '#4a7fd4' },
  { key: 'borrowed', caption: TAB_LABELS.borrowed, icon: 'arrow-down-circle-outline', color: '#e07a2a' },
];

function buildFriendPhotoById(friends: Friend[]): Map<string, string | null> {
  return new Map(friends.map((friend) => [friend.id, friend.photoUri ?? null]));
}

function parseYenInput(value: string): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

export default function MoneyLoanScreen() {
  const router = useRouter();
  const formStyles = useMoneyLoanFormStyles();
  const content = useContentColors();
  const [activeTab, setActiveTab] = useState<MoneyLoanTab>('register');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sessions, setSessions] = useState<MoneyLoanSession[]>([]);
  const [loans, setLoans] = useState<MoneyLoan[]>([]);

  const [title, setTitle] = useState(() => resolveMoneyLoanSessionTitle(''));
  const [registerMode, setRegisterMode] = useState<RegisterMode>('split');
  const [totalAmountText, setTotalAmountText] = useState('');
  const [participants, setParticipants] = useState<EpisodeParticipantDraft[]>([]);
  const [individualLines, setIndividualLines] = useState<IndividualLineDraft[]>([]);
  const [formError, setFormError] = useState('');

  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());
  const [editSession, setEditSession] = useState<MoneyLoanSession | null>(null);
  const [myselfId, setMyselfId] = useState<string | null>(null);

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);
  const counterpartyFriends = useMemo(
    () => buildMoneyLoanCounterpartyFriends(friends, myselfId),
    [friends, myselfId]
  );
  const sessionTitleById = useMemo(() => buildSessionTitleById(sessions), [sessions]);

  const loadData = useCallback(() => {
    initializeDatabase();
    setFriends(getAllFriends());
    setMyselfId(getMyself());
    setSessions(getMoneyLoanSessions());
    setLoans(getMoneyLoans());
    setAffiliationOptions(getDistinctAffiliations().map((value) => ({ label: value, value })));
    setExperienceOptions(getDistinctExperiences().map((value) => ({ label: value, value })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const participantEntries = useMemo(
    () =>
      participants
        .filter((participant) => participant.value.trim().length > 0)
        .map((participant) => ({
          kind: participant.participantType,
          value: participant.value,
        })),
    [participants]
  );

  const counterpartyFriendIds = useMemo(
    () => getEpisodeParticipantFriendIds({ participantEntries }),
    [participantEntries]
  );

  const participantChips = useMemo(
    () =>
      buildParticipantChipDisplays(
        counterpartyFriendIds.map((friendId) => ({ kind: 'individual' as const, value: friendId })),
        friendNameById,
        { friendPhotoById }
      ),
    [counterpartyFriendIds, friendNameById, friendPhotoById]
  );

  const parsedTotalAmount = useMemo(() => parseYenInput(totalAmountText), [totalAmountText]);

  const splitPreview = useMemo(() => {
    if (registerMode !== 'split' || counterpartyFriendIds.length <= 0 || parsedTotalAmount <= 0) {
      return null;
    }
    const splitCount = getMoneyLoanSplitCount(counterpartyFriendIds.length);
    const amounts = splitAmountEvenly(parsedTotalAmount, splitCount);
    const friendAmounts = amounts.slice(0, counterpartyFriendIds.length);
    const perPerson = friendAmounts[0] ?? 0;
    const hasRemainder = friendAmounts.some((amount) => amount !== perPerson);
    if (!hasRemainder) {
      return `各人 ${formatYen(perPerson)}（参加者${counterpartyFriendIds.length}人＋本人の${splitCount}人で${formatYen(parsedTotalAmount)}を割勘・貸した）`;
    }
    return `参加者${counterpartyFriendIds.length}人＋本人の${splitCount}人で${formatYen(parsedTotalAmount)}を割勘（端数あり・貸した）`;
  }, [counterpartyFriendIds.length, parsedTotalAmount, registerMode]);

  const activeSessionSummaries = useMemo(
    () => buildActiveMoneyLoanSessionSummaries(sessions, loans),
    [loans, sessions]
  );

  const settledSessionSummaries = useMemo(
    () => buildSettledMoneyLoanSessionSummaries(sessions, loans),
    [loans, sessions]
  );

  const lentAggregates = useMemo(
    () => buildMoneyLoanPersonAggregates(loans, 'lent', sessionTitleById, friendNameById),
    [friendNameById, loans, sessionTitleById]
  );

  const borrowedAggregates = useMemo(
    () => buildMoneyLoanPersonAggregates(loans, 'borrowed', sessionTitleById, friendNameById),
    [friendNameById, loans, sessionTitleById]
  );

  const validCounterpartyFriendIdSet = useMemo(
    () => new Set(counterpartyFriends.map((friend) => friend.id)),
    [counterpartyFriends]
  );

  const recentCounterpartyFriendIds = useMemo(
    () =>
      getRecentTogetherFriendIdsFromPastEvents({
        validFriendIds: validCounterpartyFriendIdSet,
        excludeFriendId: myselfId,
      }),
    [myselfId, validCounterpartyFriendIdSet]
  );

  const selectedCounterpartyFriendIdSet = useMemo(
    () => new Set(counterpartyFriendIds),
    [counterpartyFriendIds]
  );

  const removeCounterpartyFriend = useCallback((friendId: string) => {
    setParticipants((prev) =>
      prev.filter((participant) => !(participant.participantType === 'individual' && participant.value === friendId))
    );
  }, []);

  const addCounterpartyFriend = useCallback((friendId: string) => {
    setParticipants((prev) => {
      if (prev.some((participant) => participant.participantType === 'individual' && participant.value === friendId)) {
        return prev;
      }
      return [...prev, { participantType: 'individual', value: friendId }];
    });
  }, []);

  useEffect(() => {
    if (registerMode !== 'individual') {
      return;
    }
    setIndividualLines((prev) =>
      counterpartyFriendIds.map((friendId) => {
        const existing = prev.find((line) => line.friendId === friendId);
        return (
          existing ?? {
            friendId,
            amountText: '',
            direction: 'lent',
          }
        );
      })
    );
  }, [counterpartyFriendIds, registerMode]);

  const restoreSelectorFromParticipants = useCallback((drafts: EpisodeParticipantDraft[]) => {
    const individuals = new Set<string>();
    const groups = new Set<string>();
    drafts.forEach((participant) => {
      if (!participant.value.trim()) return;
      if (participant.participantType === 'individual') {
        individuals.add(participant.value);
      } else {
        groups.add(participant.value);
      }
    });
    setSelectedIndividualIds(individuals);
    setSelectedGroupValues(groups);
  }, []);

  const openParticipantSelector = useCallback(() => {
    restoreSelectorFromParticipants(participants);
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  }, [participants, restoreSelectorFromParticipants]);

  const handleSelectorCancel = useCallback(() => {
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, []);

  const handleSelectorConfirm = useCallback(() => {
    const nextParticipants = buildMoneyLoanParticipantsFromSelectorPicks(
      selectedIndividualIds,
      selectedGroupValues
    ).filter((participant) => !myselfId || participant.value !== myselfId);
    setParticipants(nextParticipants);
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, [myselfId, selectedGroupValues, selectedIndividualIds]);

  const toggleSelectorIndividual = useCallback((friendId: string) => {
    setSelectedIndividualIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  }, []);

  const toggleSelectorGroup = useCallback((groupValue: string) => {
    setSelectedGroupValues((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) next.delete(groupValue);
      else next.add(groupValue);
      return next;
    });
  }, []);

  const resetRegisterForm = () => {
    setTitle(resolveMoneyLoanSessionTitle(''));
    setParticipants([]);
    setIndividualLines([]);
    setTotalAmountText('');
    setFormError('');
  };

  const handleRegister = () => {
    const resolvedTitle = resolveMoneyLoanSessionTitle(title);
    if (resolvedTitle !== title.trim()) {
      setTitle(resolvedTitle);
    }
    const session = getOrCreateMoneyLoanSessionByTitle(resolvedTitle);
    if (!session) {
      setFormError('登録に失敗しました。');
      return;
    }
    if (counterpartyFriendIds.length === 0) {
      setFormError(registerMode === 'individual' ? '相手を1人以上選んでください。' : '参加者を1人以上選んでください。');
      return;
    }

    let lines: { kind: 'friend'; value: string; amount: number; direction: MoneyLoanDirection }[] = [];

    if (registerMode === 'split') {
      if (parsedTotalAmount <= 0) {
        setFormError('金額を入力してください。');
        return;
      }
      const splitCount = getMoneyLoanSplitCount(counterpartyFriendIds.length);
      const amounts = splitAmountEvenly(parsedTotalAmount, splitCount);
      lines = counterpartyFriendIds.map((friendId, index) => ({
        kind: 'friend',
        value: friendId,
        amount: amounts[index] ?? 0,
        direction: 'lent',
      }));
    } else {
      const lineMap = new Map(individualLines.map((line) => [line.friendId, line]));
      lines = counterpartyFriendIds.map((friendId) => {
        const draft = lineMap.get(friendId);
        return {
          kind: 'friend' as const,
          value: friendId,
          amount: parseYenInput(draft?.amountText ?? ''),
          direction: draft?.direction ?? 'lent',
        };
      });
      if (lines.some((line) => line.amount <= 0)) {
        setFormError('各人の金額を入力してください。');
        return;
      }
    }

    const created = createMoneyLoans({
      sessionId: session.id,
      lines,
    });
    if (created.length === 0) {
      setFormError('登録に失敗しました。');
      return;
    }

    resetRegisterForm();
    loadData();
  };

  const handleToggleRepaid = (loanId: string) => {
    const loan = loans.find((entry) => entry.id === loanId);
    if (!loan) {
      return;
    }
    const ok = setMoneyLoanRepaid(loanId, !loan.isRepaid);
    if (!ok) {
      Alert.alert('エラー', '返済状態の更新に失敗しました。');
      return;
    }
    loadData();
  };

  const handleDeleteSession = (sessionId: string, sessionTitle: string) => {
    Alert.alert('削除確認', `「${sessionTitle}」とすべての記録を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const ok = deleteMoneyLoanSession(sessionId);
          if (!ok) {
            Alert.alert('エラー', '削除に失敗しました。');
            return;
          }
          loadData();
        },
      },
    ]);
  };

  const openEditSession = (session: MoneyLoanSession) => {
    setEditSession(session);
  };

  const closeEditSession = () => {
    setEditSession(null);
  };

  const updateIndividualLine = (
    friendId: string,
    patch: Partial<Pick<IndividualLineDraft, 'amountText' | 'direction'>>
  ) => {
    setIndividualLines((prev) =>
      prev.map((line) => (line.friendId === friendId ? { ...line, ...patch } : line))
    );
  };

  const renderDirectionTab = (direction: 'lent' | 'borrowed') => {
    const aggregates = direction === 'lent' ? lentAggregates : borrowedAggregates;
    const emptyLabel = direction === 'lent' ? '未返済の貸しはありません。' : '未返済の借りはありません。';

    if (aggregates.length === 0) {
      return <Text style={formStyles.emptyTextOnBase}>{emptyLabel}</Text>;
    }

    return aggregates.map((aggregate) => (
      <View key={aggregate.counterpartyKey} style={[styles.personCard, contentSurfaceStyle(content)]}>
        <View style={styles.personCardHeader}>
          <Text style={[styles.personName, contentTextStyle(content)]} numberOfLines={1}>
            {aggregate.displayName}
          </Text>
          <Text style={[styles.personTotal, contentTextStyle(content)]}>
            {formatYen(aggregate.totalAmount)}
          </Text>
        </View>
        {aggregate.items.length > 1 ? (
          <Text style={[styles.personBreakdownLabel, contentMutedTextStyle(content)]}>内訳</Text>
        ) : null}
        {aggregate.items.map((item) => (
          <Pressable
            key={item.loanId}
            style={styles.breakdownRow}
            onPress={() => handleToggleRepaid(item.loanId)}
          >
            <View
              style={[
                styles.repaidCheck,
                { borderColor: content.contentSearchFieldBorder, backgroundColor: content.contentInputBg },
              ]}
            >
              <Text style={[styles.repaidCheckHint, contentMutedTextStyle(content)]}>済</Text>
            </View>
            <View style={styles.breakdownBody}>
              <Text style={[styles.breakdownTitle, contentTextStyle(content)]} numberOfLines={1}>
                {item.sessionTitle}
              </Text>
              <Text style={[styles.breakdownMeta, contentMutedTextStyle(content)]}>
                {formatMoneyLoanDateLabel(item.createdAt)} · {formatYen(item.amount)}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    ));
  };

  const scrollContent = (
    <>
      {activeTab === 'register' ? (
        <>
          <View style={formStyles.formCard}>
            <Text style={formStyles.sectionTitleOnCard}>新規登録</Text>

            <View style={formStyles.formRow}>
              <Text style={formStyles.formLabel}>タイトル</Text>
              <TextInput
                style={formStyles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="例: フットサル"
                placeholderTextColor={content.contentTextSecondary}
              />
            </View>

            <View style={formStyles.formRow}>
              <Text style={formStyles.formLabel}>登録方法</Text>
              <View style={formStyles.modeRow}>
                {(['split', 'individual'] as const).map((mode) => {
                  const selected = registerMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      style={[formStyles.modeButton, selected && formStyles.modeButtonSelected]}
                      onPress={() => setRegisterMode(mode)}
                    >
                      <Text style={[formStyles.modeButtonText, selected && formStyles.modeButtonTextSelected]}>
                        {mode === 'split' ? '割り勘' : '個別'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {registerMode === 'split' ? (
              <>
                <View style={formStyles.formRow}>
                  <Text style={formStyles.formLabel}>金額（円）</Text>
                  <TextInput
                    style={formStyles.textInput}
                    value={totalAmountText}
                    onChangeText={setTotalAmountText}
                    placeholder="例: 9000"
                    placeholderTextColor={content.contentTextSecondary}
                    keyboardType="number-pad"
                  />
                </View>
                {splitPreview ? <Text style={formStyles.splitPreviewIndented}>{splitPreview}</Text> : null}
              </>
            ) : null}

            <View style={formStyles.participantRow}>
              <Text style={formStyles.formLabel}>{registerMode === 'individual' ? '相手' : '参加者'}</Text>
              <Pressable style={formStyles.addParticipantButton} onPress={openParticipantSelector}>
                <Text style={formStyles.addParticipantButtonText}>
                  {registerMode === 'individual' ? '相手を選ぶ' : '参加者を選ぶ'}
                </Text>
              </Pressable>
            </View>
            <MoneyLoanRecentCounterpartyChips
              friendIds={recentCounterpartyFriendIds}
              selectedFriendIds={selectedCounterpartyFriendIdSet}
              friendNameById={friendNameById}
              friendPhotoById={friendPhotoById}
              onAdd={addCounterpartyFriend}
            />
            <View style={formStyles.selectedEntryTagArea}>
              {participantChips.length > 0 ? (
                <>
                  <ParticipantChipList
                    chips={participantChips}
                    compact
                    layout="wrap"
                    onChipPress={(chip) => {
                      if (chip.friendId) {
                        removeCounterpartyFriend(chip.friendId);
                      }
                    }}
                  />
                  <Text style={formStyles.selectedEntryHint}>タップで外す</Text>
                </>
              ) : (
                <Pressable onPress={openParticipantSelector}>
                  <Text style={formStyles.selectedEntryEmptyText}>
                    {registerMode === 'individual' ? '相手が選択されていません' : '参加者が選択されていません'}
                  </Text>
                </Pressable>
              )}
            </View>

            {registerMode === 'individual' && individualLines.length > 0 ? (
              <View style={formStyles.individualSection}>
                <Text style={formStyles.fieldSectionLabel}>各人の金額・貸し借り</Text>
                {individualLines.map((line) => {
                  const name = friendNameById.get(line.friendId) ?? line.friendId;
                  return (
                    <View key={line.friendId} style={formStyles.individualRow}>
                      <Text style={formStyles.individualName} numberOfLines={1}>
                        {name}
                      </Text>
                      <TextInput
                        style={formStyles.individualAmountInput}
                        value={line.amountText}
                        onChangeText={(value) => updateIndividualLine(line.friendId, { amountText: value })}
                        placeholder="金額"
                        placeholderTextColor={content.contentTextSecondary}
                        keyboardType="number-pad"
                      />
                      <View style={formStyles.individualDirectionRow}>
                        {(['lent', 'borrowed'] as const).map((value) => {
                          const selected = line.direction === value;
                          return (
                            <Pressable
                              key={value}
                              style={[
                                formStyles.individualDirectionButton,
                                selected && formStyles.individualDirectionButtonSelected,
                              ]}
                              onPress={() => updateIndividualLine(line.friendId, { direction: value })}
                            >
                              <Text
                                style={[
                                  formStyles.individualDirectionText,
                                  selected && formStyles.individualDirectionTextSelected,
                                ]}
                              >
                                {value === 'lent' ? '貸' : '借'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}

            <Pressable style={formStyles.primaryButton} onPress={handleRegister}>
              <Text style={formStyles.primaryButtonText}>登録</Text>
            </Pressable>
          </View>

          <Text style={formStyles.sectionTitleOnBase}>未返済</Text>
          {activeSessionSummaries.length === 0 ? (
            <Text style={formStyles.emptyTextOnBase}>未返済はありません。</Text>
          ) : (
            activeSessionSummaries.map((summary) => (
              <MoneyLoanSessionCard
                key={summary.session.id}
                summary={summary}
                friendNameById={friendNameById}
                friendPhotoById={friendPhotoById}
                showBatchDates={summary.batchCount > 1}
                onPress={() => openEditSession(summary.session)}
                onLongPress={() => handleDeleteSession(summary.session.id, summary.session.title)}
              />
            ))
          )}

          {settledSessionSummaries.length > 0 ? (
            <>
              <Text style={formStyles.sectionTitleOnBase}>完済</Text>
              {settledSessionSummaries.map((summary) => (
                <MoneyLoanSessionCard
                  key={summary.session.id}
                  summary={summary}
                  friendNameById={friendNameById}
                  friendPhotoById={friendPhotoById}
                  settled
                  showBatchDates={summary.batchCount > 1}
                  onPress={() => openEditSession(summary.session)}
                  onLongPress={() => handleDeleteSession(summary.session.id, summary.session.title)}
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}

      {activeTab === 'lent' ? renderDirectionTab('lent') : null}
      {activeTab === 'borrowed' ? renderDirectionTab('borrowed') : null}
    </>
  );

  return (
    <>
      <SubToolScreenTemplate
        title="お金貸し借り管理"
        onBack={() => router.back()}
        header={
          <PillTabBar
            tabs={MONEY_LOAN_TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            perTabColors
          />
        }
        keyboardAware={activeTab === 'register'}
        extraScrollHeight={24}
        scrollContentStyle={styles.scrollContent}
      >
        {scrollContent}
      </SubToolScreenTemplate>

      <EntrySelectorModal
        visible={selectorVisible}
        selectorTab={selectorTab}
        onTabChange={setSelectorTab}
        nameFilter={selectorNameFilter}
        onNameFilterChange={setSelectorNameFilter}
        affiliationFilter={selectorAffiliationFilter}
        onAffiliationFilterChange={setSelectorAffiliationFilter}
        experienceFilter={selectorExperienceFilter}
        onExperienceFilterChange={setSelectorExperienceFilter}
        friends={counterpartyFriends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        groupOptions={affiliationOptions}
        selectedIndividualIds={selectedIndividualIds}
        selectedGroupValues={selectedGroupValues}
        onToggleIndividual={toggleSelectorIndividual}
        onToggleGroup={toggleSelectorGroup}
        onCancel={handleSelectorCancel}
        onConfirm={handleSelectorConfirm}
      />

      <MoneyLoanSessionEditModal
        visible={editSession !== null}
        session={editSession}
        loans={loans}
        friends={counterpartyFriends}
        affiliationOptions={affiliationOptions}
        experienceOptions={experienceOptions}
        onClose={closeEditSession}
        onSaved={() => {
          loadData();
          setEditSession((current) => (current ? getMoneyLoanSession(current.id) : null));
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
    gap: Spacing.md,
  },
  personCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
  },
  personCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  personName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  personTotal: {
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 0,
  },
  personBreakdownLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  repaidCheck: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repaidCheckHint: {
    fontSize: 11,
    fontWeight: '700',
  },
  breakdownBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  breakdownMeta: {
    fontSize: 12,
  },
});
