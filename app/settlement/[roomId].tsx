import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Theme, Radius, Spacing } from '@/constants/theme';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { screenTopBarIconButtonStyle } from '@/components/screen/ScreenTopBar';
import { ParticipantChipList } from '@/components/participant/ParticipantChipList';
import { SettlementTransferRow } from '@/components/settlement';
import { useMoneyLoanFormStyles } from '@/components/money-loan/moneyLoanFormStyles';
import { useSettlementMock } from '@/contexts/SettlementMockContext';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { getAllFriends, getMyself, initializeDatabase } from '@/db';
import type { Friend } from '@/types';
import type { SettlementExpense, SettlementRoomMember } from '@/types/settlement';
import { buildFriendNameById, formatYen } from '@/utils/moneyLoanHelpers';
import {
  computeMemberBalances,
  computeSettlementTransfers,
  resolveSplitAmounts,
} from '@/utils/settlementEngine';
import {
  buildSettlementMemberChips,
  withResolvedSettlementRoomName,
} from '@/utils/settlementMockHelpers';
import { buildSettlementTransferDisplays } from '@/utils/settlementTransferHelpers';
import { sortMembersBySelectedId, sortMembersBySelectedIds } from '@/utils/selectionSortHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
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
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { getRoom, addExpense, updateRoomTitle, isTransferCompleted, toggleTransferCompleted } =
    useSettlementMock();
  const storedRoom = roomId ? getRoom(roomId) : undefined;

  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmountText, setExpenseAmountText] = useState('');
  const [payerMemberId, setPayerMemberId] = useState<string | null>(null);
  const [splitMemberIds, setSplitMemberIds] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [myselfId, setMyselfId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleError, setTitleError] = useState('');
  const [titleEditorVisible, setTitleEditorVisible] = useState(false);
  const appTheme = useAppThemeOptional();
  const topBarText = appTheme?.colors.topBarText ?? Theme.topBarText;
  const formStyles = useMoneyLoanFormStyles();
  const content = useContentColors();

  const loadFriends = useCallback(() => {
    initializeDatabase();
    setFriends(getAllFriends());
    setMyselfId(getMyself());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFriends();
    }, [loadFriends])
  );

  const friendNameById = useMemo(() => buildFriendNameById(friends), [friends]);
  const friendPhotoById = useMemo(
    () => new Map(friends.map((friend) => [friend.id, friend.photoUri ?? null])),
    [friends]
  );

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

  const handleSaveTitle = useCallback(() => {
    if (!room) {
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
    const ok = updateRoomTitle(room.id, normalized);
    if (!ok) {
      setTitleError('グループ名の更新に失敗しました。');
      return;
    }
    setTitleError('');
    setTitleEditorVisible(false);
  }, [room, titleDraft, updateRoomTitle]);

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

  const balances = useMemo(
    () => (engine ? computeMemberBalances(engine.members, engine.expenses) : []),
    [engine]
  );

  const transfers = useMemo(() => computeSettlementTransfers(balances), [balances]);

  const displayTransfers = useMemo(() => {
    if (!room || transfers.length === 0) {
      return [];
    }
    const nameByMemberId = new Map(balances.map((balance) => [balance.memberId, balance.displayName]));
    return buildSettlementTransferDisplays(room.id, transfers, nameByMemberId);
  }, [balances, room, transfers]);

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

  const handleAddExpense = useCallback(() => {
    if (!room || !engine) {
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
    const created = addExpense({
      roomId: room.id,
      payerMemberId: payerId,
      title: expenseTitle,
      amount,
      splitMemberIds: splitIds,
    });
    if (!created) {
      setFormError('タイトルと金額を入力してください。');
      return;
    }
    setFormError('');
    setExpenseTitle('');
    setExpenseAmountText('');
    setSplitMemberIds(new Set(room.members.map((member) => member.id)));
  }, [
    addExpense,
    engine,
    expenseAmountText,
    expenseTitle,
    myselfId,
    payerMemberId,
    room,
    splitMemberIds,
  ]);

  if (!room || !engine) {
    return (
      <SubToolScreenTemplate title="グループ" onBack={() => router.back()}>
        <Text style={styles.missingText}>グループが見つかりませんでした。</Text>
      </SubToolScreenTemplate>
    );
  }

  const payerNameByMemberId = new Map(engine.allMembers.map((m) => [m.id, m.displayName]));

  return (
    <>
      <SubToolScreenTemplate
        title={room.title}
        onBack={() => router.back()}
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
        keyboardAware
        extraScrollHeight={24}
        scrollContentStyle={styles.scrollContent}
      >
        <View style={formStyles.formCard}>
          <Text style={formStyles.sectionTitleOnCard}>メンバー</Text>
          <ParticipantChipList chips={memberChips} compact layout="wrap" />
        </View>

        <View style={formStyles.formCard}>
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
        <Pressable style={formStyles.primaryButton} onPress={handleAddExpense}>
          <Text style={formStyles.primaryButtonText}>支出を登録</Text>
        </Pressable>
      </View>

      <Text style={formStyles.sectionTitleOnBase}>支出一覧</Text>
      {room.expenses.length === 0 ? (
        <Text style={styles.emptyTextOnBase}>支出はまだありません。</Text>
      ) : (
        room.expenses.map((expense) => {
          const splitNames = expense.splitMemberIds
            .map((id) => payerNameByMemberId.get(id) ?? '?')
            .join('、');
          return (
            <View key={expense.id} style={[styles.expenseCard, contentSurfaceStyle(content)]}>
              <Text style={[styles.expenseTitle, contentTextStyle(content)]}>{expense.title}</Text>
              <Text style={[styles.expenseMeta, contentMutedTextStyle(content)]}>
                立替: {payerNameByMemberId.get(expense.payerMemberId) ?? '不明'} ·{' '}
                {formatYen(expense.amount)}
              </Text>
              <Text style={[styles.expenseSplit, contentMutedTextStyle(content)]}>
                割り勘: {splitNames || '—'}
              </Text>
            </View>
          );
        })
      )}

      {displayTransfers.length > 0 ? (
        <View style={formStyles.formCard}>
          <Text style={formStyles.sectionTitleOnCard}>清算案</Text>
          {displayTransfers.map((transfer) => (
            <SettlementTransferRow
              key={transfer.key}
              transfer={transfer}
              isCompleted={isTransferCompleted(transfer.key)}
              onToggle={() => toggleTransferCompleted(transfer.key)}
            />
          ))}
        </View>
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
              onSubmitEditing={handleSaveTitle}
            />
            {titleError ? <Text style={styles.titleModalError}>{titleError}</Text> : null}
            <View style={styles.titleModalActions}>
              <Pressable
                style={[styles.titleModalCancel, contentSurfaceStyle(content)]}
                onPress={closeTitleEditor}
              >
                <Text style={[styles.titleModalCancelText, contentTextStyle(content)]}>キャンセル</Text>
              </Pressable>
              <Pressable style={styles.titleModalSave} onPress={handleSaveTitle}>
                <Text style={styles.titleModalSaveText}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
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
    borderColor: Theme.btnPrimaryBg,
    borderRadius: Radius.sm,
    backgroundColor: Theme.btnPrimaryBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleModalSaveText: {
    color: Theme.btnPrimaryText,
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
