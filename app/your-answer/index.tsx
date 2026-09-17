import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { popCurrentTabScreen } from '@/utils/tabNavigation';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import { CodexQuestionCard } from '@/components/your-answer/CodexQuestionCard';
import { AnswerPersonCell } from '@/components/your-answer/AnswerPersonCell';
import { answerRowStyles } from '@/components/your-answer/answerRowStyles';
import { formatPatternIndex, getDesignPatternTone } from '@/constants/designPatterns';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  createYourQuestion,
  deleteYourQuestion,
  deleteYourQuestionAnswer,
  getAllYourQuestionAnswers,
  getDistinctAffiliations,
  getDistinctExperiences,
  getYourQuestions,
  initializeDatabase,
  upsertYourQuestionAnswer,
} from '@/db';
import type { Friend, YourQuestion, YourQuestionAnswer } from '@/types';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';

type Option = { label: string; value: string };
type FilterKey = 'all' | 'empty' | 'logged';

type BatchLine = {
  friendId: string;
  body: string;
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'empty', label: 'EMPTY' },
  { key: 'logged', label: 'LOGGED' },
];

const CATALOG_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'empty', label: '未記入' },
  { key: 'logged', label: '記録あり' },
];

export default function YourAnswerScreen() {
  const kit = useUiKit();
  const { variant, patternId } = useAppTheme();
  const { pattern, tone } = useMemo(
    () => getDesignPatternTone(patternId, variant),
    [patternId, variant]
  );
  const palette = tone.colors;
  const shape = pattern.shape;
  const isCatalog = patternId === 'catalog';
  const filterItems = isCatalog ? CATALOG_FILTERS : FILTERS;

  const [questions, setQuestions] = useState<YourQuestion[]>([]);
  const [answers, setAnswers] = useState<YourQuestionAnswer[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const [createVisible, setCreateVisible] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleError, setTitleError] = useState('');

  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorQuestionId, setSelectorQuestionId] = useState<string | null>(null);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());

  const [batchQuestionId, setBatchQuestionId] = useState<string | null>(null);
  const [batchLines, setBatchLines] = useState<BatchLine[]>([]);
  const [batchError, setBatchError] = useState('');

  const friendById = useMemo(() => {
    const map = new Map<string, Friend>();
    friends.forEach((friend) => map.set(friend.id, friend));
    return map;
  }, [friends]);

  const answersByQuestionId = useMemo(() => {
    const grouped: Record<string, YourQuestionAnswer[]> = {};
    answers.forEach((answer) => {
      const list = grouped[answer.questionId] ?? [];
      list.push(answer);
      grouped[answer.questionId] = list;
    });
    return grouped;
  }, [answers]);

  const indexByQuestionId = useMemo(() => {
    const map = new Map<string, number>();
    questions.forEach((question, index) => {
      map.set(question.id, index);
    });
    return map;
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return questions.filter((question) => {
      if (needle && !question.title.toLowerCase().includes(needle)) {
        return false;
      }
      const count = answersByQuestionId[question.id]?.length ?? 0;
      if (filter === 'empty') return count === 0;
      if (filter === 'logged') return count > 0;
      return true;
    });
  }, [answersByQuestionId, filter, query, questions]);

  const loadData = useCallback(() => {
    initializeDatabase();
    setQuestions(getYourQuestions());
    setAnswers(getAllYourQuestionAnswers());
    setFriends(getAllFriendsInDefaultOrder());
    setAffiliationOptions(getDistinctAffiliations().map((value) => ({ label: value, value })));
    setExperienceOptions(getDistinctExperiences().map((value) => ({ label: value, value })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const openCreateModal = useCallback(() => {
    setTitleDraft('');
    setTitleError('');
    setCreateVisible(true);
  }, []);

  const handleCreateQuestion = useCallback(() => {
    const title = titleDraft.trim();
    if (!title) {
      setTitleError('質問を入力してください');
      return;
    }
    initializeDatabase();
    const question = createYourQuestion({ title });
    if (!question) {
      setTitleError('作成に失敗しました');
      return;
    }
    setCreateVisible(false);
    loadData();
    setExpandedId(question.id);
  }, [loadData, titleDraft]);

  const confirmDeleteQuestion = useCallback(
    (question: YourQuestion) => {
      Alert.alert('質問を削除', `「${question.title}」を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            initializeDatabase();
            if (deleteYourQuestion(question.id)) {
              if (expandedId === question.id) setExpandedId(null);
              loadData();
            } else {
              Alert.alert('エラー', '削除に失敗しました');
            }
          },
        },
      ]);
    },
    [expandedId, loadData]
  );

  const openAddAnswers = useCallback(
    (questionId: string) => {
      if (friends.length === 0) {
        Alert.alert('人物がいません', '先に人物を登録してください。');
        return;
      }
      setSelectorQuestionId(questionId);
      setSelectedIndividualIds(new Set());
      setSelectedGroupValues(new Set());
      setSelectorTab('individual');
      setSelectorNameFilter('');
      setSelectorAffiliationFilter('');
      setSelectorExperienceFilter('');
      setSelectorVisible(true);
    },
    [friends.length]
  );

  const handleSelectorCancel = useCallback(() => {
    setSelectorVisible(false);
    setSelectorQuestionId(null);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, []);

  const handleSelectorConfirm = useCallback(() => {
    const questionId = selectorQuestionId;
    const friendIds = [...selectedIndividualIds];
    setSelectorVisible(false);
    setSelectorQuestionId(null);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    if (!questionId || friendIds.length === 0) {
      Alert.alert('対象者がいません', '記録する人物を1人以上選んでください。');
      return;
    }
    const existing = answersByQuestionId[questionId] ?? [];
    const bodyByFriendId = new Map(existing.map((answer) => [answer.friendId, answer.body]));
    setBatchError('');
    setBatchQuestionId(questionId);
    setBatchLines(
      friendIds.map((friendId) => ({
        friendId,
        body: bodyByFriendId.get(friendId) ?? '',
      }))
    );
  }, [answersByQuestionId, selectedIndividualIds, selectorQuestionId]);

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

  const openEditAnswer = useCallback((answer: YourQuestionAnswer) => {
    setBatchError('');
    setBatchQuestionId(answer.questionId);
    setBatchLines([{ friendId: answer.friendId, body: answer.body }]);
  }, []);

  const confirmDeleteAnswer = useCallback(
    (answer: YourQuestionAnswer) => {
      const friendName = friendById.get(answer.friendId)?.name ?? 'この人物';
      Alert.alert('回答を削除', `${friendName}さんの回答を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            initializeDatabase();
            if (deleteYourQuestionAnswer(answer.id)) {
              loadData();
            } else {
              Alert.alert('エラー', '削除に失敗しました');
            }
          },
        },
      ]);
    },
    [friendById, loadData]
  );

  const handleSaveBatch = useCallback(() => {
    if (!batchQuestionId) return;
    const filled = batchLines.filter((line) => line.body.trim().length > 0);
    if (filled.length === 0) {
      setBatchError('1人以上、回答を入力してください');
      return;
    }
    initializeDatabase();
    const failed = filled.some(
      (line) =>
        !upsertYourQuestionAnswer({
          questionId: batchQuestionId,
          friendId: line.friendId,
          body: line.body,
        })
    );
    if (failed) {
      setBatchError('保存に失敗しました');
      return;
    }
    setBatchQuestionId(null);
    setBatchLines([]);
    loadData();
  }, [batchLines, batchQuestionId, loadData]);

  const header = (
    <View
      style={[
        styles.hud,
        {
          backgroundColor: palette.headerBg,
          borderBottomColor: palette.headerBorder,
          borderBottomWidth: shape.cardBorderWidth,
          paddingHorizontal: kit.subToolScreenPaddingHorizontal,
        },
      ]}
    >
      <View style={styles.hudRow}>
        <View
          style={[
            styles.searchWrap,
            {
              borderColor: palette.headerBorder,
              backgroundColor: palette.card,
              borderWidth: shape.cardBorderWidth,
              borderRadius: shape.innerRadius,
            },
          ]}
        >
          <Text style={[styles.searchKicker, { color: palette.cyan }]}>
            {isCatalog ? '探す' : 'SCAN'}
          </Text>
          <TextInput
            style={[styles.searchInput, { color: palette.cardInk }]}
            value={query}
            onChangeText={setQuery}
            placeholder="質問を探す"
            placeholderTextColor={palette.cardMuted}
          />
        </View>
        <Pressable
          style={[
            styles.addSquare,
            { backgroundColor: palette.addBtn, borderRadius: shape.innerRadius },
          ]}
          onPress={openCreateModal}
          accessibilityLabel="質問を追加"
        >
          <Text style={[styles.addSquareText, { color: palette.addBtnInk }]}>＋</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {filterItems.map((item) => {
          const on = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: on ? palette.chipOn : palette.chipBg,
                  borderColor: on ? palette.chipOn : palette.headerBorder,
                },
              ]}
            >
              <Text style={[styles.filterChipText, { color: on ? palette.chipOnInk : palette.cardMuted }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <>
      <SubToolScreenTemplate
        title="あなたの～は？"
        onBack={popCurrentTabScreen}
        header={header}
        scrollContentStyle={styles.scrollContent}
      >
        {filteredQuestions.length === 0 ? (
          <View style={styles.emptyWrap}>
            {shape.offsetDistance > 0 ? (
              <View
                style={[
                  styles.offset,
                  {
                    backgroundColor: palette.offset,
                    borderRadius: shape.cardBorderRadius,
                    top: shape.offsetDistance,
                    left: shape.offsetDistance,
                    right: -shape.offsetDistance,
                    bottom: -shape.offsetDistance,
                  },
                ]}
              />
            ) : null}
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: palette.card,
                  borderColor: palette.cyan,
                  borderRadius: shape.cardBorderRadius,
                  borderWidth: shape.cardBorderWidth,
                },
              ]}
            >
              <Text style={[styles.emptyKicker, { color: palette.cyan }]}>
                {isCatalog ? '記録なし' : 'NO SIGNAL'}
              </Text>
              <Text style={[styles.emptyTitle, { color: palette.cardInk }]}>
                {questions.length === 0 ? '質問カードがまだない' : '一致する質問がありません'}
              </Text>
              <Text style={[styles.emptyHint, { color: palette.cardMuted }]}>
                {questions.length === 0
                  ? 'ヘッダーの＋から質問を追加して、人物の回答をログしていこう。'
                  : '検索や絞り込みを変えてみてください。'}
              </Text>
            </View>
          </View>
        ) : (
          filteredQuestions.map((question) => {
            const questionAnswers = answersByQuestionId[question.id] ?? [];
            return (
              <CodexQuestionCard
                key={question.id}
                indexLabel={formatPatternIndex(patternId, indexByQuestionId.get(question.id) ?? 0)}
                title={question.title}
                answerCount={questionAnswers.length}
                expanded={expandedId === question.id}
                colors={palette}
                shape={shape}
                answers={questionAnswers.map((answer) => {
                  const friend = friendById.get(answer.friendId);
                  return {
                    id: answer.id,
                    name: friend?.name ?? '不明な人物',
                    photoUri: friend?.photoUri ?? null,
                    body: answer.body,
                  };
                })}
                onToggle={() => setExpandedId(expandedId === question.id ? null : question.id)}
                onLongPressQuestion={() => confirmDeleteQuestion(question)}
                onPressAnswer={(answerId) => {
                  const answer = questionAnswers.find((item) => item.id === answerId);
                  if (answer) openEditAnswer(answer);
                }}
                onLongPressAnswer={(answerId) => {
                  const answer = questionAnswers.find((item) => item.id === answerId);
                  if (answer) confirmDeleteAnswer(answer);
                }}
                onAddAnswers={() => openAddAnswers(question.id)}
              />
            );
          })
        )}
      </SubToolScreenTemplate>

      <Modal
        visible={createVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.card,
                borderColor: palette.cyan,
                borderRadius: shape.cardBorderRadius,
                borderWidth: shape.cardBorderWidth,
              },
            ]}
          >
            <Text style={[styles.modalKicker, { color: palette.cyan }]}>NEW SIGNAL</Text>
            <Text style={[styles.modalTitle, { color: palette.cardInk }]}>質問を追加</Text>
            <TextInput
              style={[styles.textInput, { color: palette.cardInk, borderColor: palette.headerBorder }]}
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="好きな食べ物は？"
              placeholderTextColor={palette.cardMuted}
              autoFocus
            />
            {titleError ? <Text style={styles.formError}>{titleError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalButton} onPress={() => setCreateVisible(false)}>
                <Text style={[styles.modalButtonText, { color: palette.cardMuted }]}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSave,
                  { backgroundColor: palette.addBtn, borderRadius: shape.innerRadius },
                ]}
                onPress={handleCreateQuestion}
              >
                <Text style={[styles.modalSaveText, { color: palette.addBtnInk }]}>追加</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={batchQuestionId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setBatchQuestionId(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.batchCard,
              {
                backgroundColor: palette.card,
                borderColor: palette.accent,
                borderRadius: shape.cardBorderRadius,
                borderWidth: shape.cardBorderWidth,
              },
            ]}
          >
            <Text style={[styles.modalKicker, { color: palette.accent }]}>BATCH LOG</Text>
            <Text style={[styles.modalTitle, { color: palette.cardInk }]}>
              {batchLines.length}人の回答
            </Text>
            <KeyboardAwareScrollView
              style={styles.batchScroll}
              contentContainerStyle={styles.batchScrollContent}
              keyboardShouldPersistTaps="handled"
              enableOnAndroid
              extraScrollHeight={24}
            >
              {batchLines.map((line, index) => {
                const friend = friendById.get(line.friendId);
                const name = friend?.name ?? '不明な人物';
                return (
                  <View key={line.friendId} style={answerRowStyles.row}>
                    <AnswerPersonCell
                      name={name}
                      photoUri={friend?.photoUri ?? null}
                      colors={palette}
                    />
                    <TextInput
                      style={[
                        answerRowStyles.well,
                        answerRowStyles.body,
                        {
                          color: palette.cardInk,
                          backgroundColor: palette.logBg,
                          borderColor: palette.cyan,
                          borderRadius: shape.innerRadius,
                        },
                      ]}
                      value={line.body}
                      onChangeText={(body) =>
                        setBatchLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, body } : item
                          )
                        )
                      }
                      placeholder="回答を入力"
                      placeholderTextColor={palette.cardMuted}
                      multiline
                      textAlignVertical="top"
                    />
                  </View>
                );
              })}
            </KeyboardAwareScrollView>
            {batchError ? <Text style={styles.formError}>{batchError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalButton} onPress={() => setBatchQuestionId(null)}>
                <Text style={[styles.modalButtonText, { color: palette.cardMuted }]}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalSave,
                  { backgroundColor: palette.addBtn, borderRadius: shape.innerRadius },
                ]}
                onPress={handleSaveBatch}
              >
                <Text style={[styles.modalSaveText, { color: palette.addBtnInk }]}>保存</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
        onPersonCreated={() => setFriends(getAllFriendsInDefaultOrder())}
        enableGroupTab={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 14,
    paddingBottom: 48,
    gap: 12,
  },
  hud: {
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 2,
    gap: 10,
  },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchWrap: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 42,
    justifyContent: 'center',
  },
  searchKicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  searchInput: {
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
    margin: 0,
  },
  addSquare: {
    width: 42,
    height: 42,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSquareText: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: -1,
  },
  filterRow: {
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  emptyWrap: {
    position: 'relative',
    marginTop: 8,
  },
  offset: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    borderRadius: 6,
  },
  emptyCard: {
    borderWidth: 2,
    borderRadius: 6,
    padding: 20,
    gap: 8,
  },
  emptyKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,10,20,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 2,
    borderRadius: 6,
    padding: 16,
    gap: 10,
  },
  batchCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '82%',
    borderWidth: 2,
    borderRadius: 6,
    padding: 16,
    gap: 10,
  },
  modalKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  textInput: {
    borderWidth: 1.5,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  formError: {
    color: '#e11d48',
    fontSize: 13,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalSave: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '800',
  },
  batchScroll: {
    maxHeight: 360,
  },
  batchScrollContent: {
    gap: 8,
    paddingBottom: 4,
  },
});
