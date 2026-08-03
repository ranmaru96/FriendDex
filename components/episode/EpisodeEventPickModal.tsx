import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Radius, Theme, Typography } from '@/constants/theme';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import {
  findEventsOnEpisodeDate,
  formatEpisodeEventMatchLabel,
  searchEventsForEpisodeLink,
} from '@/utils/eventEpisodeSync';

type EpisodeEventPickModalProps = {
  visible: boolean;
  dateKey: string;
  selectedEventId?: string | null;
  onSelect: (eventId: string) => void;
  onClose: () => void;
};

export function EpisodeEventPickModal({
  visible,
  dateKey,
  selectedEventId,
  onSelect,
  onClose,
}: EpisodeEventPickModalProps) {
  const content = useContentColors();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const sameDayEvents = useMemo(() => findEventsOnEpisodeDate(dateKey), [dateKey]);
  const searchHits = useMemo(
    () => (searchOpen ? searchEventsForEpisodeLink(query, { limit: 40 }) : []),
    [searchOpen, query]
  );

  const handleClose = () => {
    setQuery('');
    setSearchOpen(false);
    onClose();
  };

  const handleSelect = (eventId: string) => {
    onSelect(eventId);
    setQuery('');
    setSearchOpen(false);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, contentSurfaceStyle(content)]}>
          <Text style={[styles.title, contentTextStyle(content)]}>予定を選択</Text>
          <Text style={[styles.description, contentMutedTextStyle(content)]}>
            同じ日付の予定から選ぶか、予定を探して選んでください。
          </Text>

          <ScrollView style={styles.options} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sectionLabel, contentMutedTextStyle(content)]}>同じ日付の予定</Text>
            {sameDayEvents.length === 0 ? (
              <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
                この日付の予定はありません
              </Text>
            ) : (
              sameDayEvents.map((event) => {
                const selected = selectedEventId === event.id;
                return (
                  <Pressable
                    key={event.id}
                    style={[
                      styles.option,
                      contentSurfaceStyle(content),
                      selected ? contentSelectedOptionStyle(content) : null,
                    ]}
                    onPress={() => handleSelect(event.id)}
                  >
                    <Text style={[styles.optionText, contentTextStyle(content)]}>
                      {formatEpisodeEventMatchLabel(event, dateKey)}
                    </Text>
                  </Pressable>
                );
              })
            )}

            <Pressable
              style={[styles.searchToggle, contentInputStyle(content)]}
              onPress={() => setSearchOpen((prev) => !prev)}
            >
              <Text style={[styles.searchToggleText, contentTextStyle(content)]}>
                {searchOpen ? '予定を探すを閉じる' : '予定を探す'}
              </Text>
            </Pressable>

            {searchOpen ? (
              <View style={styles.searchBlock}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="タイトル・メモで検索"
                  placeholderTextColor={content.contentTextSecondary}
                  style={[styles.searchInput, contentInputStyle(content)]}
                  autoCorrect={false}
                />
                {searchHits.length === 0 ? (
                  <Text style={[styles.emptyText, contentMutedTextStyle(content)]}>
                    該当する予定がありません
                  </Text>
                ) : (
                  searchHits.map((hit) => {
                    const hitDate = hit.dateKeys[0] ?? hit.event.startAt.slice(0, 10);
                    const selected = selectedEventId === hit.event.id;
                    return (
                      <Pressable
                        key={`search-${hit.event.id}`}
                        style={[
                          styles.option,
                          contentSurfaceStyle(content),
                          selected ? contentSelectedOptionStyle(content) : null,
                        ]}
                        onPress={() => handleSelect(hit.event.id)}
                      >
                        <Text style={[styles.optionText, contentTextStyle(content)]}>
                          {formatEpisodeEventMatchLabel(hit.event, hitDate)}
                        </Text>
                        {hit.event.memo ? (
                          <Text
                            style={[styles.memoText, contentMutedTextStyle(content)]}
                            numberOfLines={2}
                          >
                            {hit.event.memo}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.secondaryButton, contentInputStyle(content)]} onPress={handleClose}>
              <Text style={[styles.secondaryButtonText, contentTextStyle(content)]}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: Theme.bgSurface,
    borderRadius: Radius.lg,
    padding: 20,
    maxHeight: '85%',
  },
  title: {
    fontSize: Typography.lg,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 8,
  },
  description: {
    fontSize: Typography.sm,
    color: Theme.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  options: {
    maxHeight: 420,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: Typography.sm,
    color: Theme.textSecondary,
    paddingVertical: 8,
    marginBottom: 8,
  },
  option: {
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 8,
  },
  optionText: {
    fontSize: Typography.base,
    color: Theme.textPrimary,
    fontWeight: '600',
  },
  memoText: {
    marginTop: 4,
    fontSize: Typography.sm,
    color: Theme.textSecondary,
  },
  searchToggle: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  searchToggleText: {
    fontSize: Typography.sm,
    fontWeight: '700',
  },
  searchBlock: {
    marginTop: 4,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: Theme.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: Typography.base,
    color: Theme.inputText,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.inputBorder,
  },
  secondaryButtonText: {
    fontSize: Typography.sm,
    color: Theme.textPrimary,
    fontWeight: '600',
  },
});
