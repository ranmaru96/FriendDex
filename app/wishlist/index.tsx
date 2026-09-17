import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import { popCurrentTabScreen } from '@/utils/tabNavigation';
import { WishlistIndexTable } from '@/components/wishlist/WishlistIndexTable';
import { WishlistItemFormModal } from '@/components/wishlist/WishlistItemFormModal';
import { WishlistPlaceCard } from '@/components/wishlist/WishlistPlaceCard';
import { WishlistShopRow } from '@/components/wishlist/WishlistShopRow';
import { getDesignPatternTone } from '@/constants/designPatterns';
import { useAppTheme } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import {
  createWishlistItem,
  deleteWishlistItem,
  getDistinctWishlistCuisines,
  getDistinctWishlistLocations,
  getDistinctWishlistPurposeTags,
  getWishlistItems,
  initializeDatabase,
  updateWishlistItem,
} from '@/db';
import type { WishlistItem, WishlistKind } from '@/types';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import {
  DEFAULT_EAT_CUISINES,
  DEFAULT_VISIT_PURPOSE_TAGS,
  eatFolderPreviewLabels,
  formatWishlistIndex,
  groupWishlistEatByCuisine,
  groupWishlistEatItems,
  matchesWishlistQuery,
  mergeWishlistOptions,
  toWishlistOpenUrl,
  type WishlistEatFolder,
} from '@/utils/wishlistHelpers';

const KIND_FILTERS: { key: WishlistKind; label: string }[] = [
  { key: 'visit', label: '行きたい' },
  { key: 'eat', label: '食べたい' },
];

type EatBrowse = 'area' | 'cuisine';

const EAT_BROWSE_TABS: { key: EatBrowse; label: string }[] = [
  { key: 'area', label: 'エリア' },
  { key: 'cuisine', label: '種類' },
];

export default function WishlistScreen() {
  const kit = useUiKit();
  const content = useContentColors();
  const { variant, patternId } = useAppTheme();
  const { pattern, tone } = useMemo(
    () => getDesignPatternTone(patternId, variant),
    [patternId, variant]
  );
  const palette = tone.colors;
  const shape = pattern.shape;

  const [kind, setKind] = useState<WishlistKind>('visit');
  const [eatBrowse, setEatBrowse] = useState<EatBrowse>('area');
  const [selectedEatKey, setSelectedEatKey] = useState<string | null>(null);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [query, setQuery] = useState('');
  const [purposeOptions, setPurposeOptions] = useState(mergeWishlistOptions(DEFAULT_VISIT_PURPOSE_TAGS, []));
  const [locationOptions, setLocationOptions] = useState(mergeWishlistOptions([], []));
  const [cuisineOptions, setCuisineOptions] = useState(mergeWishlistOptions(DEFAULT_EAT_CUISINES, []));
  const [formVisible, setFormVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);

  const loadData = useCallback(() => {
    initializeDatabase();
    setItems(getWishlistItems(kind));
    setPurposeOptions(mergeWishlistOptions(DEFAULT_VISIT_PURPOSE_TAGS, getDistinctWishlistPurposeTags()));
    setLocationOptions(mergeWishlistOptions([], getDistinctWishlistLocations()));
    setCuisineOptions(mergeWishlistOptions(DEFAULT_EAT_CUISINES, getDistinctWishlistCuisines()));
  }, [kind]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const eatFolders = useMemo((): WishlistEatFolder[] => {
    if (kind !== 'eat') {
      return [];
    }
    return eatBrowse === 'cuisine' ? groupWishlistEatByCuisine(items) : groupWishlistEatItems(items);
  }, [eatBrowse, items, kind]);

  const selectedFolder = useMemo(
    () => eatFolders.find((folder) => folder.key === selectedEatKey) ?? null,
    [eatFolders, selectedEatKey]
  );

  useEffect(() => {
    if (selectedEatKey != null && !eatFolders.some((folder) => folder.key === selectedEatKey)) {
      setSelectedEatKey(null);
    }
  }, [eatFolders, selectedEatKey]);

  const visibleFolders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return eatFolders;
    }
    return eatFolders.filter(
      (folder) =>
        folder.label.toLowerCase().includes(needle) ||
        folder.items.some((item) => matchesWishlistQuery(item, query))
    );
  }, [eatFolders, query]);

  const visitItems = useMemo(
    () => (kind === 'visit' ? items.filter((item) => matchesWishlistQuery(item, query)) : []),
    [items, kind, query]
  );

  const shopItems = useMemo(() => {
    if (!selectedFolder) {
      return [];
    }
    return selectedFolder.items.filter((item) => matchesWishlistQuery(item, query));
  }, [query, selectedFolder]);

  const openCreate = () => {
    setEditingItem(null);
    setFormVisible(true);
  };

  const openEdit = (item: WishlistItem) => {
    setEditingItem(item);
    setFormVisible(true);
  };

  const confirmDelete = (item: WishlistItem) => {
    Alert.alert('削除しますか？', `「${item.name}」をリストから外します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          deleteWishlistItem(item.id);
          loadData();
        },
      },
    ]);
  };

  const handleSave = (draft: {
    name: string;
    purposeTags: string[];
    location: string;
    cuisine: string;
    memo: string;
    link: string;
  }) => {
    const input = {
      kind,
      name: draft.name,
      purposeTags: kind === 'visit' ? draft.purposeTags : [],
      location: kind === 'eat' ? draft.location : null,
      cuisine: kind === 'eat' ? draft.cuisine : null,
      memo: draft.memo,
      link: draft.link,
    };
    if (editingItem) {
      updateWishlistItem(editingItem.id, input);
    } else {
      createWishlistItem(input);
    }
    setFormVisible(false);
    setEditingItem(null);
    loadData();
  };

  const openLink = async (link: string) => {
    const url = toWishlistOpenUrl(link);
    if (!url) {
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('リンクを開けません', url);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('リンクを開けません', url);
    }
  };

  const handleBack = () => {
    if (kind === 'eat' && selectedEatKey != null) {
      setSelectedEatKey(null);
      setQuery('');
      return;
    }
    popCurrentTabScreen();
  };

  const screenTitle =
    kind === 'eat' && selectedFolder ? selectedFolder.label : '行ってみたい・食べてみたい場所';

  const searchPlaceholder =
    kind === 'visit'
      ? '場所を探す'
      : selectedEatKey != null
        ? '店を探す'
        : eatBrowse === 'area'
          ? 'エリアを探す'
          : '種類を探す';

  const header = (
    <View
      style={[
        styles.hud,
        {
          backgroundColor: kind === 'visit' ? palette.headerBg : kit.screenBackground,
          borderBottomColor: kind === 'visit' ? palette.headerBorder : content.contentBorder,
          borderBottomWidth: kind === 'visit' ? shape.cardBorderWidth : StyleSheet.hairlineWidth,
          paddingHorizontal: kit.subToolScreenPaddingHorizontal,
        },
      ]}
    >
      <View style={styles.hudRow}>
        {kind === 'visit' ? (
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
            <Text style={[styles.searchKicker, { color: palette.cyan }]}>SCAN</Text>
            <TextInput
              style={[styles.searchInput, { color: palette.cardInk }]}
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={palette.cardMuted}
            />
          </View>
        ) : (
          <TextInput
            style={[styles.plainSearch, contentSurfaceStyle(content), contentTextStyle(content)]}
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={content.contentTextSecondary}
          />
        )}
        <Pressable
          style={[
            styles.addSquare,
            kind === 'visit'
              ? { backgroundColor: palette.addBtn, borderRadius: shape.innerRadius }
              : [contentSurfaceStyle(content), styles.addSquarePlain],
          ]}
          onPress={openCreate}
          accessibilityLabel="追加"
        >
          <Text
            style={[
              styles.addSquareText,
              { color: kind === 'visit' ? palette.addBtnInk : content.contentText },
            ]}
          >
            ＋
          </Text>
        </Pressable>
      </View>
      {selectedEatKey == null ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {KIND_FILTERS.map((item) => {
            const on = kind === item.key;
            const onBg = kind === 'visit' ? palette.chipOn : content.contentText;
            const onInk = kind === 'visit' ? palette.chipOnInk : content.contentCard;
            const offBg = kind === 'visit' ? palette.chipBg : content.contentInputBg;
            const offBorder = kind === 'visit' ? palette.headerBorder : content.contentBorder;
            const offInk = kind === 'visit' ? palette.cardMuted : content.contentTextSecondary;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setKind(item.key);
                  setSelectedEatKey(null);
                  setQuery('');
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: on ? onBg : offBg,
                    borderColor: on ? onBg : offBorder,
                    borderRadius: kind === 'visit' ? Math.max(2, shape.innerRadius / 2) : 4,
                  },
                ]}
              >
                <Text style={[styles.filterChipText, { color: on ? onInk : offInk }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {kind === 'eat' && selectedEatKey == null ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {EAT_BROWSE_TABS.map((item) => {
            const on = eatBrowse === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setEatBrowse(item.key);
                  setSelectedEatKey(null);
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: on ? content.contentText : content.contentInputBg,
                    borderColor: on ? content.contentText : content.contentBorder,
                    borderRadius: 4,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: on ? content.contentCard : content.contentTextSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  const renderVisitEmpty = visitItems.length === 0;
  const renderEatIndexEmpty = kind === 'eat' && selectedEatKey == null && visibleFolders.length === 0;
  const renderEatShopsEmpty = kind === 'eat' && selectedEatKey != null && shopItems.length === 0;

  return (
    <>
      <SubToolScreenTemplate
        title={screenTitle}
        onBack={handleBack}
        header={header}
        scrollContentStyle={styles.scrollContent}
      >
        {kind === 'visit' ? (
          renderVisitEmpty ? (
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
                <Text style={[styles.emptyKicker, { color: palette.cyan }]}>NO PIN</Text>
                <Text style={[styles.emptyTitle, { color: palette.cardInk }]}>
                  {items.length === 0 ? '行きたい場所はまだない' : '一致する項目がありません'}
                </Text>
                <Text style={[styles.emptyHint, { color: palette.cardMuted }]}>
                  {items.length === 0
                    ? '右上の＋からピンを立てて、あとから見返そう。'
                    : '検索を変えてみてください。'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.list}>
              {visitItems.map((item, index) => (
                <WishlistPlaceCard
                  key={item.id}
                  item={item}
                  indexLabel={formatWishlistIndex('visit', index)}
                  colors={palette}
                  shape={shape}
                  onPress={() => openEdit(item)}
                  onLongPress={() => confirmDelete(item)}
                  onPressLink={item.link ? () => openLink(item.link!) : undefined}
                />
              ))}
            </View>
          )
        ) : selectedEatKey == null ? (
          renderEatIndexEmpty ? (
            <View style={[styles.plainEmpty, contentSurfaceStyle(content)]}>
              <Text style={[styles.plainEmptyTitle, contentTextStyle(content)]}>
                {items.length === 0 ? '食べたい店はまだない' : '一致する項目がありません'}
              </Text>
              <Text style={[styles.plainEmptyHint, contentMutedTextStyle(content)]}>
                {items.length === 0
                  ? '右上の＋から店を記録すると、エリアのガイドができます。'
                  : '検索を変えてみてください。'}
              </Text>
            </View>
          ) : (
            <WishlistIndexTable
              rows={visibleFolders.map((folder) => ({
                key: folder.key,
                title: folder.label,
                count: folder.items.length,
                previews: eatFolderPreviewLabels(folder, eatBrowse),
              }))}
              onPressRow={setSelectedEatKey}
            />
          )
        ) : renderEatShopsEmpty ? (
          <View style={[styles.plainEmpty, contentSurfaceStyle(content)]}>
            <Text style={[styles.plainEmptyTitle, contentTextStyle(content)]}>店がありません</Text>
            <Text style={[styles.plainEmptyHint, contentMutedTextStyle(content)]}>
              検索を変えるか、＋から店を追加してください。
            </Text>
          </View>
        ) : (
          <View style={styles.shopList}>
            {shopItems.map((item) => (
              <WishlistShopRow
                key={item.id}
                item={item}
                meta={eatBrowse === 'area' ? item.cuisine : item.location}
                onPress={() => openEdit(item)}
                onLongPress={() => confirmDelete(item)}
                onPressLink={item.link ? () => openLink(item.link!) : undefined}
              />
            ))}
          </View>
        )}
      </SubToolScreenTemplate>

      <WishlistItemFormModal
        visible={formVisible}
        kind={kind}
        item={editingItem}
        purposeOptions={purposeOptions}
        locationOptions={locationOptions}
        cuisineOptions={cuisineOptions}
        colors={palette}
        shape={shape}
        onClose={() => {
          setFormVisible(false);
          setEditingItem(null);
        }}
        onSave={handleSave}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hud: {
    paddingTop: 8,
    paddingBottom: 10,
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
  plainSearch: {
    flex: 1,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  addSquare: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSquarePlain: {
    borderWidth: 1,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  scrollContent: {
    paddingTop: 14,
    paddingBottom: 48,
    gap: 12,
  },
  list: {
    gap: 12,
  },
  shopList: {
    gap: 8,
  },
  emptyWrap: {
    position: 'relative',
    marginTop: 8,
  },
  offset: {
    position: 'absolute',
  },
  emptyCard: {
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
  plainEmpty: {
    borderWidth: 1,
    padding: 20,
    gap: 6,
  },
  plainEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  plainEmptyHint: {
    fontSize: 13,
    lineHeight: 18,
  },
});
