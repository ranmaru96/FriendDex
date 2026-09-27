import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { MoneyLoanRecentCounterpartyChips } from '@/components/money-loan/MoneyLoanRecentCounterpartyChips';
import { MoneyLoanFormCard } from '@/components/money-loan/MoneyLoanFormCard';
import { useMoneyLoanFormStyles } from '@/components/money-loan/moneyLoanFormStyles';
import { useSubScreenHeaderStyles } from '@/components/screen/subScreenHeaderStyles';
import { SettlementPersonAggregateCard } from '@/components/settlement/SettlementPersonAggregateCard';
import { SettlementSettledDivider } from '@/components/settlement/SettlementSettledDivider';
import { Theme, Spacing, ScreenHorizontalInset } from '@/constants/theme';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { getMoneyLoanSession } from '@/db';
import {
  createCanonicalSharedMoneyLoan,
  deleteCanonicalSharedMoneyLoan,
  pullSharedMoneyLoans,
  setCanonicalSharedMoneyLoanRepaid,
  updateCanonicalSharedMoneyLoan,
} from '@/lib/sharedMoneyLoanSync';
import { requireOnline } from '@/lib/networkReachability';
import type { MoneyLoan, MoneyLoanDirection } from '@/types';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';
import { buildMoneyLoanCounterpartyFriends, getRecentTogetherFriendIdsFromPastEvents } from '@/utils/eventRecencyHelpers';
import {
  buildFriendNameById,
  buildMoneyLoanParticipantsFromSelectorPicks,
  allocateDatedMoneyLoanTitle,
  buildSessionTitleById,
  resolveMoneyLoanSessionTitle,
} from '@/utils/moneyLoanHelpers';
import { partitionPersonAggregates } from '@/utils/settlementListPartition';
import {
  mergeMoneyLoansIntoPersonAggregates,
  parseMoneyLoanBalanceKey,
} from '@/utils/settlementMoneyLoanBridge';
import { useContentColors } from '@/utils/useContentColors';
import { contentTextStyle } from '@/utils/contentStyleHelpers';
import { buildFriendPhotoById } from '@/utils/friendPhoto';
import { readLocalMoneyLoanUiState } from '@/utils/settlementLocalSnapshot';
import { useFocusEffect } from 'expo-router';

function parseYenInput(value: string): number {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

/** グループ不要の個人貸し借り登録（清算「個別」タブ） */
export function SettlementIndividualLoanPanel() {
  const formStyles = useMoneyLoanFormStyles();
  const content = useContentColors();
  const { colors: appTheme } = useAppTheme();
  const headerStyles = useSubScreenHeaderStyles();

  const [loanUi, setLoanUi] = useState(readLocalMoneyLoanUiState);
  const friends = loanUi.friends;
  const myselfId = loanUi.myselfId;
  const sessions = loanUi.sessions;
  const loans = loanUi.loans;
  const affiliationOptions = loanUi.affiliationOptions;
  const experienceOptions = loanUi.experienceOptions;

  const [title, setTitle] = useState(() =>
    allocateDatedMoneyLoanTitle(loanUi.sessions.map((session) => session.title))
  );
  const [titleIsAutomatic, setTitleIsAutomatic] = useState(true);

  useEffect(() => {
    if (!titleIsAutomatic) {
      return;
    }
    setTitle(allocateDatedMoneyLoanTitle(sessions.map((session) => session.title)));
  }, [sessions, titleIsAutomatic]);
  const [friendId, setFriendId] = useState<string | null>(null);
  const [direction, setDirection] = useState<MoneyLoanDirection>('lent');
  const [amountText, setAmountText] = useState('');
  const [formError, setFormError] = useState('');
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorForEdit, setSelectorForEdit] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());

  const [editLoan, setEditLoan] = useState<MoneyLoan | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFriendId, setEditFriendId] = useState<string | null>(null);
  const [editDirection, setEditDirection] = useState<MoneyLoanDirection>('lent');
  const [editAmountText, setEditAmountText] = useState('');
  const [editError, setEditError] = useState('');
  const [writing, setWriting] = useState(false);

  const loadData = useCallback(() => {
    setLoanUi(readLocalMoneyLoanUiState());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadData();
      void (async () => {
        await pullSharedMoneyLoans();
        if (!cancelled) {
          loadData();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadData])
  );

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);
  const counterpartyFriends = useMemo(
    () => buildMoneyLoanCounterpartyFriends(friends, myselfId),
    [friends, myselfId]
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

  const selectedFriendIdSet = useMemo(
    () => new Set(friendId ? [friendId] : []),
    [friendId]
  );

  const participantChips = useMemo(
    () =>
      friendId
        ? buildParticipantChipDisplays(
            [{ kind: 'individual' as const, value: friendId }],
            friendNameById,
            { friendPhotoById }
          )
        : [],
    [friendId, friendNameById, friendPhotoById]
  );

  const editParticipantChips = useMemo(
    () =>
      editFriendId
        ? buildParticipantChipDisplays(
            [{ kind: 'individual' as const, value: editFriendId }],
            friendNameById,
            { friendPhotoById }
          )
        : [],
    [editFriendId, friendNameById, friendPhotoById]
  );

  const personAggregates = useMemo(
    () =>
      mergeMoneyLoansIntoPersonAggregates(
        [],
        loans,
        buildSessionTitleById(sessions),
        friendNameById
      ),
    [friendNameById, loans, sessions]
  );

  const loanById = useMemo(() => new Map(loans.map((loan) => [loan.id, loan])), [loans]);

  const isItemCompleted = useCallback(
    (key: string) => {
      const loanId = parseMoneyLoanBalanceKey(key);
      if (!loanId) {
        return false;
      }
      return loanById.get(loanId)?.isRepaid ?? false;
    },
    [loanById]
  );

  const personPartitions = useMemo(
    () => partitionPersonAggregates(personAggregates, isItemCompleted),
    [isItemCompleted, personAggregates]
  );

  const openPersonSelector = useCallback(
    (forEdit: boolean) => {
      const currentId = forEdit ? editFriendId : friendId;
      setSelectorForEdit(forEdit);
      setSelectedIndividualIds(currentId ? new Set([currentId]) : new Set());
      setSelectedGroupValues(new Set());
      setSelectorTab('individual');
      setSelectorNameFilter('');
      setSelectorAffiliationFilter('');
      setSelectorExperienceFilter('');
      setSelectorVisible(true);
    },
    [editFriendId, friendId]
  );

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
    const friendIds = nextParticipants
      .filter(
        (participant): participant is EpisodeParticipantDraft & { participantType: 'individual' } =>
          participant.participantType === 'individual'
      )
      .map((participant) => participant.value);
    const nextId = friendIds[0] ?? null;
    if (selectorForEdit) {
      setEditFriendId(nextId);
    } else {
      setFriendId(nextId);
    }
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, [myselfId, selectedGroupValues, selectedIndividualIds, selectorForEdit]);

  const toggleSelectorIndividual = useCallback((id: string) => {
    setSelectedIndividualIds((prev) => {
      if (prev.has(id) && prev.size === 1) {
        return new Set();
      }
      return new Set([id]);
    });
    setSelectedGroupValues(new Set());
  }, []);

  const toggleSelectorGroup = useCallback((groupValue: string) => {
    setSelectedGroupValues((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) next.delete(groupValue);
      else next.add(groupValue);
      return next;
    });
  }, []);

  const resetForm = (usedTitle?: string) => {
    const titles = sessions.map((session) => session.title);
    if (usedTitle?.trim()) {
      titles.push(usedTitle);
    }
    setTitleIsAutomatic(true);
    setTitle(allocateDatedMoneyLoanTitle(titles));
    setFriendId(null);
    setDirection('lent');
    setAmountText('');
    setFormError('');
  };

  const handleRegister = async () => {
    if (!requireOnline() || writing) {
      return;
    }
    const trimmedTitle = title.trim();
    const takenTitles = new Set(sessions.map((session) => session.title.trim().toLowerCase()));
    const resolvedTitle =
      !trimmedTitle || (titleIsAutomatic && takenTitles.has(trimmedTitle.toLowerCase()))
        ? allocateDatedMoneyLoanTitle(sessions.map((session) => session.title))
        : trimmedTitle;
    if (resolvedTitle !== trimmedTitle) {
      setTitle(resolvedTitle);
    }
    if (!friendId) {
      setFormError('相手を1人選んでください。');
      return;
    }
    const amount = parseYenInput(amountText);
    if (amount <= 0) {
      setFormError('金額を入力してください。');
      return;
    }

    setWriting(true);
    try {
      const { loan, errorMessage } = await createCanonicalSharedMoneyLoan({
        friendId,
        amount,
        direction,
        title: resolvedTitle,
      });
      if (!loan) {
        setFormError(errorMessage ?? '登録に失敗しました。');
        return;
      }
      resetForm(resolvedTitle);
      loadData();
    } finally {
      setWriting(false);
    }
  };

  const handleToggleItem = (key: string) => {
    if (!requireOnline() || writing) {
      return;
    }
    const loanId = parseMoneyLoanBalanceKey(key);
    if (!loanId) {
      return;
    }
    const loan = loanById.get(loanId);
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
        loadData();
      })
      .finally(() => {
        setWriting(false);
      });
  };

  const openEditLoan = (key: string) => {
    const loanId = parseMoneyLoanBalanceKey(key);
    if (!loanId) {
      return;
    }
    const loan = loanById.get(loanId);
    if (!loan || loan.incomingFromPeer) {
      return;
    }
    const session = getMoneyLoanSession(loan.sessionId);
    setEditLoan(loan);
    setEditTitle(session?.title ?? '');
    setEditFriendId(loan.counterpartyKind === 'friend' ? loan.counterpartyValue : null);
    setEditDirection(loan.direction);
    setEditAmountText(String(loan.amount));
    setEditError('');
  };

  const closeEditLoan = () => {
    setEditLoan(null);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editLoan || editLoan.incomingFromPeer) {
      return;
    }
    if (!requireOnline() || writing) {
      return;
    }
    if (!editFriendId) {
      setEditError('相手を1人選んでください。');
      return;
    }
    const amount = parseYenInput(editAmountText);
    if (amount <= 0) {
      setEditError('金額を入力してください。');
      return;
    }
    const resolvedTitle = resolveMoneyLoanSessionTitle(editTitle);
    setWriting(true);
    try {
      const { errorMessage } = await updateCanonicalSharedMoneyLoan({
        loanId: editLoan.id,
        friendId: editFriendId,
        amount,
        direction: editDirection,
        title: resolvedTitle,
      });
      if (errorMessage) {
        setEditError(errorMessage);
        return;
      }
      closeEditLoan();
      loadData();
    } finally {
      setWriting(false);
    }
  };

  const handleDeleteEdit = () => {
    if (!editLoan || editLoan.incomingFromPeer) {
      return;
    }
    if (!requireOnline() || writing) {
      return;
    }
    Alert.alert('削除確認', 'この貸し借りを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          setWriting(true);
          void deleteCanonicalSharedMoneyLoan(editLoan.id)
            .then((result) => {
              if (result.errorMessage) {
                Alert.alert('削除できませんでした', result.errorMessage);
                return;
              }
              closeEditLoan();
              loadData();
            })
            .finally(() => {
              setWriting(false);
            });
        },
      },
    ]);
  };

  useEffect(() => {
    if (!editLoan) {
      return;
    }
    const latest = loanById.get(editLoan.id);
    if (!latest) {
      closeEditLoan();
    }
  }, [editLoan, loanById]);

  return (
    <>
      <MoneyLoanFormCard>
        <Text style={formStyles.sectionTitleOnCard}>個別の貸し借り</Text>
        <Text style={[styles.hint, { color: content.contentTextSecondary }]}>
          グループを作らず、相手1人との貸し借りを登録できます。
        </Text>

        <View style={formStyles.formRow}>
          <Text style={formStyles.formLabel}>タイトル</Text>
          <TextInput
            style={formStyles.textInput}
            value={title}
            onChangeText={(value) => {
              setTitleIsAutomatic(false);
              setTitle(value);
            }}
            placeholder="例: ランチ代"
            placeholderTextColor={content.contentTextSecondary}
          />
        </View>

        <View style={formStyles.participantRow}>
          <Text style={formStyles.formLabel}>相手</Text>
          <Pressable style={formStyles.addParticipantButton} onPress={() => openPersonSelector(false)}>
            <Text style={formStyles.addParticipantButtonText}>相手を選ぶ</Text>
          </Pressable>
        </View>
        <MoneyLoanRecentCounterpartyChips
          friendIds={recentCounterpartyFriendIds}
          selectedFriendIds={selectedFriendIdSet}
          friendNameById={friendNameById}
          friendPhotoById={friendPhotoById}
          onAdd={(id) => setFriendId(id)}
        />
        <View style={formStyles.selectedEntryTagArea}>
          {participantChips.length > 0 ? (
            <>
              <ParticipantChipList
                chips={participantChips}
                compact
                layout="wrap"
                onChipPress={() => setFriendId(null)}
              />
              <Text style={formStyles.selectedEntryHint}>タップで外す</Text>
            </>
          ) : (
            <Pressable onPress={() => openPersonSelector(false)}>
              <Text style={formStyles.selectedEntryEmptyText}>相手が選択されていません</Text>
            </Pressable>
          )}
        </View>

        <View style={formStyles.formRow}>
          <Text style={formStyles.formLabel}>貸借</Text>
          <View style={formStyles.modeRow}>
            {(['lent', 'borrowed'] as const).map((value) => {
              const selected = direction === value;
              return (
                <Pressable
                  key={value}
                  style={[formStyles.modeButton, selected && formStyles.modeButtonSelected]}
                  onPress={() => setDirection(value)}
                >
                  <Text style={[formStyles.modeButtonText, selected && formStyles.modeButtonTextSelected]}>
                    {value === 'lent' ? '貸した' : '借りた'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={formStyles.formRow}>
          <Text style={formStyles.formLabel}>金額（円）</Text>
          <TextInput
            style={formStyles.textInput}
            value={amountText}
            onChangeText={setAmountText}
            placeholder="例: 1500"
            placeholderTextColor={content.contentTextSecondary}
            keyboardType="number-pad"
          />
        </View>

        {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}

        <Pressable
          style={[formStyles.primaryButton, writing ? { opacity: 0.55 } : null]}
          onPress={() => void handleRegister()}
          disabled={writing}
        >
          <Text style={formStyles.primaryButtonText}>登録</Text>
        </Pressable>
      </MoneyLoanFormCard>

      {personAggregates.length === 0 ? (
        <Text style={formStyles.emptyTextOnBase}>まだ貸し借りはありません。</Text>
      ) : (
        <>
          {personPartitions.active.length > 0 ? (
            <>
              <Text style={formStyles.sectionTitleOnBase}>未清算</Text>
              {personPartitions.active.map((aggregate) => (
                <SettlementPersonAggregateCard
                  key={aggregate.counterpartyFriendId}
                  aggregate={aggregate}
                  isItemCompleted={isItemCompleted}
                  onToggleItem={handleToggleItem}
                  onEditItem={openEditLoan}
                />
              ))}
            </>
          ) : (
            <Text style={formStyles.emptyTextOnBase}>未清算はありません。</Text>
          )}
          {personPartitions.settled.length > 0 ? (
            <>
              <SettlementSettledDivider />
              {personPartitions.settled.map((aggregate) => (
                <SettlementPersonAggregateCard
                  key={aggregate.counterpartyFriendId}
                  aggregate={aggregate}
                  settled
                  isItemCompleted={isItemCompleted}
                  onToggleItem={handleToggleItem}
                  onEditItem={openEditLoan}
                />
              ))}
            </>
          ) : null}
        </>
      )}

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
        onPersonCreated={loadData}
        enableGroupTab={false}
      />

      <Modal visible={editLoan != null} animationType="slide" onRequestClose={closeEditLoan}>
        <SafeAreaView style={[styles.editRoot, { backgroundColor: appTheme.screenBackground }]}>
          <View style={headerStyles.bar}>
            <Pressable style={headerStyles.sideBack} onPress={closeEditLoan} hitSlop={8}>
              <Text style={headerStyles.backText}>‹ 戻る</Text>
            </Pressable>
            <Text style={headerStyles.title}>編集</Text>
            <Pressable style={headerStyles.side} onPress={handleSaveEdit} hitSlop={8}>
              <Text style={[styles.headerSave, contentTextStyle(content)]}>保存</Text>
            </Pressable>
          </View>

          <MoneyLoanFormCard style={styles.editCard}>
            <View style={formStyles.formRow}>
              <Text style={formStyles.formLabel}>タイトル</Text>
              <TextInput
                style={formStyles.textInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="例: ランチ代"
                placeholderTextColor={content.contentTextSecondary}
              />
            </View>

            <View style={formStyles.participantRow}>
              <Text style={formStyles.formLabel}>相手</Text>
              <Pressable style={formStyles.addParticipantButton} onPress={() => openPersonSelector(true)}>
                <Text style={formStyles.addParticipantButtonText}>相手を選ぶ</Text>
              </Pressable>
            </View>
            <View style={formStyles.selectedEntryTagArea}>
              {editParticipantChips.length > 0 ? (
                <>
                  <ParticipantChipList
                    chips={editParticipantChips}
                    compact
                    layout="wrap"
                    onChipPress={() => setEditFriendId(null)}
                  />
                  <Text style={formStyles.selectedEntryHint}>タップで外す</Text>
                </>
              ) : (
                <Pressable onPress={() => openPersonSelector(true)}>
                  <Text style={formStyles.selectedEntryEmptyText}>相手が選択されていません</Text>
                </Pressable>
              )}
            </View>

            <View style={formStyles.formRow}>
              <Text style={formStyles.formLabel}>貸借</Text>
              <View style={formStyles.modeRow}>
                {(['lent', 'borrowed'] as const).map((value) => {
                  const selected = editDirection === value;
                  return (
                    <Pressable
                      key={value}
                      style={[formStyles.modeButton, selected && formStyles.modeButtonSelected]}
                      onPress={() => setEditDirection(value)}
                    >
                      <Text style={[formStyles.modeButtonText, selected && formStyles.modeButtonTextSelected]}>
                        {value === 'lent' ? '貸した' : '借りた'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={formStyles.formRow}>
              <Text style={formStyles.formLabel}>金額（円）</Text>
              <TextInput
                style={formStyles.textInput}
                value={editAmountText}
                onChangeText={setEditAmountText}
                placeholder="例: 1500"
                placeholderTextColor={content.contentTextSecondary}
                keyboardType="number-pad"
              />
            </View>

            {editError ? <Text style={formStyles.formError}>{editError}</Text> : null}

            <Pressable
              style={[formStyles.primaryButton, writing ? { opacity: 0.55 } : null]}
              onPress={() => void handleSaveEdit()}
              disabled={writing}
            >
              <Text style={formStyles.primaryButtonText}>保存</Text>
            </Pressable>
            {editLoan?.incomingFromPeer ? null : (
              <Pressable style={styles.deleteButton} onPress={handleDeleteEdit}>
                <Text style={styles.deleteButtonText}>削除</Text>
              </Pressable>
            )}
          </MoneyLoanFormCard>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  editRoot: {
    flex: 1,
  },
  editCard: {
    marginHorizontal: ScreenHorizontalInset,
    marginTop: Spacing.md,
  },
  headerSave: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontWeight: '700',
  },
});
