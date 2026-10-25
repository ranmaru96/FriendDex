import { useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PickerDoneOverlay } from '@/components/ui/PickerDoneOverlay';
import { Radius, Typography } from '@/constants/theme';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useDismissPickerOnKeyboardShow } from '@/hooks/useDismissPickerOnKeyboardShow';
import type { ProfileMemo, ProfileMemoTag } from '@/types';
import { dismissKeyboardFocus } from '@/utils/dismissKeyboardFocus';
import { parseDateKey } from '@/utils/eventHelpers';
import {
  eventMemoDateBounds,
  type EventMemoDateRange,
  isBlankMemo,
  withTrailingBlank,
} from '@/utils/eventParticipantMemos';
import { getScaledHomeCardPhotoCornerRadius } from '@/utils/homeCardPhotoMetrics';
import { PROFILE_MEMO_TAG_LABEL } from '@/utils/profileMemos';
import {
  contentDateTimePickerProps,
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';

const AVATAR_SIZE = 36;
const READ_MEMO_LINE_HEIGHT = 18;
const READ_MEMO_PADDING_V = 6;
const READ_MEMO_ROW_HEIGHT =
  READ_MEMO_LINE_HEIGHT + READ_MEMO_PADDING_V * 2 + StyleSheet.hairlineWidth * 2;
const MEMO_TAGS: ProfileMemoTag[] = ['habit', 'says'];
const MEMO_KIND_ICON = {
  note: { name: 'notebook', color: '#8b5fd4' },
  habit: { name: 'cat', color: '#3a9d5a' },
  says: { name: 'comment-account-outline', color: '#d44a4a' },
} as const;

export type EventParticipantMemoPerson = {
  friendId: string;
  name: string;
  photoUri: string | null;
  memos: ProfileMemo[];
};

type EventParticipantMemoListProps = {
  people: EventParticipantMemoPerson[];
  dateRange: EventMemoDateRange;
  onChangeMemos?: (friendId: string, memos: ProfileMemo[]) => void;
  readOnly?: boolean;
};

type OpenMemoDate = {
  friendId: string;
  memoId: string;
};

const formatDateToYMD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toggleMemoTag = (tags: ProfileMemoTag[], tag: ProfileMemoTag): ProfileMemoTag[] =>
  tags[0] === tag ? [] : [tag];

export function EventParticipantMemoList({
  people,
  dateRange,
  onChangeMemos,
  readOnly = false,
}: EventParticipantMemoListProps) {
  const content = useContentColors();
  const appTheme = useAppThemeOptional();
  const dateTimePickerProps = contentDateTimePickerProps(appTheme?.variant);
  const { width: screenWidth } = useWindowDimensions();
  const avatarSize = readOnly ? READ_MEMO_ROW_HEIGHT : AVATAR_SIZE;
  const avatarRadius = getScaledHomeCardPhotoCornerRadius(avatarSize, screenWidth, 4);
  const [openMemoDate, setOpenMemoDate] = useState<OpenMemoDate | null>(null);
  const dateEditable = !readOnly && dateRange.endDateKey > dateRange.startDateKey;
  const dateBounds = eventMemoDateBounds(dateRange);
  useDismissPickerOnKeyboardShow(openMemoDate != null, () => setOpenMemoDate(null));

  if (people.length === 0) {
    return null;
  }

  const updateMemo = (person: EventParticipantMemoPerson, memoId: string, patch: Partial<ProfileMemo>) => {
    const next = person.memos.map((memo) => (memo.id === memoId ? { ...memo, ...patch } : memo));
    onChangeMemos?.(person.friendId, withTrailingBlank(next, dateRange.startDateKey));
  };

  const removeMemo = (person: EventParticipantMemoPerson, memoId: string) => {
    Alert.alert('メモを削除', '予定を保存すると、人物カードからも消えます。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          if (openMemoDate?.memoId === memoId) {
            setOpenMemoDate(null);
          }
          onChangeMemos?.(
            person.friendId,
            withTrailingBlank(
              person.memos.filter((memo) => memo.id !== memoId),
              dateRange.startDateKey
            )
          );
        },
      },
    ]);
  };

  return (
    <View style={styles.list}>
      {people.map((person) => {
        const initial = Array.from(person.name.trim())[0] ?? '?';
        return (
          <View key={person.friendId} style={styles.personBlock} accessibilityLabel={`${person.name}のメモ`}>
            <View style={[styles.rail, { width: avatarSize }]}>
              {person.photoUri ? (
                <Image
                  source={{ uri: person.photoUri }}
                  style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarRadius }]}
                  accessibilityLabel={person.name}
                />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    styles.avatarFallback,
                    {
                      width: avatarSize,
                      height: avatarSize,
                      borderRadius: avatarRadius,
                      backgroundColor: content.contentPhotoPlaceholder,
                    },
                  ]}
                  accessibilityLabel={person.name}
                >
                  <Text
                    style={[
                      styles.avatarInitial,
                      readOnly ? styles.avatarInitialCompact : null,
                      { color: content.contentPhotoPlaceholderText },
                    ]}
                  >
                    {initial}
                  </Text>
                </View>
              )}
              <View style={[styles.railLine, { backgroundColor: content.contentDivider }]} />
            </View>
            <View style={styles.fields}>
              {person.memos.map((memo) => {
                if (readOnly && (isBlankMemo(memo) || memo.text.trim().length === 0)) {
                  return null;
                }
                if (readOnly) {
                  const kinds = memo.tags.length > 0 ? memo.tags : (['note'] as const);
                  return (
                    <View
                      key={memo.id}
                      style={[
                        styles.readMemoCard,
                        { backgroundColor: content.contentCard, borderColor: content.contentBorder },
                      ]}
                    >
                      <View style={styles.readMemoIconCol}>
                        {kinds.map((kind) => (
                          <MaterialCommunityIcons
                            key={kind}
                            name={MEMO_KIND_ICON[kind].name}
                            size={13}
                            color={MEMO_KIND_ICON[kind].color}
                          />
                        ))}
                      </View>
                      <Text style={[styles.readMemoText, contentTextStyle(content)]}>{memo.text}</Text>
                    </View>
                  );
                }
                const blank = isBlankMemo(memo);
                const dateLabel = memo.date || dateRange.startDateKey;
                const dateOpen =
                  dateEditable &&
                  openMemoDate?.friendId === person.friendId &&
                  openMemoDate.memoId === memo.id;
                const visibleTags = MEMO_TAGS;
                return (
                  <View
                    key={memo.id}
                    style={[
                      styles.memoCard,
                      {
                        backgroundColor: content.contentCard,
                        borderColor: content.contentBorder,
                      },
                    ]}
                  >
                    <TextInput
                      style={[styles.memoInput, contentInputStyle(content)]}
                      placeholder="メモ"
                      placeholderTextColor={content.contentTextSecondary}
                      multiline
                      value={memo.text}
                      onChangeText={(text) => updateMemo(person, memo.id, { text })}
                    />
                    <View style={styles.metaRow}>
                      {dateEditable ? (
                        <Pressable
                          style={[
                            styles.dateButton,
                            {
                              borderColor: content.contentSearchFieldBorder,
                              backgroundColor: content.contentInputBg,
                            },
                          ]}
                          onPress={() => {
                            dismissKeyboardFocus();
                            if (!memo.date) {
                              updateMemo(person, memo.id, { date: dateRange.startDateKey });
                            }
                            setOpenMemoDate({ friendId: person.friendId, memoId: memo.id });
                          }}
                          accessibilityLabel={`日付 ${dateLabel}`}
                          accessibilityRole="button"
                        >
                          <Text numberOfLines={1} style={[styles.dateText, contentTextStyle(content)]}>
                            {dateLabel}
                          </Text>
                        </Pressable>
                      ) : (
                        <Text
                          numberOfLines={1}
                          style={[styles.dateText, contentTextStyle(content)]}
                          accessibilityLabel={`日付 ${dateLabel}`}
                        >
                          {dateLabel}
                        </Text>
                      )}
                      {visibleTags.map((tag) => {
                        const selected = memo.tags.includes(tag);
                        return (
                          <Pressable
                            key={tag}
                            style={[
                              styles.tag,
                              {
                                borderColor: selected ? content.contentText : content.contentBorder,
                                backgroundColor: selected ? content.contentText : 'transparent',
                              },
                            ]}
                            onPress={() => updateMemo(person, memo.id, { tags: toggleMemoTag(memo.tags, tag) })}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                          >
                            <Text
                              style={[
                                styles.tagText,
                                { color: selected ? content.contentCard : content.contentTextSecondary },
                              ]}
                            >
                              {PROFILE_MEMO_TAG_LABEL[tag]}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {blank ? null : (
                        <Pressable
                          style={styles.removeButton}
                          onPress={() => removeMemo(person, memo.id)}
                          accessibilityLabel={`${person.name}のメモを削除`}
                          accessibilityRole="button"
                          hitSlop={6}
                        >
                          <Text style={[styles.removeButtonText, contentMutedTextStyle(content)]}>×</Text>
                        </Pressable>
                      )}
                    </View>
                    {dateOpen ? (
                      <View style={[styles.datePickerWrap, { backgroundColor: content.contentInputBg }]}>
                        <DateTimePicker
                          value={parseDateKey(dateLabel)}
                          mode="date"
                          display="spinner"
                          locale="ja-JP"
                          {...dateTimePickerProps}
                          {...dateBounds}
                          onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                            if (Platform.OS !== 'ios') {
                              setOpenMemoDate(null);
                            }
                            if (selected) {
                              updateMemo(person, memo.id, { date: formatDateToYMD(selected) });
                            }
                          }}
                        />
                        <PickerDoneOverlay
                          style={contentFilledButtonStyle(content)}
                          textStyle={contentFilledButtonTextStyle(content)}
                          onPress={() => setOpenMemoDate(null)}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 18,
  },
  personBlock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  rail: {
    alignItems: 'center',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: Typography.base,
    fontWeight: '700',
  },
  avatarInitialCompact: {
    fontSize: Typography.sm,
  },
  railLine: {
    width: 1,
    flex: 1,
    marginTop: 6,
  },
  fields: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  memoCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: 6,
  },
  readMemoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingVertical: READ_MEMO_PADDING_V,
    paddingHorizontal: 8,
  },
  readMemoIconCol: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  readMemoText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: READ_MEMO_LINE_HEIGHT,
    includeFontPadding: false,
    paddingLeft: 6,
  },
  memoInput: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: Radius.md,
    textAlignVertical: 'top',
    fontSize: Typography.base,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  dateButton: {
    height: 22,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 6,
    flexShrink: 1,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tag: {
    height: 22,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  removeButton: {
    marginLeft: 'auto',
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 18,
    lineHeight: 20,
  },
  datePickerWrap: {
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
  },
});
