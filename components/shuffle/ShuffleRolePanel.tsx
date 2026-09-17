import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import type { Friend, ShufflePool } from '../../types';
import { ShuffleExcludeToggle } from './ShuffleExcludePicker';
import { friendsFromMemberIds, ShufflePoolMemberPicker } from './ShufflePoolMemberPicker';
import {
  assignRolesToMembers,
  createEmptyRoleDraft,
  type ShuffleRoleAssignment,
  type ShuffleRoleDraft,
} from '../../utils/shuffleHelpers';
import { ShufflePanelHeader } from './ShufflePanelHeader';
import { ShuffleResultTitle } from './ShuffleResultTitle';
import { ShuffleColumnsCycleButton } from './ShuffleColumnsCycleButton';
import { ShuffleRoleResults } from './ShuffleRoleResults';

type RoleDraftUpdater =
  | ShuffleRoleDraft[]
  | ((current: ShuffleRoleDraft[]) => ShuffleRoleDraft[]);

type ShuffleRolePanelProps = {
  activePool: ShufflePool | null;
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  friendsById: Map<string, Friend>;
  myselfId?: string | null;
  onShuffleComplete: () => void;
  roleDrafts: ShuffleRoleDraft[];
  onRoleDraftsChange: (next: RoleDraftUpdater) => void;
  assignments: ShuffleRoleAssignment[] | null;
  onAssignmentsChange: (next: ShuffleRoleAssignment[] | null) => void;
  resultColumns: number;
  onResultColumnsChange: (next: number) => void;
  runLabel?: string | null;
};

export function ShuffleRolePanel({
  activePool,
  friendsById,
  myselfId = null,
  onShuffleComplete,
  roleDrafts,
  onRoleDraftsChange,
  assignments,
  onAssignmentsChange,
  resultColumns,
  onResultColumnsChange,
  runLabel,
}: ShuffleRolePanelProps) {
  const content = useContentColors();
  const [error, setError] = useState('');
  const [excludeOpenByRoleId, setExcludeOpenByRoleId] = useState<Record<string, boolean>>({});

  const memberCount = activePool?.memberIds.length ?? 0;
  const roleCount = Math.max(roleDrafts.length, 1);

  const poolEligibleFriends = useMemo(
    () => (activePool ? friendsFromMemberIds(activePool.memberIds, friendsById) : []),
    [activePool, friendsById]
  );

  const updateRole = useCallback((roleId: string, patch: Partial<ShuffleRoleDraft>) => {
    onRoleDraftsChange((current) =>
      current.map((role) => (role.id === roleId ? { ...role, ...patch } : role))
    );
    setError('');
  }, [onRoleDraftsChange]);

  const decrementRoleSlotCount = useCallback(() => {
    onRoleDraftsChange((current) => {
      if (current.length <= 1) {
        return current.length === 0 ? [createEmptyRoleDraft()] : current;
      }
      return current.slice(0, current.length - 1);
    });
    setError('');
  }, [onRoleDraftsChange]);

  const incrementRoleSlotCount = useCallback(() => {
    if (!activePool) {
      return;
    }
    onRoleDraftsChange((current) => {
      if (current.length >= activePool.memberIds.length) {
        return current.length === 0 ? [createEmptyRoleDraft()] : current;
      }
      return [...current, createEmptyRoleDraft()];
    });
    setError('');
  }, [activePool, onRoleDraftsChange]);

  const setExcludedMembers = useCallback((roleId: string, memberIds: string[]) => {
    updateRole(roleId, { excludedMemberIds: memberIds });
  }, [updateRole]);

  const setExcludeOpen = useCallback((roleId: string, open: boolean) => {
    setExcludeOpenByRoleId((current) => ({ ...current, [roleId]: open }));
    if (!open) {
      updateRole(roleId, { excludedMemberIds: [] });
    }
    setError('');
  }, [updateRole]);

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

    onAssignmentsChange(result.assignments);
    setError('');
    onShuffleComplete();
  }, [activePool, onAssignmentsChange, onShuffleComplete, roleDrafts]);

  return (
    <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
      <ShufflePanelHeader
        mode="role"
        onShuffle={activePool ? runRoleShuffle : undefined}
      >
        {activePool ? (
          <>
            <Text style={[styles.pickCountLabel, contentTextStyle(content)]}>役割数</Text>
            <View style={styles.stepper}>
              <Pressable
                style={[
                  styles.stepperButton,
                  contentTagStyle(content),
                  roleCount <= 1 && styles.stepperButtonDisabled,
                ]}
                onPress={decrementRoleSlotCount}
                disabled={roleCount <= 1}
              >
                <Text style={[styles.stepperButtonText, contentTextStyle(content)]}>−</Text>
              </Pressable>
              <Text style={[styles.pickCountValue, contentTextStyle(content)]}>{roleCount}</Text>
              <Pressable
                style={[
                  styles.stepperButton,
                  contentTagStyle(content),
                  roleCount >= memberCount && styles.stepperButtonDisabled,
                ]}
                onPress={incrementRoleSlotCount}
                disabled={roleCount >= memberCount}
              >
                <Text style={[styles.stepperButtonText, contentTextStyle(content)]}>＋</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={[styles.emptyHint, contentMutedTextStyle(content)]}>
            集団を選ぶと、ここから役割分担できます。
          </Text>
        )}
      </ShufflePanelHeader>

      {activePool
        ? roleDrafts.map((role) => {
            const excludeOpen = excludeOpenByRoleId[role.id] ?? role.excludedMemberIds.length > 0;
            return (
              <View key={role.id} style={[styles.roleCard, contentTagStyle(content)]}>
                {excludeOpen ? (
                  <ShufflePoolMemberPicker
                    buttonLabel="対象者選択"
                    eligibleFriends={poolEligibleFriends}
                    selectedMemberIds={role.excludedMemberIds}
                    onChange={(memberIds) => setExcludedMembers(role.id, memberIds)}
                    inlineLeading={
                      <TextInput
                        style={[styles.roleNameInput, styles.roleNameInputShort, contentInputStyle(content)]}
                        value={role.name}
                        onChangeText={(name) => updateRole(role.id, { name })}
                        placeholder="役名（例: 運転手）"
                        placeholderTextColor={content.contentTextSecondary}
                      />
                    }
                  />
                ) : (
                  <TextInput
                    style={[styles.roleNameInput, contentInputStyle(content)]}
                    value={role.name}
                    onChangeText={(name) => updateRole(role.id, { name })}
                    placeholder="役名（例: 運転手）"
                    placeholderTextColor={content.contentTextSecondary}
                  />
                )}

                <ShuffleExcludeToggle
                  open={excludeOpen}
                  onOpenChange={(open) => setExcludeOpen(role.id, open)}
                />
              </View>
            );
          })
        : null}

      {error ? <Text style={styles.formError}>{error}</Text> : null}

      {assignments && assignments.length > 0 ? (
        <View style={[styles.resultSection, { borderTopColor: content.contentDivider }]}>
          <ShuffleResultTitle
            title="振り分け結果"
            runLabel={runLabel}
            trailing={
              <ShuffleColumnsCycleButton value={resultColumns} onChange={onResultColumnsChange} />
            }
          />
          <ShuffleRoleResults
            assignments={assignments}
            friendsById={friendsById}
            myselfId={myselfId}
            columns={resultColumns}
          />
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
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  pickCountLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.4,
  },
  stepperButtonText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  pickCountValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
  },
  roleCard: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    gap: 8,
  },
  roleNameInput: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
    minHeight: 34,
  },
  roleNameInputShort: {
    alignSelf: 'auto',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 72,
    maxWidth: 120,
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
});
