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
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Theme, Spacing, ScreenHorizontalInset } from '@/constants/theme';
import { useSubScreenHeaderStyles } from '@/components/screen/subScreenHeaderStyles';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useMoneyLoanFormStyles } from '@/components/money-loan/moneyLoanFormStyles';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { EpisodeParticipantDraft } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import {
  deleteMoneyLoansByGroupId,
  getEpisodeParticipantFriendIds,
  getMyself,
  replaceMoneyLoanGroup,
  updateMoneyLoanSessionTitle,
} from '../../db';
import type { Friend, MoneyLoan, MoneyLoanDirection, MoneyLoanSession } from '../../types';
import { buildParticipantChipDisplays } from '../../utils/episodeHelpers';
import {
  buildFriendNameById,
  buildIndividualLinesFromLoans,
  buildMoneyLoanParticipantsFromSelectorPicks,
  buildParticipantDraftsFromFriendLoans,
  estimateSplitTotalAmount,
  formatMoneyLoanDateLabel,
  formatYen,
  getMoneyLoanSplitCount,
  getUnpaidBatchesForSession,
  inferBatchRegisterMode,
  resolveMoneyLoanSessionTitle,
  type MoneyLoanBatch,
  type MoneyLoanIndividualLineDraft,
  splitAmountEvenly,
} from '../../utils/moneyLoanHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { contentTextStyle } from '@/utils/contentStyleHelpers';

type RegisterMode = 'split' | 'individual';
type Option = { label: string; value: string };

type BatchEditDraft = {
  groupId: string;
  createdAt: string;
  registerMode: RegisterMode;
  totalAmountText: string;
  participants: EpisodeParticipantDraft[];
  individualLines: MoneyLoanIndividualLineDraft[];
};

type MoneyLoanSessionEditModalProps = {
  visible: boolean;
  session: MoneyLoanSession | null;
  loans: MoneyLoan[];
  friends: Friend[];
  affiliationOptions: Option[];
  experienceOptions: Option[];
  onClose: () => void;
  onSaved: () => void;
};

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

function createBatchDraft(batch: MoneyLoanBatch): BatchEditDraft {
  const unpaidLoans = batch.loans.filter((loan) => !loan.isRepaid);
  const mode = inferBatchRegisterMode(unpaidLoans);
  const participants = buildParticipantDraftsFromFriendLoans(unpaidLoans);
  const individualLines = buildIndividualLinesFromLoans(unpaidLoans);
  let totalAmountText = '';
  if (mode === 'split') {
    const friendCount = unpaidLoans.filter((loan) => loan.counterpartyKind === 'friend').length;
    const perFriend = unpaidLoans[0]?.amount ?? 0;
    totalAmountText = String(estimateSplitTotalAmount(friendCount, perFriend));
  }
  return {
    groupId: batch.groupId,
    createdAt: batch.createdAt,
    registerMode: mode,
    totalAmountText,
    participants,
    individualLines,
  };
}

function syncIndividualLinesForDraft(draft: BatchEditDraft): BatchEditDraft {
  if (draft.registerMode !== 'individual') {
    return draft;
  }
  const participantEntries = draft.participants
    .filter((participant) => participant.value.trim().length > 0)
    .map((participant) => ({
      kind: participant.participantType,
      value: participant.value,
    }));
  const friendIds = getEpisodeParticipantFriendIds({ participantEntries });
  const individualLines = friendIds.map((friendId) => {
    const existing = draft.individualLines.find((line) => line.friendId === friendId);
    return (
      existing ?? {
        friendId,
        amountText: '',
        direction: 'lent' as const,
      }
    );
  });
  return { ...draft, individualLines };
}

function buildLinesFromDraft(draft: BatchEditDraft): { kind: 'friend'; value: string; amount: number; direction: MoneyLoanDirection }[] | null {
  const participantEntries = draft.participants
    .filter((participant) => participant.value.trim().length > 0)
    .map((participant) => ({
      kind: participant.participantType,
      value: participant.value,
    }));
  const counterpartyFriendIds = getEpisodeParticipantFriendIds({ participantEntries });
  if (counterpartyFriendIds.length === 0) {
    return null;
  }

  if (draft.registerMode === 'split') {
    const parsedTotalAmount = parseYenInput(draft.totalAmountText);
    if (parsedTotalAmount <= 0) {
      return null;
    }
    const splitCount = getMoneyLoanSplitCount(counterpartyFriendIds.length);
    const amounts = splitAmountEvenly(parsedTotalAmount, splitCount);
    return counterpartyFriendIds.map((friendId, index) => ({
      kind: 'friend',
      value: friendId,
      amount: amounts[index] ?? 0,
      direction: 'lent',
    }));
  }

  const lineMap = new Map(draft.individualLines.map((line) => [line.friendId, line]));
  const lines = counterpartyFriendIds.map((friendId) => {
    const line = lineMap.get(friendId);
    return {
      kind: 'friend' as const,
      value: friendId,
      amount: parseYenInput(line?.amountText ?? ''),
      direction: line?.direction ?? 'lent',
    };
  });
  if (lines.some((line) => line.amount <= 0)) {
    return null;
  }
  return lines;
}

function buildSplitPreview(draft: BatchEditDraft): string | null {
  if (draft.registerMode !== 'split') {
    return null;
  }
  const participantEntries = draft.participants
    .filter((participant) => participant.value.trim().length > 0)
    .map((participant) => ({
      kind: participant.participantType,
      value: participant.value,
    }));
  const counterpartyFriendIds = getEpisodeParticipantFriendIds({ participantEntries });
  const parsedTotalAmount = parseYenInput(draft.totalAmountText);
  if (counterpartyFriendIds.length <= 0 || parsedTotalAmount <= 0) {
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
}

type BatchEditSectionProps = {
  draft: BatchEditDraft;
  showDateLabel: boolean;
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  onChange: (groupId: string, patch: Partial<BatchEditDraft>) => void;
  onOpenParticipantSelector: (groupId: string) => void;
  onRemoveParticipant: (groupId: string, friendId: string) => void;
  onDelete: (groupId: string) => void;
};

function BatchEditSection({
  draft,
  showDateLabel,
  friendNameById,
  friendPhotoById,
  onChange,
  onOpenParticipantSelector,
  onRemoveParticipant,
  onDelete,
}: BatchEditSectionProps) {
  const formStyles = useMoneyLoanFormStyles();
  const content = useContentColors();
  const participantEntries = useMemo(
    () =>
      draft.participants
        .filter((participant) => participant.value.trim().length > 0)
        .map((participant) => ({
          kind: participant.participantType,
          value: participant.value,
        })),
    [draft.participants]
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

  const splitPreview = useMemo(() => buildSplitPreview(draft), [draft]);

  const updateIndividualLine = (
    friendId: string,
    patch: Partial<Pick<MoneyLoanIndividualLineDraft, 'amountText' | 'direction'>>
  ) => {
    onChange(draft.groupId, {
      individualLines: draft.individualLines.map((line) =>
        line.friendId === friendId ? { ...line, ...patch } : line
      ),
    });
  };

  return (
    <View style={formStyles.formCard}>
      {showDateLabel ? (
        <Text style={[styles.batchDateLabel, contentTextStyle(content)]}>
          登録 {formatMoneyLoanDateLabel(draft.createdAt)}
        </Text>
      ) : null}

      <View style={formStyles.formRow}>
        <Text style={formStyles.formLabel}>登録方法</Text>
        <View style={formStyles.modeRow}>
          {(['split', 'individual'] as const).map((mode) => {
            const selected = draft.registerMode === mode;
            return (
              <Pressable
                key={mode}
                style={[formStyles.modeButton, selected && formStyles.modeButtonSelected]}
                onPress={() =>
                  onChange(draft.groupId, {
                    registerMode: mode,
                    individualLines:
                      mode === 'individual'
                        ? syncIndividualLinesForDraft({ ...draft, registerMode: mode }).individualLines
                        : draft.individualLines,
                  })
                }
              >
                <Text style={[formStyles.modeButtonText, selected && formStyles.modeButtonTextSelected]}>
                  {mode === 'split' ? '割り勘' : '個別'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {draft.registerMode === 'split' ? (
        <>
          <View style={formStyles.formRow}>
            <Text style={formStyles.formLabel}>金額（円）</Text>
            <TextInput
              style={formStyles.textInput}
              value={draft.totalAmountText}
              onChangeText={(value) => onChange(draft.groupId, { totalAmountText: value })}
              placeholder="例: 9000"
              placeholderTextColor={Theme.inputPlaceholder}
              keyboardType="number-pad"
            />
          </View>
          {splitPreview ? <Text style={formStyles.splitPreviewIndented}>{splitPreview}</Text> : null}
        </>
      ) : null}

      <View style={formStyles.participantRow}>
        <Text style={formStyles.formLabel}>{draft.registerMode === 'individual' ? '相手' : '参加者'}</Text>
        <Pressable style={formStyles.addParticipantButton} onPress={() => onOpenParticipantSelector(draft.groupId)}>
          <Text style={formStyles.addParticipantButtonText}>
            {draft.registerMode === 'individual' ? '相手を選ぶ' : '参加者を選ぶ'}
          </Text>
        </Pressable>
      </View>
      <View style={formStyles.selectedEntryTagArea}>
        {participantChips.length > 0 ? (
          <>
            <ParticipantChipList
              chips={participantChips}
              compact
              layout="wrap"
              onChipPress={(chip) => {
                if (chip.friendId) {
                  onRemoveParticipant(draft.groupId, chip.friendId);
                }
              }}
            />
            <Text style={formStyles.selectedEntryHint}>タップで外す</Text>
          </>
        ) : (
          <Pressable onPress={() => onOpenParticipantSelector(draft.groupId)}>
            <Text style={formStyles.selectedEntryEmptyText}>
              {draft.registerMode === 'individual' ? '相手が選択されていません' : '参加者が選択されていません'}
            </Text>
          </Pressable>
        )}
      </View>

      {draft.registerMode === 'individual' && draft.individualLines.length > 0 ? (
        <View style={formStyles.individualSection}>
          <Text style={formStyles.fieldSectionLabel}>各人の金額・貸し借り</Text>
          {draft.individualLines.map((line) => {
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
                  placeholderTextColor={Theme.inputPlaceholder}
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

      <Pressable style={styles.dangerButton} onPress={() => onDelete(draft.groupId)}>
        <Text style={styles.dangerButtonText}>この登録を削除</Text>
      </Pressable>
    </View>
  );
}

export function MoneyLoanSessionEditModal({
  visible,
  session,
  loans,
  friends,
  affiliationOptions,
  experienceOptions,
  onClose,
  onSaved,
}: MoneyLoanSessionEditModalProps) {
  const { colors: appTheme } = useAppTheme();
  const headerStyles = useSubScreenHeaderStyles();
  const formStyles = useMoneyLoanFormStyles();
  const [titleDraft, setTitleDraft] = useState('');
  const [batchDrafts, setBatchDrafts] = useState<BatchEditDraft[]>([]);
  const [formError, setFormError] = useState('');

  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTargetGroupId, setSelectorTargetGroupId] = useState<string | null>(null);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(() => buildFriendPhotoById(friends), [friends]);

  const showBatchDateLabels = batchDrafts.length > 1;

  useEffect(() => {
    if (!visible || !session) {
      return;
    }
    setTitleDraft(session.title);
    setFormError('');
    const batches = getUnpaidBatchesForSession(loans, session.id);
    setBatchDrafts(batches.map(createBatchDraft));
  }, [loans, session, visible]);

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

  const updateBatchDraft = useCallback((groupId: string, patch: Partial<BatchEditDraft>) => {
    setBatchDrafts((prev) =>
      prev.map((draft) => {
        if (draft.groupId !== groupId) {
          return draft;
        }
        const next = { ...draft, ...patch };
        return syncIndividualLinesForDraft(next);
      })
    );
  }, []);

  const openParticipantSelector = useCallback(
    (groupId: string) => {
      const draft = batchDrafts.find((entry) => entry.groupId === groupId);
      if (!draft) {
        return;
      }
      setSelectorTargetGroupId(groupId);
      restoreSelectorFromParticipants(draft.participants);
      setSelectorTab('individual');
      setSelectorNameFilter('');
      setSelectorAffiliationFilter('');
      setSelectorExperienceFilter('');
      setSelectorVisible(true);
    },
    [batchDrafts, restoreSelectorFromParticipants]
  );

  const handleSelectorCancel = useCallback(() => {
    setSelectorVisible(false);
    setSelectorTargetGroupId(null);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, []);

  const removeBatchParticipant = useCallback(
    (groupId: string, friendId: string) => {
      const draft = batchDrafts.find((entry) => entry.groupId === groupId);
      if (!draft) {
        return;
      }
      updateBatchDraft(groupId, {
        participants: draft.participants.filter(
          (participant) =>
            !(participant.participantType === 'individual' && participant.value === friendId)
        ),
      });
    },
    [batchDrafts, updateBatchDraft]
  );

  const handleSelectorConfirm = useCallback(() => {
    if (!selectorTargetGroupId) {
      return;
    }
    const myselfId = getMyself();
    const nextParticipants = buildMoneyLoanParticipantsFromSelectorPicks(
      selectedIndividualIds,
      selectedGroupValues
    ).filter((participant) => !myselfId || participant.value !== myselfId);
    updateBatchDraft(selectorTargetGroupId, { participants: nextParticipants });
    setSelectorVisible(false);
    setSelectorTargetGroupId(null);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, [selectedGroupValues, selectedIndividualIds, selectorTargetGroupId, updateBatchDraft]);

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

  const handleDeleteBatch = (groupId: string) => {
    Alert.alert('削除確認', 'この登録を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          const ok = deleteMoneyLoansByGroupId(groupId);
          if (!ok) {
            Alert.alert('エラー', '削除に失敗しました。');
            return;
          }
          setBatchDrafts((prev) => prev.filter((draft) => draft.groupId !== groupId));
          onSaved();
        },
      },
    ]);
  };

  const handleSaveAll = () => {
    if (!session) {
      return;
    }
    const resolvedTitle = resolveMoneyLoanSessionTitle(titleDraft);
    if (resolvedTitle !== titleDraft.trim()) {
      setTitleDraft(resolvedTitle);
    }
    if (batchDrafts.length === 0) {
      const titleOk = updateMoneyLoanSessionTitle(session.id, resolvedTitle);
      if (!titleOk) {
        setFormError('タイトルの更新に失敗しました。');
        return;
      }
      setFormError('');
      onSaved();
      onClose();
      return;
    }

    for (const draft of batchDrafts) {
      const lines = buildLinesFromDraft(draft);
      if (!lines) {
        setFormError(
          draft.registerMode === 'split'
            ? '金額と参加者を正しく入力してください。'
            : '相手と各人の金額を正しく入力してください。'
        );
        return;
      }
    }

    const titleOk = updateMoneyLoanSessionTitle(session.id, resolvedTitle);
    if (!titleOk) {
      setFormError('タイトルの更新に失敗しました。');
      return;
    }

    for (const draft of batchDrafts) {
      const lines = buildLinesFromDraft(draft);
      if (!lines) {
        continue;
      }
      const ok = replaceMoneyLoanGroup(draft.groupId, session.id, lines);
      if (!ok) {
        setFormError('更新に失敗しました。');
        return;
      }
    }

    setFormError('');
    onSaved();
    onClose();
  };

  if (!session) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: appTheme.screenBackground }]}>
        <View style={headerStyles.bar}>
          <Pressable style={headerStyles.sideBack} onPress={onClose} hitSlop={8}>
            <Text style={headerStyles.backText}>‹ 戻る</Text>
          </Pressable>
          <Text style={headerStyles.title}>編集</Text>
          <Pressable style={headerStyles.side} onPress={handleSaveAll} hitSlop={8}>
            <Text style={styles.headerSave}>保存</Text>
          </Pressable>
        </View>

        <KeyboardAwareScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid
          extraScrollHeight={24}
        >
          <View style={formStyles.formCard}>
            <View style={formStyles.formRow}>
              <Text style={formStyles.formLabel}>タイトル</Text>
              <TextInput
                style={formStyles.textInput}
                value={titleDraft}
                onChangeText={setTitleDraft}
                placeholder="例: フットサル"
                placeholderTextColor={Theme.inputPlaceholder}
              />
            </View>
          </View>

          {batchDrafts.length === 0 ? (
            <Text style={formStyles.emptyTextOnBase}>未返済の登録はありません。タイトルのみ保存できます。</Text>
          ) : (
            batchDrafts.map((draft) => (
              <BatchEditSection
                key={draft.groupId}
                draft={draft}
                showDateLabel={showBatchDateLabels}
                friendNameById={friendNameById}
                friendPhotoById={friendPhotoById}
                onChange={updateBatchDraft}
                onOpenParticipantSelector={openParticipantSelector}
                onRemoveParticipant={removeBatchParticipant}
                onDelete={handleDeleteBatch}
              />
            ))
          )}

          {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}

          <Pressable style={formStyles.primaryButton} onPress={handleSaveAll}>
            <Text style={formStyles.primaryButtonText}>保存</Text>
          </Pressable>
        </KeyboardAwareScrollView>

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
          friends={friends}
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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSave: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.accent,
    textAlign: 'right',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: ScreenHorizontalInset,
    paddingTop: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  batchDateLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  dangerButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  dangerButtonText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 13,
  },
});
