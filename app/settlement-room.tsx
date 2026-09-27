import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Theme, Radius, Spacing } from '@/constants/theme';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { popCurrentTabScreen } from '@/utils/tabNavigation';
import { screenTopBarIconButtonStyle } from '@/components/screen/ScreenTopBar';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import type { Option } from '@/components/episode/types';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { SettlementTransferRow } from '@/components/settlement';
import { MoneyLoanFormCard } from '@/components/money-loan/MoneyLoanFormCard';
import { useMoneyLoanFormStyles } from '@/components/money-loan/moneyLoanFormStyles';
import { useSettlementMock } from '@/contexts/SettlementMockContext';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { buildFriendPhotoById } from '@/utils/friendPhoto';
import { pullSharedSettlementRooms } from '@/lib/sharedSettlementSync';
import { getSupabaseClient } from '@/lib/supabase';
import { requireOnline } from '@/lib/networkReachability';
import { canToggleGroupTransfer } from '@/utils/settlementToggleAccess';
import { readLocalMoneyLoanUiState } from '@/utils/settlementLocalSnapshot';
import {
  SETTLED_MONEY_LOCK_MESSAGE,
  settlementMemberRemovalBlockReason,
} from '@/utils/settlementRoomEdit';
import { buildMoneyLoanCounterpartyFriends } from '@/utils/eventRecencyHelpers';
import type { Friend } from '@/types';
import type { MockSettlementExpense } from '@/types/settlementMock';
import type { SettlementExpense, SettlementRoomMember } from '@/types/settlement';
import { buildFriendNameById, formatYen } from '@/utils/moneyLoanHelpers';
import { resolveSplitAmounts } from '@/utils/settlementEngine';
import { getRoomDisplayTransfers } from '@/utils/settlementListPartition';
import {
  buildSettlementMemberChips,
  withResolvedSettlementRoomName,
} from '@/utils/settlementMockHelpers';
import { sortMembersBySelectedId, sortMembersBySelectedIds } from '@/utils/selectionSortHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';

function mockRoomToEngine(
  room: NonNullable<ReturnType<ReturnType<typeof useSettlementMock>['getRoom']>>
) {
  const members: SettlementRoomMember[] = room.members.map((member) => ({
    id: member.id,
    roomId: room.id,
    userId: null,
    displayName: member.displayName,
    localFriendId: member.friendId,
    role: member.friendId === 'myself' ? 'owner' : 'member',
    joinedAt: room.createdAt,
  }));
  const membersById = new Map(members.map((member) => [member.id, member]));
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
  return { members, membersById, expenses, allMembers: room.members };
}

export default function SettlementRoomDetailScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const {
    getRoom,
    addExpense,
    updateExpense,
    deleteExpense,
    addRoomMembers,
    removeRoomMember,
    updateRoomTitle,
    isTransferCompleted,
    completedTransferKeys,
    toggleTransferCompleted,
    reloadFromStore,
  } = useSettlementMock();
  const storedRoom = roomId ? getRoom(roomId) : undefined;

  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmountText, setExpenseAmountText] = useState('');
  const [payerMemberId, setPayerMemberId] = useState<string | null>(null);
  const [splitMemberIds, setSplitMemberIds] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState('');
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleError, setTitleError] = useState('');
  const [titleEditorVisible, setTitleEditorVisible] = useState(false);
  const [writing, setWriting] = useState(false);
  const [memberSelectorVisible, setMemberSelectorVisible] = useState(false);
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmountText, setEditAmountText] = useState('');
  const [editPayerMemberId, setEditPayerMemberId] = useState<string | null>(null);
  const [editSplitMemberIds, setEditSplitMemberIds] = useState<Set<string>>(new Set());
  const [editError, setEditError] = useState('');
  const appTheme = useAppThemeOptional();
  const topBarText = appTheme?.colors.topBarText ?? Theme.topBarText;
  const formStyles = useMoneyLoanFormStyles();
  const content = useContentColors();

  const loadFriends = useCallback(() => {
    const snapshot = readLocalMoneyLoanUiState();
    setFriends(snapshot.friends);
    setMyselfId(snapshot.myselfId);
    setAffiliationOptions(snapshot.affiliationOptions);
    setExperienceOptions(snapshot.experienceOptions);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadFriends();
      void (async () => {
        await pullSharedSettlementRooms();
        if (cancelled) {
          return;
        }
        const supabase = getSupabaseClient();
        const session = supabase ? await supabase.auth.getSession() : null;
        if (cancelled) {
          return;
        }
        setMyUserId(session?.data.session?.user.id?.trim().toLowerCase() ?? '');
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

  const room = useMemo(
    () =>
      storedRoom
        ? withResolvedSettlementRoomName(storedRoom, { myselfId, friendNameById })
        : undefined,
    [storedRoom, myselfId, friendNameById]
  );

  useEffect(() => {
    if (room && !titleEditorVisible) {
      setTitleDraft(room.title);
      setTitleError('');
    }
  }, [room?.id, room?.title, titleEditorVisible]);

  const openTitleEditor = useCallback(() => {
    if (!room) {
      return;
    }
    setTitleDraft(room.title);
    setTitleError('');
    setTitleEditorVisible(true);
  }, [room]);

  const closeTitleEditor = useCallback(() => {
    setTitleEditorVisible(false);
    setTitleError('');
    if (room) {
      setTitleDraft(room.title);
    }
  }, [room]);

  const handleSaveTitle = useCallback(async () => {
    if (!room) {
      return;
    }
    if (!requireOnline() || writing) {
      return;
    }
    const normalized = titleDraft.trim();
    if (!normalized) {
      setTitleError('グループ名を入力してください。');
      return;
    }
    if (normalized === room.title) {
      setTitleEditorVisible(false);
      setTitleError('');
      return;
    }
    setWriting(true);
    try {
      const { ok, errorMessage } = await updateRoomTitle(room.id, normalized);
      if (!ok) {
        setTitleError(errorMessage ?? 'グループ名の更新に失敗しました。');
        return;
      }
      setTitleError('');
      setTitleEditorVisible(false);
    } finally {
      setWriting(false);
    }
  }, [room, titleDraft, updateRoomTitle, writing]);

  const memberChips = useMemo(
    () =>
      room
        ? buildSettlementMemberChips(room.members, {
            myselfId,
            friendNameById,
            friendPhotoById,
          })
        : [],
    [friendNameById, friendPhotoById, myselfId, room]
  );

  useEffect(() => {
    if (!room) {
      return;
    }
    setSplitMemberIds(new Set(room.members.map((member) => member.id)));
  }, [room?.id, room?.members.length]);

  const engine = useMemo(() => (room ? mockRoomToEngine(room) : null), [room]);

  const sortedSplitMembers = useMemo(
    () => (engine ? sortMembersBySelectedIds(engine.allMembers, splitMemberIds) : []),
    [engine, splitMemberIds]
  );

  const sortedPayerMembers = useMemo(() => {
    if (!engine) {
      return [];
    }
    const activePayerId = payerMemberId ?? engine.allMembers[0]?.id ?? null;
    return sortMembersBySelectedId(engine.allMembers, activePayerId);
  }, [engine, payerMemberId]);

  const displayTransfers = useMemo(
    () => (room ? getRoomDisplayTransfers(room, completedTransferKeys) : []),
    [completedTransferKeys, room]
  );

  const splitPreview = useMemo(() => {
    if (!engine) {
      return null;
    }
    const amount = Math.floor(Number(expenseAmountText.replace(/,/g, '')) || 0);
    const ids = Array.from(splitMemberIds);
    if (amount <= 0 || ids.length === 0) {
      return null;
    }
    const shares = resolveSplitAmounts(amount, { type: 'even', memberIds: ids }, engine.membersById);
    const parts = ids.map((id) => {
      const name = engine.membersById.get(id)?.displayName ?? '?';
      return `${name} ${formatYen(shares.get(id) ?? 0)}`;
    });
    return parts.join(' · ');
  }, [engine, expenseAmountText, splitMemberIds]);

  const toggleSplitMember = useCallback((memberId: string) => {
    setSplitMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }, []);

  const handleAddExpense = useCallback(async () => {
    if (!room || !engine) {
      return;
    }
    if (!requireOnline() || writing) {
      return;
    }
    const payerId =
      payerMemberId ??
      engine.allMembers.find((member) => member.friendId === (myselfId ?? 'myself'))?.id ??
      engine.allMembers[0]?.id;
    if (!payerId) {
      setFormError('立替者を選んでください。');
      return;
    }
    const splitIds = Array.from(splitMemberIds);
    if (splitIds.length === 0) {
      setFormError('割り勘対象を1人以上選んでください。');
      return;
    }
    const amount = Math.floor(Number(expenseAmountText.replace(/,/g, '')) || 0);
    setWriting(true);
    try {
      const { expense, errorMessage } = await addExpense({
        roomId: room.id,
        payerMemberId: payerId,
        title: expenseTitle,
        amount,
        splitMemberIds: splitIds,
      });
      if (!expense) {
        setFormError(errorMessage ?? 'タイトルと金額を入力してください。');
        return;
      }
      setFormError('');
      setExpenseTitle('');
      setExpenseAmountText('');
      setSplitMemberIds(new Set(room.members.map((member) => member.id)));
    } finally {
      setWriting(false);
    }
  }, [
    addExpense,
    engine,
    expenseAmountText,
    expenseTitle,
    myselfId,
    payerMemberId,
    room,
    splitMemberIds,
    writing,
  ]);

  const moneyLocked = useMemo(() => {
    if (!room) {
      return false;
    }
    const prefix = `${room.id}|`;
    for (const key of completedTransferKeys) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }, [completedTransferKeys, room]);

  const counterpartyFriends = useMemo(
    () => buildMoneyLoanCounterpartyFriends(friends, myselfId),
    [friends, myselfId]
  );

  const openMemberSelector = useCallback(() => {
    setSelectedMemberIds(new Set());
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setMemberSelectorVisible(true);
  }, []);

  const handleAddMembers = useCallback(async () => {
    if (!room || !requireOnline() || writing) {
      return;
    }
    setWriting(true);
    try {
      const { ok, errorMessage } = await addRoomMembers(room.id, [...selectedMemberIds]);
      if (!ok) {
        Alert.alert('追加できませんでした', errorMessage ?? 'メンバーを追加できませんでした。');
        return;
      }
      setMemberSelectorVisible(false);
      setSelectedMemberIds(new Set());
    } finally {
      setWriting(false);
    }
  }, [addRoomMembers, room, selectedMemberIds, writing]);

  const handleMemberChipPress = useCallback(
    (memberId: string) => {
      if (!room || writing) {
        return;
      }
      const member = room.members.find((item) => item.id === memberId);
      if (!member) {
        return;
      }
      const reason = settlementMemberRemovalBlockReason(room, memberId, myselfId, myUserId);
      if (reason) {
        Alert.alert('外せません', reason);
        return;
      }
      Alert.alert('メンバーを外す', `${member.displayName}を外しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '外す',
          style: 'destructive',
          onPress: () => {
            if (!requireOnline()) {
              return;
            }
            setWriting(true);
            void removeRoomMember(room.id, memberId)
              .then((result) => {
                if (!result.ok) {
                  Alert.alert('外せませんでした', result.errorMessage ?? 'メンバーを外せませんでした。');
                }
              })
              .finally(() => {
                setWriting(false);
              });
          },
        },
      ]);
    },
    [myselfId, myUserId, removeRoomMember, room, writing]
  );

  const openExpenseEditor = useCallback(
    (expense: MockSettlementExpense) => {
      setEditingExpenseId(expense.id);
      setEditTitle(expense.title);
      setEditAmountText(String(expense.amount));
      setEditPayerMemberId(expense.payerMemberId);
      setEditSplitMemberIds(new Set(expense.splitMemberIds));
      setEditError('');
    },
    []
  );

  const closeExpenseEditor = useCallback(() => {
    setEditingExpenseId(null);
    setEditError('');
  }, []);

  const handleSaveExpense = useCallback(async () => {
    if (!room || !editingExpenseId || !requireOnline() || writing) {
      return;
    }
    const current = room.expenses.find((expense) => expense.id === editingExpenseId);
    if (!current) {
      setEditError('支出が見つかりません。');
      return;
    }
    const amount = moneyLocked
      ? current.amount
      : Math.floor(Number(editAmountText.replace(/,/g, '')) || 0);
    const payerId = moneyLocked ? current.payerMemberId : editPayerMemberId ?? current.payerMemberId;
    const splitIds = moneyLocked ? current.splitMemberIds : Array.from(editSplitMemberIds);
    setWriting(true);
    try {
      const { ok, errorMessage } = await updateExpense(room.id, {
        ...current,
        title: editTitle,
        amount,
        payerMemberId: payerId,
        splitMemberIds: splitIds,
      });
      if (!ok) {
        setEditError(errorMessage ?? '支出の更新に失敗しました。');
        return;
      }
      closeExpenseEditor();
    } finally {
      setWriting(false);
    }
  }, [
    closeExpenseEditor,
    editAmountText,
    editPayerMemberId,
    editSplitMemberIds,
    editTitle,
    editingExpenseId,
    moneyLocked,
    room,
    updateExpense,
    writing,
  ]);

  const handleDeleteExpense = useCallback(() => {
    if (!room || !editingExpenseId || writing || moneyLocked) {
      return;
    }
    Alert.alert('支出を削除', 'この支出を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          if (!requireOnline()) {
            return;
          }
          setWriting(true);
          void deleteExpense(room.id, editingExpenseId)
            .then((result) => {
              if (!result.ok) {
                setEditError(result.errorMessage ?? '支出の削除に失敗しました。');
                return;
              }
              closeExpenseEditor();
            })
            .finally(() => {
              setWriting(false);
            });
        },
      },
    ]);
  }, [closeExpenseEditor, deleteExpense, editingExpenseId, moneyLocked, room, writing]);

  const editSplitPreview = useMemo(() => {
    if (!engine) {
      return null;
    }
    const amount = Math.floor(Number(editAmountText.replace(/,/g, '')) || 0);
    const ids = Array.from(editSplitMemberIds);
    if (amount <= 0 || ids.length === 0) {
      return null;
    }
    const shares = resolveSplitAmounts(amount, { type: 'even', memberIds: ids }, engine.membersById);
    return ids
      .map((id) => `${engine.membersById.get(id)?.displayName ?? '?'} ${formatYen(shares.get(id) ?? 0)}`)
      .join(' · ');
  }, [editAmountText, editSplitMemberIds, engine]);

  if (!room || !engine) {
    return (
      <SubToolScreenTemplate title="グループ" titleFramed={false} onBack={popCurrentTabScreen}>
        <Text style={styles.missingText}>グループが見つかりませんでした。</Text>
      </SubToolScreenTemplate>
    );
  }

  const payerNameByMemberId = new Map(engine.allMembers.map((m) => [m.id, m.displayName]));

  return (
    <>
      <SubToolScreenTemplate
        title={room.title}
        titleFramed={false}
        onBack={popCurrentTabScreen}
        titleTrailing={
          <Pressable
            style={screenTopBarIconButtonStyle}
            onPress={openTitleEditor}
            accessibilityLabel="グループ名を編集"
            hitSlop={8}
          >
            <Ionicons name="pencil-outline" size={18} color={topBarText} />
          </Pressable>
        }
        scrollContentStyle={styles.scrollContent}
      >
        <MoneyLoanFormCard>
          <Text style={formStyles.sectionTitleOnCard}>メンバー</Text>
          <ParticipantChipList
            chips={memberChips}
            compact
            layout="wrap"
            onChipPress={(chip) => handleMemberChipPress(chip.id)}
          />
          <Text style={[styles.memberHint, contentMutedTextStyle(content)]}>タップで外す</Text>
          <Pressable
            style={[formStyles.primaryButton, writing ? { opacity: 0.55 } : null]}
            onPress={openMemberSelector}
            disabled={writing}
          >
            <Text style={formStyles.primaryButtonText}>メンバーを追加</Text>
          </Pressable>
        </MoneyLoanFormCard>

        <MoneyLoanFormCard>
          <Text style={formStyles.sectionTitleOnCard}>支出を追加</Text>
        <View style={formStyles.formRow}>
          <Text style={formStyles.formLabel}>タイトル</Text>
          <TextInput
            style={formStyles.textInput}
            value={expenseTitle}
            onChangeText={setExpenseTitle}
            placeholder="例: 昼食"
            placeholderTextColor={content.contentTextSecondary}
          />
        </View>
        <View style={formStyles.formRow}>
          <Text style={formStyles.formLabel}>金額</Text>
          <TextInput
            style={formStyles.textInput}
            value={expenseAmountText}
            onChangeText={setExpenseAmountText}
            placeholder="例: 9000"
            placeholderTextColor={content.contentTextSecondary}
            keyboardType="number-pad"
          />
        </View>
        <Text style={formStyles.fieldSectionLabel}>立替者</Text>
        <View style={styles.chipRow}>
          {sortedPayerMembers.map((member) => {
            const selected = (payerMemberId ?? engine.allMembers[0]?.id) === member.id;
            return (
              <Pressable
                key={member.id}
                style={[
                  styles.chip,
                  contentTagStyle(content),
                  selected ? contentSelectedOptionStyle(content) : null,
                ]}
                onPress={() => setPayerMemberId(member.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    contentTextStyle(content),
                  ]}
                >
                  {member.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={formStyles.fieldSectionLabel}>割り勘対象</Text>
        <View style={styles.splitMemberList}>
          {sortedSplitMembers.map((member) => {
            const selected = splitMemberIds.has(member.id);
            return (
              <Pressable
                key={member.id}
                style={[
                  styles.splitMemberRow,
                  selected
                    ? { backgroundColor: content.contentPersonTagBg }
                    : null,
                ]}
                onPress={() => toggleSplitMember(member.id)}
              >
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: content.contentSearchFieldBorder, backgroundColor: content.contentInputBg },
                    selected
                      ? {
                          borderColor: content.contentText,
                          backgroundColor: content.contentPersonTagBg,
                        }
                      : null,
                  ]}
                >
                  {selected ? (
                    <Text style={[styles.checkmark, { color: content.contentText }]}>✓</Text>
                  ) : null}
                </View>
                <Text style={[styles.splitMemberName, contentTextStyle(content)]}>
                  {member.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {splitPreview ? (
          <Text style={[styles.splitPreview, contentMutedTextStyle(content)]}>{splitPreview}</Text>
        ) : null}
        {formError ? <Text style={formStyles.formError}>{formError}</Text> : null}
        <Pressable
          style={[formStyles.primaryButton, writing ? { opacity: 0.55 } : null]}
          onPress={() => void handleAddExpense()}
          disabled={writing}
        >
          <Text style={formStyles.primaryButtonText}>支出を登録</Text>
        </Pressable>
      </MoneyLoanFormCard>

      <Text style={formStyles.sectionTitleOnBase}>支出一覧</Text>
      {room.expenses.length === 0 ? (
        <Text style={styles.emptyTextOnBase}>支出はまだありません。</Text>
      ) : (
        room.expenses.map((expense) => {
          const splitNames = expense.splitMemberIds
            .map((id) => payerNameByMemberId.get(id) ?? '?')
            .join('、');
          return (
            <Pressable
              key={expense.id}
              style={[styles.expenseCard, contentSurfaceStyle(content)]}
              onPress={() => openExpenseEditor(expense)}
              accessibilityLabel={`${expense.title}を編集`}
            >
              <Text style={[styles.expenseTitle, contentTextStyle(content)]}>{expense.title}</Text>
              <Text style={[styles.expenseMeta, contentMutedTextStyle(content)]}>
                立替: {payerNameByMemberId.get(expense.payerMemberId) ?? '不明'} ·{' '}
                {formatYen(expense.amount)}
              </Text>
              <Text style={[styles.expenseSplit, contentMutedTextStyle(content)]}>
                割り勘: {splitNames || '—'}
              </Text>
              <Text style={[styles.memberHint, contentMutedTextStyle(content)]}>タップで編集</Text>
            </Pressable>
          );
        })
      )}

      {displayTransfers.length > 0 ? (
        <MoneyLoanFormCard>
          <Text style={formStyles.sectionTitleOnCard}>清算案</Text>
          {displayTransfers.map((transfer) => (
            <SettlementTransferRow
              key={transfer.key}
              transfer={transfer}
              isCompleted={isTransferCompleted(transfer.key)}
              canToggle={canToggleGroupTransfer(room, transfer.fromMemberId, myselfId)}
              onToggle={() => {
                if (!canToggleGroupTransfer(room, transfer.fromMemberId, myselfId) || writing) {
                  return;
                }
                if (!requireOnline()) {
                  return;
                }
                setWriting(true);
                void toggleTransferCompleted(transfer.key)
                  .then((result) => {
                    if (result.errorMessage) {
                      Alert.alert('更新できませんでした', result.errorMessage);
                    }
                  })
                  .finally(() => {
                    setWriting(false);
                  });
              }}
            />
          ))}
        </MoneyLoanFormCard>
      ) : null}
      </SubToolScreenTemplate>

      <Modal
        visible={titleEditorVisible}
        transparent
        animationType="fade"
        onRequestClose={closeTitleEditor}
      >
        <View style={styles.titleModalOverlay}>
          <View style={[styles.titleModalCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.titleModalHeading, contentTextStyle(content)]}>グループ名を編集</Text>
            <TextInput
              style={[styles.titleModalInput, contentInputStyle(content)]}
              value={titleDraft}
              onChangeText={(value) => {
                setTitleDraft(value);
                if (titleError) {
                  setTitleError('');
                }
              }}
              placeholder="例: 北海道旅行"
              placeholderTextColor={content.contentTextSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void handleSaveTitle()}
            />
            {titleError ? <Text style={styles.titleModalError}>{titleError}</Text> : null}
            <View style={styles.titleModalActions}>
              <Pressable
                style={[styles.titleModalCancel, contentSurfaceStyle(content)]}
                onPress={closeTitleEditor}
              >
                <Text style={[styles.titleModalCancelText, contentTextStyle(content)]}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.titleModalSave,
                  contentFilledButtonStyle(content),
                  writing ? { opacity: 0.55 } : null,
                ]}
                onPress={() => void handleSaveTitle()}
                disabled={writing}
              >
                <Text style={[styles.titleModalSaveText, contentFilledButtonTextStyle(content)]}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingExpenseId != null}
        transparent
        animationType="fade"
        onRequestClose={closeExpenseEditor}
      >
        <View style={styles.titleModalOverlay}>
          <View style={[styles.titleModalCard, styles.editModalCard, contentSurfaceStyle(content)]}>
            <Text style={[styles.titleModalHeading, contentTextStyle(content)]}>支出を編集</Text>
            <Text style={formStyles.formLabel}>タイトル</Text>
            <TextInput
              style={[styles.titleModalInput, contentInputStyle(content)]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="例: 昼食"
              placeholderTextColor={content.contentTextSecondary}
            />
            {moneyLocked ? (
              <>
                <Text style={[styles.memberHint, contentMutedTextStyle(content)]}>
                  {SETTLED_MONEY_LOCK_MESSAGE}
                </Text>
                <Text style={[styles.expenseMeta, contentMutedTextStyle(content)]}>
                  立替: {payerNameByMemberId.get(
                    room.expenses.find((expense) => expense.id === editingExpenseId)?.payerMemberId ?? ''
                  ) ?? '不明'}{' '}
                  ·{' '}
                  {formatYen(
                    room.expenses.find((expense) => expense.id === editingExpenseId)?.amount ?? 0
                  )}
                </Text>
              </>
            ) : (
              <>
                <Text style={formStyles.formLabel}>金額</Text>
                <TextInput
                  style={[styles.titleModalInput, contentInputStyle(content)]}
                  value={editAmountText}
                  onChangeText={setEditAmountText}
                  keyboardType="number-pad"
                  placeholderTextColor={content.contentTextSecondary}
                />
                <Text style={formStyles.fieldSectionLabel}>立替者</Text>
                <View style={styles.chipRow}>
                  {engine.allMembers.map((member) => {
                    const selected = editPayerMemberId === member.id;
                    return (
                      <Pressable
                        key={member.id}
                        style={[
                          styles.chip,
                          contentTagStyle(content),
                          selected ? contentSelectedOptionStyle(content) : null,
                        ]}
                        onPress={() => setEditPayerMemberId(member.id)}
                      >
                        <Text style={[styles.chipText, contentTextStyle(content)]}>{member.displayName}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={formStyles.fieldSectionLabel}>割り勘対象</Text>
                {engine.allMembers.map((member) => {
                  const selected = editSplitMemberIds.has(member.id);
                  return (
                    <Pressable
                      key={member.id}
                      style={styles.splitMemberRow}
                      onPress={() => {
                        setEditSplitMemberIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(member.id)) {
                            next.delete(member.id);
                          } else {
                            next.add(member.id);
                          }
                          return next;
                        });
                      }}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          { borderColor: content.contentSearchFieldBorder, backgroundColor: content.contentInputBg },
                          selected
                            ? { borderColor: content.contentText, backgroundColor: content.contentPersonTagBg }
                            : null,
                        ]}
                      >
                        {selected ? (
                          <Text style={[styles.checkmark, { color: content.contentText }]}>✓</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.splitMemberName, contentTextStyle(content)]}>{member.displayName}</Text>
                    </Pressable>
                  );
                })}
                {editSplitPreview ? (
                  <Text style={[styles.splitPreview, contentMutedTextStyle(content)]}>{editSplitPreview}</Text>
                ) : null}
              </>
            )}
            {editError ? <Text style={styles.titleModalError}>{editError}</Text> : null}
            <View style={styles.titleModalActions}>
              {moneyLocked ? null : (
                <Pressable
                  style={styles.titleModalCancel}
                  onPress={handleDeleteExpense}
                  disabled={writing}
                >
                  <Text style={[styles.titleModalCancelText, { color: '#b91c1c' }]}>削除</Text>
                </Pressable>
              )}
              <Pressable style={styles.titleModalCancel} onPress={closeExpenseEditor} disabled={writing}>
                <Text style={[styles.titleModalCancelText, contentTextStyle(content)]}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[styles.titleModalSave, contentFilledButtonStyle(content), writing ? { opacity: 0.55 } : null]}
                onPress={() => void handleSaveExpense()}
                disabled={writing}
              >
                <Text style={[styles.titleModalSaveText, contentFilledButtonTextStyle(content)]}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <EntrySelectorModal
        visible={memberSelectorVisible}
        selectorTab="individual"
        onTabChange={() => undefined}
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
        selectedIndividualIds={selectedMemberIds}
        selectedGroupValues={new Set()}
        onToggleIndividual={(friendId) => {
          setSelectedMemberIds((prev) => {
            const next = new Set(prev);
            if (next.has(friendId)) {
              next.delete(friendId);
            } else {
              next.add(friendId);
            }
            return next;
          });
        }}
        onToggleGroup={() => undefined}
        onCancel={() => setMemberSelectorVisible(false)}
        onConfirm={() => void handleAddMembers()}
        onPersonCreated={loadFriends}
        enableGroupTab={false}
        selectionTitle="追加するメンバー"
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
  missingText: {
    fontSize: 14,
    color: Theme.topBarText,
  },
  titleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  titleModalCard: {
    alignSelf: 'stretch',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 10,
    maxHeight: '86%',
  },
  editModalCard: {
    overflow: 'hidden',
  },
  memberHint: {
    fontSize: 12,
    lineHeight: 16,
  },
  titleModalHeading: {
    fontSize: 16,
    fontWeight: '700',
  },
  titleModalInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 40,
  },
  titleModalError: {
    fontSize: 12,
    color: '#b91c1c',
  },
  titleModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 8,
    marginTop: 4,
  },
  titleModalCancel: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleModalCancelText: {
    fontWeight: '700',
    fontSize: 14,
  },
  titleModalSave: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleModalSaveText: {
    fontWeight: '700',
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  splitMemberList: {
    gap: 4,
  },
  splitMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: Radius.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '900',
  },
  splitMemberName: {
    fontSize: 14,
    fontWeight: '600',
  },
  splitPreview: {
    fontSize: 11,
    lineHeight: 16,
  },
  emptyTextOnBase: {
    fontSize: 13,
    color: Theme.topBarText,
    opacity: 0.85,
  },
  expenseCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
  },
  expenseTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  expenseMeta: {
    fontSize: 12,
  },
  expenseSplit: {
    fontSize: 11,
  },
});
