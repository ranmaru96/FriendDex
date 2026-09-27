import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Theme, Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { popCurrentTabScreen } from '@/utils/tabNavigation';
import { PillTabBar, type PillTabItem } from '@/components/screen/PillTabBar';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import {
  SettlementGroupCard,
  SettlementIndividualLoanPanel,
  SettlementInviteCard,
  SettlementPersonAggregateCard,
  SettlementSettledDivider,
  SettlementTransferRow,
} from '@/components/settlement';
import { MoneyLoanRecentCounterpartyChips } from '@/components/money-loan/MoneyLoanRecentCounterpartyChips';
import { MoneyLoanFormCard } from '@/components/money-loan/MoneyLoanFormCard';
import { useMoneyLoanFormStyles } from '@/components/money-loan/moneyLoanFormStyles';
import { useSettlementMock } from '@/contexts/SettlementMockContext';
import { getEpisodeParticipantFriendIds } from '@/db';
import {
  pullSharedMoneyLoans,
  setCanonicalSharedMoneyLoanRepaid,
} from '@/lib/sharedMoneyLoanSync';
import { pullSharedSettlementRooms } from '@/lib/sharedSettlementSync';
import { readLocalMoneyLoanUiState } from '@/utils/settlementLocalSnapshot';
import { requireOnline } from '@/lib/networkReachability';
import type { SettlementExpense, SettlementRoomMember } from '@/types/settlement';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';
import { buildMoneyLoanCounterpartyFriends, getRecentTogetherFriendIdsFromPastEvents } from '@/utils/eventRecencyHelpers';
import {
  buildFriendNameById,
  buildMoneyLoanParticipantsFromSelectorPicks,
  buildSessionTitleById,
} from '@/utils/moneyLoanHelpers';
import {
  computeMemberBalances,
  computeSettlementTransfers,
} from '@/utils/settlementEngine';
import { buildSettlementTransferDisplays } from '@/utils/settlementTransferHelpers';
import { buildSettlementPersonAggregates } from '@/utils/settlementPersonAggregates';
import {
  partitionPersonAggregates,
  partitionSettlementRooms,
  partitionTransferSections,
} from '@/utils/settlementListPartition';
import {
  mergeMoneyLoansIntoPersonAggregates,
  buildMoneyLoanTransferSections,
  isMoneyLoanBalanceSectionId,
  parseMoneyLoanBalanceKey,
} from '@/utils/settlementMoneyLoanBridge';
import { withResolvedSettlementRoomNames } from '@/utils/settlementMockHelpers';
import { canToggleGroupTransfer } from '@/utils/settlementToggleAccess';
import {
  parseSettlementFromMemberIdFromTransferKey,
  parseSettlementRoomIdFromTransferKey,
} from '@/utils/settlementTransferHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { buildFriendPhotoById } from '@/utils/friendPhoto';

type SettlementTab = 'groups' | 'balances' | 'individual';
type BalanceViewMode = 'room' | 'person';

const SETTLEMENT_TAB_DEFS: { key: SettlementTab; caption: string; icon: PillTabItem<SettlementTab>['icon'] }[] = [
  { key: 'individual', caption: '個別', icon: 'cash-outline' },
  { key: 'groups', caption: 'グループ', icon: 'people-outline' },
  { key: 'balances', caption: '清算', icon: 'swap-horizontal-outline' },
];

type MockRoom = ReturnType<typeof useSettlementMock>['rooms'][number];

function mockRoomToEngine(room: MockRoom) {
  const members: SettlementRoomMember[] = room.members.map((member) => ({
    id: member.id,
    roomId: room.id,
    userId: null,
    displayName: member.displayName,
    localFriendId: member.friendId,
    role: member.friendId === 'myself' ? 'owner' : 'member',
    joinedAt: room.createdAt,
  }));
  const expenses: SettlementExpense[] = room.expenses.map((expense) => ({
    id: expense.id,
    roomId: room.id,
    payerMemberId: expense.payerMemberId,
    title: expense.title,
    amount: expense.amount,
    splitRule: { type: 'even', memberIds: expense.splitMemberIds },
    memo: '',
    isSettled: false,
    createdAt: expense.createdAt,
    updatedAt: expense.createdAt,
  }));
  return { members, expenses };
}

export default function SettlementScreen() {
  const router = useRouter();
  const formStyles = useMoneyLoanFormStyles();
  const content = useContentColors();
  const { patternColors } = useAppTheme();
  const settlementTabs = useMemo<PillTabItem<SettlementTab>[]>(
    () => [
      { ...SETTLEMENT_TAB_DEFS[0], color: patternColors.gold },
      { ...SETTLEMENT_TAB_DEFS[1], color: patternColors.accent },
      { ...SETTLEMENT_TAB_DEFS[2], color: patternColors.cyan },
    ],
    [patternColors.accent, patternColors.cyan, patternColors.gold]
  );
  const { rooms, invites, createRoom, acceptInvite, declineInvite, isTransferCompleted, toggleTransferCompleted, reloadFromStore } =
    useSettlementMock();
  const [activeTab, setActiveTab] = useState<SettlementTab>('individual');
  const [balanceViewMode, setBalanceViewMode] = useState<BalanceViewMode>('room');
  const [loanUi, setLoanUi] = useState(readLocalMoneyLoanUiState);
  const friends = loanUi.friends;
  const myselfId = loanUi.myselfId;
  const moneyLoanSessions = loanUi.sessions;
  const moneyLoans = loanUi.loans;
  const affiliationOptions = loanUi.affiliationOptions;
  const experienceOptions = loanUi.experienceOptions;
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState<EpisodeParticipantDraft[]>([]);
  const [formError, setFormError] = useState('');
  const [writing, setWriting] = useState(false);

  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());

  const loadFriends = useCallback(() => {
    setLoanUi(readLocalMoneyLoanUiState());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadFriends();
      void (async () => {
        await pullSharedMoneyLoans();
        await pullSharedSettlementRooms();
        if (cancelled) {
          return;
        }
        reloadFromStore();
        loadFriends();
      })();
      return () => {
        cancelled = true;
      };
    }, [loadFriends, reloadFromStore])
  );

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);
  const roomsWithNames = useMemo(
    () => withResolvedSettlementRoomNames(rooms, { myselfId, friendNameById }),
    [rooms, myselfId, friendNameById]
  );
  const counterpartyFriends = useMemo(
    () => buildMoneyLoanCounterpartyFriends(friends, myselfId),
    [friends, myselfId]
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

  const handleCreateRoom = useCallback(async () => {
    if (!requireOnline() || writing) {
      return;
    }
    setWriting(true);
    try {
      const { room, errorMessage } = await createRoom({
        title,
        memberFriendIds: counterpartyFriendIds,
      });
      if (!room) {
        setFormError(errorMessage ?? 'タイトルとメンバーを入力してください。');
        return;
      }
      setFormError('');
      setTitle('');
      setParticipants([]);
      router.push({ pathname: '/settlement-room', params: { roomId: room.id } });
    } finally {
      setWriting(false);
    }
  }, [counterpartyFriendIds, createRoom, router, title, writing]);

  const transferSections = useMemo(() => {
    const fromRooms = roomsWithNames
      .map((room) => {
        const { members, expenses } = mockRoomToEngine(room);
        if (members.length === 0 || expenses.length === 0) {
          return null;
        }
        const balances = computeMemberBalances(members, expenses);
        const transfers = computeSettlementTransfers(balances);
        if (transfers.length === 0) {
          return null;
        }
        const nameByMemberId = new Map(balances.map((balance) => [balance.memberId, balance.displayName]));
        const displayTransfers = buildSettlementTransferDisplays(room.id, transfers, nameByMemberId);
        return { room, displayTransfers };
      })
      .filter((section): section is NonNullable<typeof section> => section !== null);
    const fromLoans = buildMoneyLoanTransferSections(moneyLoanSessions, moneyLoans, friendNameById);
    return [...fromRooms, ...fromLoans];
  }, [roomsWithNames, moneyLoanSessions, moneyLoans, friendNameById]);

  const personAggregates = useMemo(() => {
    const roomOnlySections = transferSections.filter(
      (section) => !isMoneyLoanBalanceSectionId(section.room.id)
    );
    const base = buildSettlementPersonAggregates(roomOnlySections, myselfId, friendNameById);
    return mergeMoneyLoansIntoPersonAggregates(
      base,
      moneyLoans,
      buildSessionTitleById(moneyLoanSessions),
      friendNameById
    );
  }, [transferSections, myselfId, friendNameById, moneyLoans, moneyLoanSessions]);

  const moneyLoanById = useMemo(() => new Map(moneyLoans.map((loan) => [loan.id, loan])), [moneyLoans]);

  const isBalanceItemCompleted = useCallback(
    (key: string) => {
      const loanId = parseMoneyLoanBalanceKey(key);
      if (loanId) {
        return moneyLoanById.get(loanId)?.isRepaid ?? false;
      }
      return isTransferCompleted(key);
    },
    [isTransferCompleted, moneyLoanById]
  );

  const toggleBalanceItem = useCallback(
    (key: string) => {
      if (!requireOnline() || writing) {
        return;
      }
      const loanId = parseMoneyLoanBalanceKey(key);
      if (loanId) {
        const loan = moneyLoanById.get(loanId);
        if (!loan) {
          return;
        }
        setWriting(true);
        void setCanonicalSharedMoneyLoanRepaid(loanId, !loan.isRepaid)
          .then((result) => {
            if (result.errorMessage) {
              Alert.alert('更新できませんでした', result.errorMessage);
              return;
            }
            loadFriends();
          })
          .finally(() => {
            setWriting(false);
          });
        return;
      }
      const roomId = parseSettlementRoomIdFromTransferKey(key);
      const fromMemberId = parseSettlementFromMemberIdFromTransferKey(key);
      const room = roomId ? rooms.find((item) => item.id === roomId) : undefined;
      if (room && fromMemberId && !canToggleGroupTransfer(room, fromMemberId, myselfId)) {
        return;
      }
      setWriting(true);
      void toggleTransferCompleted(key)
        .then((result) => {
          if (result.errorMessage) {
            Alert.alert('更新できませんでした', result.errorMessage);
          }
        })
        .finally(() => {
          setWriting(false);
        });
    },
    [loadFriends, moneyLoanById, myselfId, rooms, toggleTransferCompleted, writing]
  );

  const canToggleBalanceItem = useCallback(
    (item: { key: string; signedAmount: number }) => {
      if (parseMoneyLoanBalanceKey(item.key)) {
        return true;
      }
      return item.signedAmount < 0;
    },
    []
  );

  const roomPartitions = useMemo(
    () => partitionSettlementRooms(roomsWithNames, isBalanceItemCompleted),
    [roomsWithNames, isBalanceItemCompleted]
  );

  const transferPartitions = useMemo(
    () => partitionTransferSections(transferSections, isBalanceItemCompleted),
    [transferSections, isBalanceItemCompleted]
  );

  const personPartitions = useMemo(
    () => partitionPersonAggregates(personAggregates, isBalanceItemCompleted),
    [personAggregates, isBalanceItemCompleted]
  );

  return (
    <>
      <SubToolScreenTemplate
        title="お金貸し借り管理"
        onBack={popCurrentTabScreen}
        header={
          <PillTabBar tabs={settlementTabs} activeTab={activeTab} onTabChange={setActiveTab} perTabColors />
        }
        scrollContentStyle={styles.scrollContent}
      >
        {activeTab === 'groups' ? (
          <>
            {invites.map((invite) => (
              <SettlementInviteCard
                key={invite.id}
                invite={invite}
                onAccept={() => {
                  if (!requireOnline()) {
                    return;
                  }
                  acceptInvite(invite.id);
                }}
                onDecline={() => {
                  if (!requireOnline()) {
                    return;
                  }
                  declineInvite(invite.id);
                }}
              />
            ))}

            <MoneyLoanFormCard>
              <Text style={formStyles.sectionTitleOnCard}>グループを作成</Text>
              <View style={formStyles.formRow}>
                <Text style={formStyles.formLabel}>タイトル</Text>
                <TextInput
                  style={formStyles.textInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="例: 北海道旅行"
                  placeholderTextColor={content.contentTextSecondary}
                />
              </View>
              <View style={formStyles.participantRow}>
                <Text style={formStyles.formLabel}>メンバー</Text>
                <Pressable style={formStyles.addParticipantButton} onPress={openParticipantSelector}>
                  <Text style={formStyles.addParticipantButtonText}>参加者を選ぶ</Text>
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
                    <Text style={formStyles.selectedEntryEmptyText}>参加者が選択されていません</Text>
                  </Pressable>
                )}
              </View>
              {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}
              <Pressable
                style={[formStyles.primaryButton, writing ? { opacity: 0.55 } : null]}
                onPress={() => void handleCreateRoom()}
                disabled={writing}
              >
                <Text style={formStyles.primaryButtonText}>グループを作成</Text>
              </Pressable>
            </MoneyLoanFormCard>

            <Text style={formStyles.sectionTitleOnBase}>参加中のグループ</Text>
            {roomPartitions.active.length === 0 ? (
              <Text style={styles.emptyTextOnBase}>
                {roomsWithNames.length === 0
                  ? 'グループはまだありません。'
                  : '未清算のグループはありません。'}
              </Text>
            ) : (
              roomPartitions.active.map((room) => (
                <SettlementGroupCard
                  key={room.id}
                  room={room}
                  onPress={() =>
                    router.push({ pathname: '/settlement-room', params: { roomId: room.id } })
                  }
                />
              ))
            )}

            {roomPartitions.settled.length > 0 ? (
              <>
                <SettlementSettledDivider />
                {roomPartitions.settled.map((room) => (
                  <SettlementGroupCard
                    key={room.id}
                    room={room}
                    settled
                    onPress={() =>
                      router.push({ pathname: '/settlement-room', params: { roomId: room.id } })
                    }
                  />
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {activeTab === 'balances' ? (
          <>
            <MoneyLoanFormCard>
              <Text style={formStyles.sectionTitleOnCard}>表示</Text>
              <View style={formStyles.modeRow}>
                {(['room', 'person'] as const).map((mode) => {
                  const selected = balanceViewMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      style={[formStyles.modeButton, selected && formStyles.modeButtonSelected]}
                      onPress={() => setBalanceViewMode(mode)}
                    >
                      <Text
                        style={[formStyles.modeButtonText, selected && formStyles.modeButtonTextSelected]}
                      >
                        {mode === 'room' ? '会ごと' : '人ごと'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </MoneyLoanFormCard>

            {balanceViewMode === 'room' ? (
              transferSections.length === 0 ? (
                <Text style={styles.emptyTextOnBase}>清算案はまだありません。</Text>
              ) : (
                <>
                  {transferPartitions.active.length > 0 ? (
                    <>
                      <Text style={formStyles.sectionTitleOnBase}>未清算</Text>
                      {transferPartitions.active.map(({ room, displayTransfers }) => (
                        <View key={room.id} style={[styles.transferCard, contentSurfaceStyle(content)]}>
                          <Text style={[styles.transferRoomTitle, contentTextStyle(content)]}>
                            {room.title}
                          </Text>
                          {displayTransfers.map((transfer) => (
                            <SettlementTransferRow
                              key={transfer.key}
                              transfer={transfer}
                              isCompleted={isBalanceItemCompleted(transfer.key)}
                              canToggle={
                                parseMoneyLoanBalanceKey(transfer.key)
                                  ? true
                                  : canToggleGroupTransfer(room, transfer.fromMemberId, myselfId)
                              }
                              onToggle={() => toggleBalanceItem(transfer.key)}
                            />
                          ))}
                        </View>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.emptyTextOnBase}>未清算はありません。</Text>
                  )}
                  {transferPartitions.settled.length > 0 ? (
                    <>
                      <SettlementSettledDivider />
                      {transferPartitions.settled.map(({ room, displayTransfers }) => (
                        <View
                          key={room.id}
                          style={[
                            styles.transferCard,
                            contentSurfaceStyle(content),
                            styles.transferCardSettled,
                          ]}
                        >
                          <Text style={[styles.transferRoomTitle, contentTextStyle(content)]}>
                            {room.title}
                          </Text>
                          {displayTransfers.map((transfer) => (
                            <SettlementTransferRow
                              key={transfer.key}
                              transfer={transfer}
                              isCompleted={isBalanceItemCompleted(transfer.key)}
                              canToggle={
                                parseMoneyLoanBalanceKey(transfer.key)
                                  ? true
                                  : canToggleGroupTransfer(room, transfer.fromMemberId, myselfId)
                              }
                              onToggle={() => toggleBalanceItem(transfer.key)}
                            />
                          ))}
                        </View>
                      ))}
                    </>
                  ) : null}
                </>
              )
            ) : personAggregates.length === 0 ? (
              <Text style={styles.emptyTextOnBase}>清算案はまだありません。</Text>
            ) : (
              <>
                {personPartitions.active.length > 0 ? (
                  <>
                    <Text style={formStyles.sectionTitleOnBase}>未清算</Text>
                    {personPartitions.active.map((aggregate) => (
                      <SettlementPersonAggregateCard
                        key={aggregate.counterpartyFriendId}
                        aggregate={aggregate}
                        isItemCompleted={isBalanceItemCompleted}
                        canToggleItem={canToggleBalanceItem}
                        onToggleItem={toggleBalanceItem}
                      />
                    ))}
                  </>
                ) : (
                  <Text style={styles.emptyTextOnBase}>未清算はありません。</Text>
                )}
                {personPartitions.settled.length > 0 ? (
                  <>
                    <SettlementSettledDivider />
                    {personPartitions.settled.map((aggregate) => (
                      <SettlementPersonAggregateCard
                        key={aggregate.counterpartyFriendId}
                        aggregate={aggregate}
                        settled
                        isItemCompleted={isBalanceItemCompleted}
                        canToggleItem={canToggleBalanceItem}
                        onToggleItem={toggleBalanceItem}
                      />
                    ))}
                  </>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {activeTab === 'individual' ? <SettlementIndividualLoanPanel /> : null}
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
        onPersonCreated={loadFriends}
        enableGroupTab={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  emptyTextOnBase: {
    fontSize: 13,
    color: Theme.topBarText,
    opacity: 0.85,
  },
  transferCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
  },
  transferCardSettled: {
    opacity: 0.72,
  },
  transferRoomTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
});
