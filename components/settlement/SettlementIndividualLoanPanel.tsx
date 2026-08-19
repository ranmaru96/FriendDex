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
import {
  createMoneyLoans,
  deleteMoneyLoan,
  getAllFriends,
  getDistinctAffiliations,
  getDistinctExperiences,
  getMoneyLoanSession,
  getMoneyLoanSessions,
  getMoneyLoans,
  getMyself,
  getOrCreateMoneyLoanSessionByTitle,
  initializeDatabase,
  setMoneyLoanRepaid,
  updateMoneyLoan,
  updateMoneyLoanSessionTitle,
} from '@/db';
import type { Friend, MoneyLoan, MoneyLoanDirection } from '@/types';
import { buildParticipantChipDisplays } from '@/utils/episodeHelpers';
import { buildMoneyLoanCounterpartyFriends, getRecentTogetherFriendIdsFromPastEvents } from '@/utils/eventRecencyHelpers';
import {
  buildFriendNameById,
  buildMoneyLoanParticipantsFromSelectorPicks,
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
import { useFocusEffect } from 'expo-router';

type Option = { label: string; value: string };

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

/** グループ不要の個人貸し借り登録（清算「個別」タブ） */
export function SettlementIndividualLoanPanel() {
  const formStyles = useMoneyLoanFormStyles();
  const content = useContentColors();
  const { colors: appTheme } = useAppTheme();
  const headerStyles = useSubScreenHeaderStyles();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [sessions, setSessions] = useState(() => getMoneyLoanSessions());
  const [loans, setLoans] = useState<MoneyLoan[]>([]);

  const [title, setTitle] = useState(() => resolveMoneyLoanSessionTitle(''));
  const [friendId, setFriendId] = useState<string | null>(null);
  const [direction, setDirection] = useState<MoneyLoanDirection>('lent');
  const [amountText, setAmountText] = useState('');
  const [formError, setFormError] = useState('');

  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
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

  const resetForm = () => {
    setTitle(resolveMoneyLoanSessionTitle(''));
    setFriendId(null);
    setDirection('lent');
    setAmountText('');
    setFormError('');
  };

  const handleRegister = () => {
    const resolvedTitle = resolveMoneyLoanSessionTitle(title);
    if (resolvedTitle !== title.trim()) {
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

    const session = getOrCreateMoneyLoanSessionByTitle(resolvedTitle);
    if (!session) {
      setFormError('登録に失敗しました。');
      return;
    }

    const created = createMoneyLoans({
      sessionId: session.id,
      lines: [{ kind: 'friend', value: friendId, amount, direction }],
    });
    if (created.length === 0) {
      setFormError('登録に失敗しました。');
      return;
    }

    resetForm();
    loadData();
  };

  const handleToggleItem = (key: string) => {
    const loanId = parseMoneyLoanBalanceKey(key);
    if (!loanId) {
      return;
    }
    const loan = loanById.get(loanId);
    if (!loan) {
      return;
    }
    const ok = setMoneyLoanRepaid(loanId, !loan.isRepaid);
    if (ok) {
      loadData();
    }
  };

  const openEditLoan = (key: string) => {
    const loanId = parseMoneyLoanBalanceKey(key);
    if (!loanId) {
      return;
    }
    const loan = loanById.get(loanId);
    if (!loan) {
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

  const handleSaveEdit = () => {
    if (!editLoan) {
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
    const titleOk = updateMoneyLoanSessionTitle(editLoan.sessionId, resolvedTitle);
    if (!titleOk) {
      setEditError('タイトルの更新に失敗しました。');
      return;
    }
    const ok = updateMoneyLoan(editLoan.id, {
      counterpartyKind: 'friend',
      counterpartyValue: editFriendId,
      amount,
      direction: editDirection,
    });
    if (!ok) {
      setEditError('更新に失敗しました。');
      return;
    }
    closeEditLoan();
    loadData();
  };

  const handleDeleteEdit = () => {
    if (!editLoan) {
      return;
    }
    Alert.alert('削除確認', 'この貸し借りを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const ok = deleteMoneyLoan(editLoan.id);
          if (!ok) {
            Alert.alert('エラー', '削除に失敗しました。');
            return;
          }
          closeEditLoan();
          loadData();
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
            onChangeText={setTitle}
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

        <Pressable style={formStyles.primaryButton} onPress={handleRegister}>
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

            <Pressable style={formStyles.primaryButton} onPress={handleSaveEdit}>
              <Text style={formStyles.primaryButtonText}>保存</Text>
            </Pressable>
            <Pressable style={styles.deleteButton} onPress={handleDeleteEdit}>
              <Text style={styles.deleteButtonText}>削除</Text>
            </Pressable>
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
