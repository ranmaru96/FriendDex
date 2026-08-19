import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
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
import { ParticipantChip } from '@/components/participant/ParticipantChip';
import type { Friend, ShufflePool } from '../../types';
import { buildParticipantChipDisplays } from '../../utils/episodeHelpers';
import {
  assignRolesToMembers,
  createEmptyRoleDraft,
  memberIdsToParticipantEntries,
  sanitizeRoleDraftsForPool,
  type ShuffleRoleAssignment,
  type ShuffleRoleDraft,
} from '../../utils/shuffleHelpers';
import { ShuffleRoleResults } from './ShuffleRoleResults';

type ShuffleRolePanelProps = {
  activePool: ShufflePool | null;
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  friendsById: Map<string, Friend>;
  myselfId?: string | null;
  onShuffleComplete: () => void;
};

export function ShuffleRolePanel({
  activePool,
  friendNameById,
  friendPhotoById,
  friendsById,
  myselfId = null,
  onShuffleComplete,
}: ShuffleRolePanelProps) {
  const content = useContentColors();
  const [roleDrafts, setRoleDrafts] = useState<ShuffleRoleDraft[]>([createEmptyRoleDraft(1)]);
  const [assignments, setAssignments] = useState<ShuffleRoleAssignment[] | null>(null);
  const [error, setError] = useState('');

  const memberCount = activePool?.memberIds.length ?? 0;

  useEffect(() => {
    if (!activePool) {
      setAssignments(null);
      setError('');
      return;
    }
    setRoleDrafts((current) => sanitizeRoleDraftsForPool(current, activePool.memberIds));
    setAssignments(null);
    setError('');
  }, [activePool?.id, memberCount]);

  const poolMemberChips = useMemo(() => {
    if (!activePool) {
      return [];
    }
    return buildParticipantChipDisplays(
      memberIdsToParticipantEntries(activePool.memberIds),
      friendNameById,
      { friendPhotoById }
    );
  }, [activePool, friendNameById, friendPhotoById]);

  const updateRole = useCallback((roleId: string, patch: Partial<ShuffleRoleDraft>) => {
    setRoleDrafts((current) =>
      current.map((role) => (role.id === roleId ? { ...role, ...patch } : role))
    );
    setError('');
  }, []);

  const addRole = useCallback(() => {
    setRoleDrafts((current) => [...current, createEmptyRoleDraft(current.length + 1)]);
    setError('');
  }, []);

  const removeRole = useCallback((roleId: string) => {
    setRoleDrafts((current) => {
      if (current.length <= 1) {
        return [createEmptyRoleDraft(1)];
      }
      return current.filter((role) => role.id !== roleId);
    });
    setError('');
  }, []);

  const toggleExcludedMember = useCallback((roleId: string, memberId: string) => {
    setRoleDrafts((current) =>
      current.map((role) => {
        if (role.id !== roleId) {
          return role;
        }
        const excluded = new Set(role.excludedMemberIds);
        if (excluded.has(memberId)) {
          excluded.delete(memberId);
        } else {
          excluded.add(memberId);
        }
        return { ...role, excludedMemberIds: Array.from(excluded) };
      })
    );
    setError('');
  }, []);

  const decrementRoleCount = useCallback((roleId: string) => {
    setRoleDrafts((current) =>
      current.map((role) =>
        role.id === roleId ? { ...role, count: Math.max(1, role.count - 1) } : role
      )
    );
    setError('');
  }, []);

  const incrementRoleCount = useCallback(
    (roleId: string) => {
      if (!activePool) {
        return;
      }
      setRoleDrafts((current) =>
        current.map((role) =>
          role.id === roleId
            ? { ...role, count: Math.min(activePool.memberIds.length, role.count + 1) }
            : role
        )
      );
      setError('');
    },
    [activePool]
  );

  const runRoleShuffle = useCallback(() => {
    if (!activePool) {
      setError('集団を選んでからシャッフルしてください。');
      return;
    }

    const result = assignRolesToMembers(
      activePool.memberIds,
      roleDrafts.map((role) => ({
        name: role.name,
        count: role.count,
        excludedMemberIds: role.excludedMemberIds,
      }))
    );

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setAssignments(result.assignments);
    setError('');
    onShuffleComplete();
  }, [activePool, onShuffleComplete, roleDrafts]);

  if (!activePool) {
    return (
      <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
        <Text style={[styles.emptyHint, contentMutedTextStyle(content)]}>
          集団を選ぶと、ここから役割分担できます。
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
      <Text style={[styles.hintText, contentMutedTextStyle(content)]}>
        役を追加し、人数と「この役にしない人」を設定してからシャッフルします。
      </Text>

      {roleDrafts.map((role, index) => {
        const excludedSet = new Set(role.excludedMemberIds);
        return (
          <View key={role.id} style={[styles.roleCard, contentTagStyle(content)]}>
            <View style={styles.roleCardHeader}>
              <Text style={[styles.roleCardTitle, contentTextStyle(content)]}>役 {index + 1}</Text>
              <Pressable onPress={() => removeRole(role.id)} hitSlop={8}>
                <Text style={styles.removeRoleText}>削除</Text>
              </Pressable>
            </View>

            <View style={styles.roleNameCountRow}>
              <TextInput
                style={[styles.roleNameInput, contentInputStyle(content)]}
                value={role.name}
                onChangeText={(name) => updateRole(role.id, { name })}
                placeholder="役名（例: 運転手）"
                placeholderTextColor={content.contentTextSecondary}
              />
              <View style={styles.stepper}>
                <Pressable
                  style={[
                    styles.stepperButton,
                    contentTagStyle(content),
                    role.count <= 1 && styles.stepperButtonDisabled,
                  ]}
                  onPress={() => decrementRoleCount(role.id)}
                  disabled={role.count <= 1}
                >
                  <Text style={[styles.stepperButtonText, contentTextStyle(content)]}>−</Text>
                </Pressable>
                <Text style={[styles.pickCountValue, contentTextStyle(content)]}>{role.count}</Text>
                <Pressable
                  style={[
                    styles.stepperButton,
                    contentTagStyle(content),
                    role.count >= memberCount && styles.stepperButtonDisabled,
                  ]}
                  onPress={() => incrementRoleCount(role.id)}
                  disabled={role.count >= memberCount}
                >
                  <Text style={[styles.stepperButtonText, contentTextStyle(content)]}>＋</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.excludeSection}>
              <Text style={[styles.excludeLabel, contentTextStyle(content)]}>この役にしない人</Text>
              <Text style={[styles.excludeHint, contentMutedTextStyle(content)]}>タップで選択・解除</Text>
              <View style={styles.excludeChipWrap}>
                {poolMemberChips.map((chip) => {
                  const memberId = chip.friendId;
                  if (!memberId) {
                    return null;
                  }
                  const excluded = excludedSet.has(memberId);
                  return (
                    <View
                      key={`${role.id}-${chip.id}`}
                      style={[
                        styles.excludeChipItem,
                        excluded
                          ? {
                              borderColor: '#f87171',
                              backgroundColor: 'rgba(248, 113, 113, 0.18)',
                            }
                          : null,
                      ]}
                    >
                      <ParticipantChip chip={chip} compact onPress={() => toggleExcludedMember(role.id, memberId)} />
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        );
      })}

      <Pressable
        style={[styles.addRoleButton, contentSelectedOptionStyle(content)]}
        onPress={addRole}
      >
        <Text style={[styles.addRoleButtonText, contentTextStyle(content)]}>＋ 役を追加</Text>
      </Pressable>

      <Pressable
        style={[styles.shuffleButton, contentFilledButtonStyle(content)]}
        onPress={runRoleShuffle}
      >
        <Text style={[styles.shuffleButtonText, contentFilledButtonTextStyle(content)]}>
          シャッフル
        </Text>
      </Pressable>

      {error ? <Text style={styles.formError}>{error}</Text> : null}

      {assignments && assignments.length > 0 ? (
        <View style={[styles.resultSection, { borderTopColor: content.contentDivider }]}>
          <Text style={[styles.resultTitle, contentTextStyle(content)]}>振り分け結果</Text>
          <ShuffleRoleResults
            assignments={assignments}
            friendsById={friendsById}
            myselfId={myselfId}
          />
          <Pressable
            style={[styles.reshuffleButton, contentSelectedOptionStyle(content)]}
            onPress={runRoleShuffle}
          >
            <Text style={[styles.reshuffleButtonText, contentTextStyle(content)]}>
              もう一度シャッフル
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shuffleCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 12,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 17,
  },
  roleCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    gap: 8,
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleCardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  removeRoleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
  },
  roleNameCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleNameInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
    minHeight: 34,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.4,
  },
  stepperButtonText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  pickCountValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
  },
  excludeSection: {
    gap: 4,
  },
  excludeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  excludeHint: {
    fontSize: 11,
  },
  excludeChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  excludeChipItem: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  addRoleButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addRoleButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  shuffleButton: {
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shuffleButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  formError: {
    fontSize: 12,
    color: '#b91c1c',
  },
  resultSection: {
    gap: 12,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  reshuffleButton: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  reshuffleButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
