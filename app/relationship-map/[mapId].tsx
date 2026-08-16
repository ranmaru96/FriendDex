import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { AddCircleButton } from '@/components/AddCircleButton';
import { CircleIconButton } from '@/components/CircleIconButton';
import { EntrySelectorModal } from '@/components/episode/EntrySelectorModal';
import { SubToolScreenTemplate } from '@/components/screen-templates';
import {
  RelationshipMapArrowFormModal,
  RelationshipMapArrows,
  RelationshipMapGrid,
  RelationshipMapGroupFormModal,
  RelationshipMapGroupOverlay,
  RelationshipMapPersonDetailModal,
  RelationshipMapPersonNode,
} from '@/components/relationship-map';
import { RELATIONSHIP_GROUP_COLOR_PRESETS } from '@/components/relationship-map/RelationshipMapGroupFormModal';
import {
  addRelationshipGroupMember,
  createRelationship,
  createRelationshipGroup,
  createRelationshipMapMember,
  deleteRelationship,
  deleteRelationshipGroup,
  deleteRelationshipMapMember,
  getDistinctAffiliations,
  getDistinctExperiences,
  getRelationshipGroupMembersByMapId,
  getRelationshipGroups,
  getRelationshipMap,
  getRelationshipMapMembers,
  getRelationships,
  initializeDatabase,
  removeRelationshipGroupMemberByMapMember,
  updateRelationship,
  updateRelationshipGroup,
  updateRelationshipMapMemberPosition,
} from '@/db';
import type {
  Friend,
  Relationship,
  RelationshipArrowStyle,
  RelationshipGroup,
  RelationshipGroupMember,
  RelationshipMap,
  RelationshipMapMember,
} from '@/types';
import { getAllFriendsInDefaultOrder } from '@/utils/friendDefaultSort';
import { contentMutedTextStyle, contentTextStyle } from '@/utils/contentStyleHelpers';
import {
  buildGroupFillLayouts,
  wouldCreateGroupCycle,
} from '@/utils/relationshipGroupLayout';
import {
  findNextEmptyCell,
  findPersonRelationship,
  getCanvasPixelSize,
  getMemberAvatarCenter,
  type RelationshipMapDragOffset,
} from '@/utils/relationshipMapHelpers';
import { useContentColors } from '@/utils/useContentColors';

type Option = { label: string; value: string };

type ArrowFormState = {
  mode: 'create' | 'edit';
  fromMemberId: string;
  toMemberId: string;
  relationship?: Relationship;
};

type GroupFormState =
  | {
      mode: 'create-leaf';
      memberIds: string[];
    }
  | {
      mode: 'wrap';
      childGroupIds: string[];
    }
  | {
      mode: 'edit';
      group: RelationshipGroup;
    };

export default function RelationshipMapEditScreen() {
  const router = useRouter();
  const content = useContentColors();
  const { mapId } = useLocalSearchParams<{ mapId: string }>();
  const { height: windowHeight } = useWindowDimensions();
  const canvasSize = useMemo(() => getCanvasPixelSize(), []);

  const [map, setMap] = useState<RelationshipMap | null>(null);
  const [members, setMembers] = useState<RelationshipMapMember[]>([]);
  const [groups, setGroups] = useState<RelationshipGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<RelationshipGroupMember[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [affiliationOptions, setAffiliationOptions] = useState<Option[]>([]);
  const [experienceOptions, setExperienceOptions] = useState<Option[]>([]);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTab, setSelectorTab] = useState<'individual' | 'group'>('individual');
  const [selectorNameFilter, setSelectorNameFilter] = useState('');
  const [selectorAffiliationFilter, setSelectorAffiliationFilter] = useState('');
  const [selectorExperienceFilter, setSelectorExperienceFilter] = useState('');
  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<string>>(new Set());
  const [selectedGroupValues, setSelectedGroupValues] = useState<Set<string>>(new Set());
  const [detailFriend, setDetailFriend] = useState<Friend | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFromMemberId, setLinkFromMemberId] = useState<string | null>(null);
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [groupSelectedMemberIds, setGroupSelectedMemberIds] = useState<Set<string>>(new Set());
  const [arrowForm, setArrowForm] = useState<ArrowFormState | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState | null>(null);
  const [dragOffsets, setDragOffsets] = useState<Record<string, RelationshipMapDragOffset>>({});

  const normalizedMapId = typeof mapId === 'string' ? mapId.trim() : '';

  const friendById = useMemo(() => new Map(friends.map((friend) => [friend.id, friend])), [friends]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const memberFriendIds = useMemo(() => new Set(members.map((member) => member.friendId)), [members]);
  const memberGroupIdByMemberId = useMemo(() => {
    const map = new Map<string, string>();
    groupMembers.forEach((link) => {
      map.set(link.mapMemberId, link.groupId);
    });
    return map;
  }, [groupMembers]);

  const canvasViewportHeight = Math.max(280, windowHeight - 180);

  const memberDisplayName = useCallback(
    (memberId: string) => {
      const member = memberById.get(memberId);
      if (!member) {
        return '人物';
      }
      return friendById.get(member.friendId)?.name ?? '人物';
    },
    [friendById, memberById]
  );

  const loadData = useCallback(() => {
    if (!normalizedMapId) {
      setMap(null);
      setMembers([]);
      setGroups([]);
      setGroupMembers([]);
      setRelationships([]);
      return;
    }
    initializeDatabase();
    const nextMap = getRelationshipMap(normalizedMapId);
    if (!nextMap) {
      setMap(null);
      setMembers([]);
      setGroups([]);
      setGroupMembers([]);
      setRelationships([]);
      return;
    }
    setMap(nextMap);
    setMembers(getRelationshipMapMembers(normalizedMapId));
    setGroups(getRelationshipGroups(normalizedMapId));
    setGroupMembers(getRelationshipGroupMembersByMapId(normalizedMapId));
    setRelationships(getRelationships(normalizedMapId));
    setFriends(getAllFriendsInDefaultOrder());
    setAffiliationOptions(getDistinctAffiliations().map((value) => ({ label: value, value })));
    setExperienceOptions(getDistinctExperiences().map((value) => ({ label: value, value })));
  }, [normalizedMapId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useFocusEffect(
    useCallback(() => {
      if (!normalizedMapId) {
        Alert.alert('エラー', '相関図が見つかりません', [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }
      initializeDatabase();
      if (!getRelationshipMap(normalizedMapId)) {
        Alert.alert('エラー', '相関図が見つかりません', [{ text: 'OK', onPress: () => router.back() }]);
      }
    }, [normalizedMapId, router])
  );

  const openSelector = useCallback(() => {
    setSelectedIndividualIds(new Set());
    setSelectedGroupValues(new Set());
    setSelectorTab('individual');
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
    setSelectorVisible(true);
  }, []);

  const toggleSelectorIndividual = useCallback((friendId: string) => {
    setSelectedIndividualIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }
      return next;
    });
  }, []);

  const toggleSelectorGroup = useCallback((groupValue: string) => {
    setSelectedGroupValues((prev) => {
      const next = new Set(prev);
      if (next.has(groupValue)) {
        next.delete(groupValue);
      } else {
        next.add(groupValue);
      }
      return next;
    });
  }, []);

  const handleSelectorCancel = useCallback(() => {
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');
  }, []);

  const handleSelectorConfirm = useCallback(() => {
    if (!normalizedMapId) {
      return;
    }
    const pickedIds = [...selectedIndividualIds].filter((friendId) => !memberFriendIds.has(friendId));
    if (pickedIds.length === 0) {
      setSelectorVisible(false);
      return;
    }

    initializeDatabase();
    let workingMembers = getRelationshipMapMembers(normalizedMapId);
    let addedCount = 0;
    let gridFull = false;

    pickedIds.forEach((friendId) => {
      const cell = findNextEmptyCell(workingMembers);
      if (!cell) {
        gridFull = true;
        return;
      }
      const created = createRelationshipMapMember({
        mapId: normalizedMapId,
        friendId,
        row: cell.row,
        col: cell.col,
      });
      if (created) {
        workingMembers = [...workingMembers, created];
        addedCount += 1;
      }
    });

    setMembers(workingMembers);
    setSelectorVisible(false);
    setSelectorNameFilter('');
    setSelectorAffiliationFilter('');
    setSelectorExperienceFilter('');

    if (gridFull && addedCount < pickedIds.length) {
      Alert.alert('配置できません', 'グリッドの空きセルが足りないため、一部の人物を追加できませんでした。');
    }
  }, [memberFriendIds, normalizedMapId, selectedIndividualIds]);

  const handlePositionChange = useCallback((memberId: string, row: number, col: number) => {
    initializeDatabase();
    if (updateRelationshipMapMemberPosition(memberId, row, col)) {
      setMembers((prev) =>
        prev.map((member) => (member.id === memberId ? { ...member, row, col } : member))
      );
    }
  }, []);

  const handleDragMove = useCallback((memberId: string, x: number, y: number) => {
    setDragOffsets((prev) => {
      const current = prev[memberId];
      if (current && current.x === x && current.y === y) {
        return prev;
      }
      return { ...prev, [memberId]: { x, y } };
    });
  }, []);

  const handleDragEnd = useCallback((memberId: string) => {
    setDragOffsets((prev) => {
      if (!(memberId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[memberId];
      return next;
    });
  }, []);

  const confirmDeleteMember = useCallback(
    (member: RelationshipMapMember) => {
      const friend = friendById.get(member.friendId);
      Alert.alert('人物を削除', `「${friend?.name ?? '人物'}」を相関図から外しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            initializeDatabase();
            if (deleteRelationshipMapMember(member.id)) {
              setMembers((prev) => prev.filter((item) => item.id !== member.id));
              setGroupMembers((prev) => prev.filter((item) => item.mapMemberId !== member.id));
              setRelationships((prev) =>
                prev.filter(
                  (item) =>
                    !(item.fromType === 'person' && item.fromId === member.id) &&
                    !(item.toType === 'person' && item.toId === member.id)
                )
              );
              setGroupSelectedMemberIds((prev) => {
                if (!prev.has(member.id)) {
                  return prev;
                }
                const next = new Set(prev);
                next.delete(member.id);
                return next;
              });
              if (linkFromMemberId === member.id) {
                setLinkFromMemberId(null);
              }
            } else {
              Alert.alert('エラー', '削除に失敗しました');
            }
          },
        },
      ]);
    },
    [friendById, linkFromMemberId]
  );

  const exitLinkMode = useCallback(() => {
    setLinkMode(false);
    setLinkFromMemberId(null);
  }, []);

  const exitGroupSelectMode = useCallback(() => {
    setGroupSelectMode(false);
    setGroupSelectedMemberIds(new Set());
  }, []);

  const toggleLinkMode = useCallback(() => {
    exitGroupSelectMode();
    setLinkMode((prev) => {
      if (prev) {
        setLinkFromMemberId(null);
        return false;
      }
      return true;
    });
  }, [exitGroupSelectMode]);

  const toggleGroupSelectMode = useCallback(() => {
    exitLinkMode();
    setGroupSelectMode((prev) => {
      if (prev) {
        setGroupSelectedMemberIds(new Set());
        return false;
      }
      return true;
    });
  }, [exitLinkMode]);

  const openArrowFormForPair = useCallback(
    (fromMemberId: string, toMemberId: string) => {
      const existing = findPersonRelationship(relationships, fromMemberId, toMemberId);
      if (existing) {
        setArrowForm({
          mode: 'edit',
          fromMemberId: existing.fromId,
          toMemberId: existing.toId,
          relationship: existing,
        });
        return;
      }
      setArrowForm({
        mode: 'create',
        fromMemberId,
        toMemberId,
      });
    },
    [relationships]
  );

  const handleMemberTap = useCallback(
    (member: RelationshipMapMember, friend: Friend) => {
      if (groupSelectMode) {
        setGroupSelectedMemberIds((prev) => {
          const next = new Set(prev);
          if (next.has(member.id)) {
            next.delete(member.id);
          } else {
            next.add(member.id);
          }
          return next;
        });
        return;
      }
      if (!linkMode) {
        setDetailFriend(friend);
        return;
      }
      if (!linkFromMemberId) {
        setLinkFromMemberId(member.id);
        return;
      }
      if (linkFromMemberId === member.id) {
        setLinkFromMemberId(null);
        return;
      }
      openArrowFormForPair(linkFromMemberId, member.id);
      setLinkFromMemberId(null);
      setLinkMode(false);
    },
    [groupSelectMode, linkFromMemberId, linkMode, openArrowFormForPair]
  );

  const handleArrowPress = useCallback((relationship: Relationship) => {
    if (relationship.fromType !== 'person' || relationship.toType !== 'person') {
      return;
    }
    setArrowForm({
      mode: 'edit',
      fromMemberId: relationship.fromId,
      toMemberId: relationship.toId,
      relationship,
    });
  }, []);

  const handleSaveArrow = useCallback(
    (style: RelationshipArrowStyle, label: string) => {
      if (!arrowForm || !normalizedMapId) {
        return;
      }
      initializeDatabase();
      if (arrowForm.mode === 'create') {
        const created = createRelationship({
          mapId: normalizedMapId,
          fromType: 'person',
          fromId: arrowForm.fromMemberId,
          toType: 'person',
          toId: arrowForm.toMemberId,
          style,
          label,
        });
        if (!created) {
          Alert.alert('エラー', '関係の作成に失敗しました');
          return;
        }
        setRelationships((prev) => [...prev, created]);
      } else if (arrowForm.relationship) {
        if (!updateRelationship(arrowForm.relationship.id, { style, label })) {
          Alert.alert('エラー', '関係の更新に失敗しました');
          return;
        }
        setRelationships((prev) =>
          prev.map((item) =>
            item.id === arrowForm.relationship?.id ? { ...item, style, label: label.trim() || null } : item
          )
        );
      }
      setArrowForm(null);
    },
    [arrowForm, normalizedMapId]
  );

  const handleDeleteArrow = useCallback(() => {
    if (!arrowForm?.relationship) {
      return;
    }
    Alert.alert('関係を削除', 'この矢印を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          initializeDatabase();
          if (deleteRelationship(arrowForm.relationship!.id)) {
            setRelationships((prev) => prev.filter((item) => item.id !== arrowForm.relationship?.id));
            setArrowForm(null);
          } else {
            Alert.alert('エラー', '削除に失敗しました');
          }
        },
      },
    ]);
  }, [arrowForm]);

  const refreshGroups = useCallback(() => {
    if (!normalizedMapId) {
      return;
    }
    setGroups(getRelationshipGroups(normalizedMapId));
    setGroupMembers(getRelationshipGroupMembersByMapId(normalizedMapId));
  }, [normalizedMapId]);

  const nextGroupColor = useCallback(() => {
    return RELATIONSHIP_GROUP_COLOR_PRESETS[groups.length % RELATIONSHIP_GROUP_COLOR_PRESETS.length];
  }, [groups.length]);

  const parentOptionsForForm = useCallback(
    (excludeGroupId?: string, extraExcludeIds: string[] = []) => {
      const excluded = new Set(extraExcludeIds);
      if (excludeGroupId) {
        excluded.add(excludeGroupId);
      }
      return groups
        .filter((group) => {
          if (excluded.has(group.id)) {
            return false;
          }
          if (excludeGroupId && wouldCreateGroupCycle(groups, excludeGroupId, group.id)) {
            return false;
          }
          return true;
        })
        .map((group) => ({ label: group.name, value: group.id }));
    },
    [groups]
  );

  const openGroupFormFromSelection = useCallback(() => {
    const selectedIds = [...groupSelectedMemberIds];
    if (selectedIds.length === 0) {
      Alert.alert('グループ', '人物を2人以上選んでください');
      return;
    }
    const groupedIds: string[] = [];
    const ungroupedIds: string[] = [];
    const touchedGroupIds = new Set<string>();
    selectedIds.forEach((memberId) => {
      const groupId = memberGroupIdByMemberId.get(memberId);
      if (groupId) {
        groupedIds.push(memberId);
        touchedGroupIds.add(groupId);
      } else {
        ungroupedIds.push(memberId);
      }
    });

    if (ungroupedIds.length > 0 && groupedIds.length > 0) {
      Alert.alert('グループ', '未所属の人物と、すでにグループに入っている人物は同時に選べません。');
      return;
    }
    if (ungroupedIds.length === 1) {
      Alert.alert('グループ', '人物を2人以上選んでください');
      return;
    }
    if (ungroupedIds.length >= 2) {
      setGroupForm({ mode: 'create-leaf', memberIds: ungroupedIds });
      return;
    }
    if (touchedGroupIds.size === 1) {
      const group = groupById.get([...touchedGroupIds][0]);
      if (group) {
        setGroupForm({ mode: 'edit', group });
      }
      return;
    }
    if (touchedGroupIds.size >= 2) {
      setGroupForm({ mode: 'wrap', childGroupIds: [...touchedGroupIds] });
    }
  }, [groupById, groupSelectedMemberIds, memberGroupIdByMemberId]);

  const handleSaveGroup = useCallback(
    (input: { name: string; color: string; parentGroupId: string | null }) => {
      if (!groupForm || !normalizedMapId) {
        return;
      }
      initializeDatabase();
      if (groupForm.mode === 'create-leaf') {
        const created = createRelationshipGroup({
          mapId: normalizedMapId,
          name: input.name,
          color: input.color,
          parentGroupId: input.parentGroupId,
        });
        if (!created) {
          Alert.alert('エラー', 'グループの作成に失敗しました');
          return;
        }
        groupForm.memberIds.forEach((memberId) => {
          removeRelationshipGroupMemberByMapMember(memberId);
          addRelationshipGroupMember(created.id, memberId);
        });
        refreshGroups();
        exitGroupSelectMode();
        setGroupForm(null);
        return;
      }
      if (groupForm.mode === 'wrap') {
        const created = createRelationshipGroup({
          mapId: normalizedMapId,
          name: input.name,
          color: input.color,
          parentGroupId: input.parentGroupId,
        });
        if (!created) {
          Alert.alert('エラー', 'グループの作成に失敗しました');
          return;
        }
        groupForm.childGroupIds.forEach((childId) => {
          updateRelationshipGroup(childId, { parentGroupId: created.id });
        });
        refreshGroups();
        exitGroupSelectMode();
        setGroupForm(null);
        return;
      }
      if (
        !updateRelationshipGroup(groupForm.group.id, {
          name: input.name,
          color: input.color,
          parentGroupId: input.parentGroupId,
        })
      ) {
        Alert.alert('エラー', 'グループの更新に失敗しました');
        return;
      }
      refreshGroups();
      setGroupForm(null);
    },
    [exitGroupSelectMode, groupForm, normalizedMapId, refreshGroups]
  );

  const handleDeleteGroup = useCallback(() => {
    if (groupForm?.mode !== 'edit') {
      return;
    }
    Alert.alert('グループを削除', `「${groupForm.group.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          initializeDatabase();
          if (deleteRelationshipGroup(groupForm.group.id)) {
            refreshGroups();
            setGroupForm(null);
          } else {
            Alert.alert('エラー', '削除に失敗しました');
          }
        },
      },
    ]);
  }, [groupForm, refreshGroups]);

  const handlePressGroup = useCallback(
    (groupId: string) => {
      if (linkMode || groupSelectMode) {
        return;
      }
      const group = groupById.get(groupId);
      if (group) {
        setGroupForm({ mode: 'edit', group });
      }
    },
    [groupById, groupSelectMode, linkMode]
  );

  const arrowItems = useMemo(
    () =>
      relationships.flatMap((relationship) => {
        if (relationship.fromType !== 'person' || relationship.toType !== 'person') {
          return [];
        }
        const fromMember = memberById.get(relationship.fromId);
        const toMember = memberById.get(relationship.toId);
        if (!fromMember || !toMember) {
          return [];
        }
        return [
          {
            relationship,
            from: getMemberAvatarCenter(fromMember, dragOffsets[fromMember.id]),
            to: getMemberAvatarCenter(toMember, dragOffsets[toMember.id]),
          },
        ];
      }),
    [dragOffsets, memberById, relationships]
  );

  const groupLayouts = useMemo(
    () =>
      buildGroupFillLayouts({
        groups,
        groupMembers,
        members,
        dragOffsets,
      }),
    [dragOffsets, groupMembers, groups, members]
  );

  const headerRight = useMemo(
    () => (
      <View style={styles.headerActions}>
        <CircleIconButton
          icon={groupSelectMode ? 'close-outline' : 'people-outline'}
          onPress={toggleGroupSelectMode}
          accessibilityLabel={groupSelectMode ? 'グループ選択をやめる' : 'グループを作成'}
        />
        <CircleIconButton
          icon={linkMode ? 'close-outline' : 'git-compare-outline'}
          onPress={toggleLinkMode}
          accessibilityLabel={linkMode ? '関係の追加をやめる' : '関係を追加'}
        />
        <AddCircleButton onPress={openSelector} accessibilityLabel="人物を追加" />
      </View>
    ),
    [groupSelectMode, linkMode, openSelector, toggleGroupSelectMode, toggleLinkMode]
  );

  const headerHint = groupSelectMode
    ? `グループ: ${groupSelectedMemberIds.size}人選択中`
    : linkMode
      ? linkFromMemberId
        ? '2人目をタップしてください'
        : '関係を追加: 1人目をタップしてください'
      : null;

  if (!map) {
    return (
      <SubToolScreenTemplate
        title="相関図"
        onBack={() => router.back()}
        scrollable={false}
        useScreenPadding
      >
        <Text style={[styles.loadingText, contentMutedTextStyle(content)]}>読み込み中…</Text>
      </SubToolScreenTemplate>
    );
  }

  return (
    <>
      <SubToolScreenTemplate
        title={map.title}
        onBack={() => {
          if (linkMode) {
            exitLinkMode();
            return;
          }
          if (groupSelectMode) {
            exitGroupSelectMode();
            return;
          }
          router.back();
        }}
        right={headerRight}
        header={
          headerHint ? (
            <View style={styles.hintBar}>
              <Text style={[styles.hintText, contentTextStyle(content)]}>{headerHint}</Text>
              {groupSelectMode ? (
                <Pressable onPress={openGroupFormFromSelection} hitSlop={8}>
                  <Text style={[styles.hintAction, contentTextStyle(content)]}>作成</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        scrollable={false}
        useScreenPadding={false}
        contentStyle={styles.screenContent}
      >
        {members.length === 0 ? (
          <View style={styles.emptyHintWrap}>
            <Text style={[styles.emptyHint, contentMutedTextStyle(content)]}>
              右上の＋から人物を追加してください。
            </Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          bounces={false}
          style={[styles.canvasScrollOuter, { height: canvasViewportHeight }]}
          contentContainerStyle={styles.canvasScrollOuterContent}
          showsHorizontalScrollIndicator
        >
          <ScrollView
            bounces={false}
            style={{ width: canvasSize.width, height: canvasViewportHeight }}
            contentContainerStyle={{ width: canvasSize.width, minHeight: canvasSize.height }}
            showsVerticalScrollIndicator
          >
            <View style={[styles.canvas, { width: canvasSize.width, height: canvasSize.height }]}>
              <RelationshipMapGrid
                width={canvasSize.width}
                height={canvasSize.height}
                strokeColor={content.contentBorder}
              />
              <RelationshipMapGroupOverlay
                width={canvasSize.width}
                height={canvasSize.height}
                layouts={groupLayouts}
                interactive={!linkMode && !groupSelectMode}
                onPressGroup={handlePressGroup}
              />
              <RelationshipMapArrows
                width={canvasSize.width}
                height={canvasSize.height}
                items={arrowItems}
                strokeColor={content.contentText}
                labelColor={content.contentText}
                onPress={handleArrowPress}
              />
              {members.map((member) => {
                const friend = friendById.get(member.friendId);
                if (!friend) {
                  return null;
                }
                return (
                  <RelationshipMapPersonNode
                    key={member.id}
                    member={member}
                    friend={friend}
                    members={members}
                    selected={
                      linkFromMemberId === member.id || groupSelectedMemberIds.has(member.id)
                    }
                    onTap={() => handleMemberTap(member, friend)}
                    onLongPress={() => confirmDeleteMember(member)}
                    onPositionChange={handlePositionChange}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                  />
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
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
        enableGroupTab={false}
      />

      <RelationshipMapPersonDetailModal
        visible={detailFriend != null}
        friend={detailFriend}
        onClose={() => setDetailFriend(null)}
      />

      <RelationshipMapArrowFormModal
        visible={arrowForm != null}
        title={arrowForm?.mode === 'edit' ? '関係を編集' : '関係を追加'}
        fromName={arrowForm ? memberDisplayName(arrowForm.fromMemberId) : ''}
        toName={arrowForm ? memberDisplayName(arrowForm.toMemberId) : ''}
        initialStyle={arrowForm?.relationship?.style ?? 'oneway'}
        initialLabel={arrowForm?.relationship?.label ?? ''}
        allowDelete={arrowForm?.mode === 'edit'}
        onSave={handleSaveArrow}
        onDelete={handleDeleteArrow}
        onClose={() => setArrowForm(null)}
      />

      <RelationshipMapGroupFormModal
        visible={groupForm != null}
        title={
          groupForm?.mode === 'edit'
            ? 'グループを編集'
            : groupForm?.mode === 'wrap'
              ? '親グループを作成'
              : 'グループを作成'
        }
        initialName={groupForm?.mode === 'edit' ? groupForm.group.name : ''}
        initialColor={
          groupForm?.mode === 'edit' ? groupForm.group.color : nextGroupColor()
        }
        initialParentGroupId={
          groupForm?.mode === 'edit' ? groupForm.group.parentGroupId : null
        }
        parentOptions={
          groupForm?.mode === 'edit'
            ? parentOptionsForForm(groupForm.group.id)
            : groupForm?.mode === 'wrap'
              ? parentOptionsForForm(undefined, groupForm.childGroupIds)
              : parentOptionsForForm()
        }
        allowDelete={groupForm?.mode === 'edit'}
        onSave={handleSaveGroup}
        onDelete={handleDeleteGroup}
        onClose={() => setGroupForm(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingTop: 0,
    paddingBottom: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hintBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  hintAction: {
    fontSize: 15,
    fontWeight: '700',
  },
  loadingText: {
    padding: 16,
    fontSize: 14,
  },
  emptyHintWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
  },
  canvasScrollOuter: {
    flexGrow: 0,
  },
  canvasScrollOuterContent: {
    flexGrow: 1,
  },
  canvas: {
    position: 'relative',
    backgroundColor: 'transparent',
  },
});
