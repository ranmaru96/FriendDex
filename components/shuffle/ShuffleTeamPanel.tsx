import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentSwitchProps,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import type { Friend, ShufflePool } from '../../types';
import {
  createRankTierId,
  splitMembersIntoTeams,
  suggestNextRankLabel,
  type ShuffleRankTier,
  type ShuffleTeamAssignment,
} from '../../utils/shuffleHelpers';
import { friendsFromMemberIds, ShufflePoolMemberPicker } from './ShufflePoolMemberPicker';
import { ShufflePanelHeader } from './ShufflePanelHeader';
import { ShuffleResultTitle } from './ShuffleResultTitle';
import { ShuffleColumnsCycleButton } from './ShuffleColumnsCycleButton';
import { ShuffleSwitch } from './ShuffleSwitch';
import { ShuffleTeamResults } from './ShuffleTeamResults';

type TeamCountUpdater = number | ((current: number) => number);
type RankTiersUpdater = ShuffleRankTier[] | ((current: ShuffleRankTier[]) => ShuffleRankTier[]);
type MemberRankUpdater =
  | Record<string, string>
  | ((current: Record<string, string>) => Record<string, string>);

type ShuffleTeamPanelProps = {
  activePool: ShufflePool | null;
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  friendsById: Map<string, Friend>;
  myselfId?: string | null;
  onShuffleComplete: () => void;
  teamCount: number;
  onTeamCountChange: (next: TeamCountUpdater) => void;
  useRanks: boolean;
  onUseRanksChange: (next: boolean) => void;
  rankTiers: ShuffleRankTier[];
  onRankTiersChange: (next: RankTiersUpdater) => void;
  memberRankById: Record<string, string>;
  onMemberRankByIdChange: (next: MemberRankUpdater) => void;
  teams: ShuffleTeamAssignment[] | null;
  onTeamsChange: (next: ShuffleTeamAssignment[] | null) => void;
  resultColumns: number;
  onResultColumnsChange: (next: number) => void;
  runLabel?: string | null;
};

export function ShuffleTeamPanel({
  activePool,
  friendsById,
  myselfId = null,
  onShuffleComplete,
  teamCount,
  onTeamCountChange,
  useRanks,
  onUseRanksChange,
  rankTiers,
  onRankTiersChange,
  memberRankById,
  onMemberRankByIdChange,
  teams,
  onTeamsChange,
  resultColumns,
  onResultColumnsChange,
  runLabel,
}: ShuffleTeamPanelProps) {
  const content = useContentColors();
  const [error, setError] = useState('');

  const memberCount = activePool?.memberIds.length ?? 0;

  const decrementTeamCount = useCallback(() => {
    onTeamCountChange((current) => Math.max(2, current - 1));
    setError('');
  }, [onTeamCountChange]);

  const incrementTeamCount = useCallback(() => {
    if (!activePool) {
      return;
    }
    onTeamCountChange((current) => Math.min(activePool.memberIds.length, current + 1));
    setError('');
  }, [activePool, onTeamCountChange]);

  const updateRankLabel = useCallback((tierId: string, label: string) => {
    onRankTiersChange((current) =>
      current.map((tier) => (tier.id === tierId ? { ...tier, label } : tier))
    );
    setError('');
  }, [onRankTiersChange]);

  const addRankTier = useCallback(() => {
    onRankTiersChange((current) => [
      ...current,
      { id: createRankTierId(), label: suggestNextRankLabel(current) },
    ]);
    setError('');
  }, [onRankTiersChange]);

  const removeRankTier = useCallback((tierId: string) => {
    onRankTiersChange((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((tier) => tier.id !== tierId);
    });
    onMemberRankByIdChange((current) => {
      const next: Record<string, string> = {};
      Object.entries(current).forEach(([memberId, assignedTierId]) => {
        if (assignedTierId !== tierId) {
          next[memberId] = assignedTierId;
        }
      });
      return next;
    });
    setError('');
  }, [onMemberRankByIdChange, onRankTiersChange]);

  const setMembersForRole = useCallback((tierId: string, memberIds: string[]) => {
    onMemberRankByIdChange((current) => {
      const next: Record<string, string> = {};
      Object.entries(current).forEach(([memberId, assignedTierId]) => {
        if (assignedTierId !== tierId) {
          next[memberId] = assignedTierId;
        }
      });
      memberIds.forEach((memberId) => {
        if (!next[memberId]) {
          next[memberId] = tierId;
        }
      });
      return next;
    });
    setError('');
  }, [onMemberRankByIdChange]);

  const runTeamShuffle = useCallback(() => {
    if (!activePool) {
      setError('集団を選んでからシャッフルしてください。');
      return;
    }

    const result = splitMembersIntoTeams(activePool.memberIds, teamCount, {
      useRanks,
      memberRankById,
      rankTiers,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onTeamsChange(result.teams);
    setError('');
    onShuffleComplete();
  }, [
    activePool,
    memberRankById,
    onShuffleComplete,
    onTeamsChange,
    rankTiers,
    teamCount,
    useRanks,
  ]);

  if (!activePool) {
    return (
      <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
        <ShufflePanelHeader mode="team">
          <Text style={[styles.emptyHint, contentMutedTextStyle(content)]}>
            集団を選ぶと、ここからチーム分けできます。
          </Text>
        </ShufflePanelHeader>
      </View>
    );
  }

  return (
    <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
      <ShufflePanelHeader
        mode="team"
        onShuffle={runTeamShuffle}
      >
        <Text style={[styles.pickCountLabel, contentTextStyle(content)]}>チーム数</Text>
        <View style={styles.stepper}>
          <Pressable
            style={[
              styles.stepperButton,
              contentTagStyle(content),
              teamCount <= 2 && styles.stepperButtonDisabled,
            ]}
            onPress={decrementTeamCount}
            disabled={teamCount <= 2}
          >
            <Text style={[styles.stepperButtonText, contentTextStyle(content)]}>−</Text>
          </Pressable>
          <Text style={[styles.pickCountValue, contentTextStyle(content)]}>{teamCount}</Text>
          <Pressable
            style={[
              styles.stepperButton,
              contentTagStyle(content),
              teamCount >= memberCount && styles.stepperButtonDisabled,
            ]}
            onPress={incrementTeamCount}
            disabled={teamCount >= memberCount}
          >
            <Text style={[styles.stepperButtonText, contentTextStyle(content)]}>＋</Text>
          </Pressable>
        </View>
      </ShufflePanelHeader>

      <View style={[styles.rankToggleRow, contentTagStyle(content)]}>
        <Text style={[styles.rankToggleLabel, contentTextStyle(content)]}>チームのバランスをとる</Text>
        <ShuffleSwitch
          value={useRanks}
          onValueChange={(value) => {
            onUseRanksChange(value);
            setError('');
          }}
          {...contentSwitchProps(content, useRanks)}
          accessibilityLabel="チームのバランスをとる"
        />
      </View>

      {useRanks ? (
        <View style={[styles.rankSection, contentTagStyle(content)]}>
          <View style={styles.rankSectionHeader}>
            <Text style={[styles.rankSectionTitle, contentTextStyle(content)]}>役割設定</Text>
            <Pressable
              style={[styles.addRankButton, contentSelectedOptionStyle(content)]}
              onPress={addRankTier}
            >
              <Text style={[styles.addRankButtonText, contentTextStyle(content)]}>＋ 役割追加</Text>
            </Pressable>
          </View>

          {rankTiers.map((tier, index) => {
            const membersInRole = Object.entries(memberRankById)
              .filter(([, assignedTierId]) => assignedTierId === tier.id)
              .map(([memberId]) => memberId);
            const eligibleIds = (activePool?.memberIds ?? []).filter((memberId) => {
              const assignedTierId = memberRankById[memberId];
              return !assignedTierId || assignedTierId === tier.id;
            });
            return (
              <View
                key={tier.id}
                style={[
                  styles.roleBlock,
                  index > 0 ? { borderTopColor: content.contentDivider } : styles.roleBlockFirst,
                ]}
              >
                <ShufflePoolMemberPicker
                  buttonLabel="対象者選択"
                  eligibleFriends={friendsFromMemberIds(eligibleIds, friendsById)}
                  selectedMemberIds={membersInRole}
                  onChange={(memberIds) => setMembersForRole(tier.id, memberIds)}
                  inlineLeading={
                    <>
                      <Text style={[styles.rankTierIndex, contentMutedTextStyle(content)]}>
                        {index + 1}
                      </Text>
                      <TextInput
                        style={[styles.rankTierInput, contentInputStyle(content)]}
                        value={tier.label}
                        onChangeText={(label) => updateRankLabel(tier.id, label)}
                        placeholder={`役割${index + 1}`}
                        placeholderTextColor={content.contentTextSecondary}
                      />
                    </>
                  }
                  inlineTrailing={
                    <Pressable
                      style={[
                        styles.removeRankButton,
                        contentTagStyle(content),
                        rankTiers.length <= 1 ? styles.removeRankButtonDisabled : null,
                      ]}
                      onPress={() => removeRankTier(tier.id)}
                      disabled={rankTiers.length <= 1}
                      accessibilityRole="button"
                      accessibilityLabel="役割を削除"
                    >
                      <Ionicons name="trash-outline" size={18} color={content.contentText} />
                    </Pressable>
                  }
                />
              </View>
            );
          })}
        </View>
      ) : null}

      {error ? <Text style={styles.formError}>{error}</Text> : null}

      {teams && teams.length > 0 ? (
        <View style={[styles.resultSection, { borderTopColor: content.contentDivider }]}>
          <ShuffleResultTitle
            title="チーム分け結果"
            runLabel={runLabel}
            trailing={
              <ShuffleColumnsCycleButton value={resultColumns} onChange={onResultColumnsChange} />
            }
          />
          <ShuffleTeamResults
            teams={teams}
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
  rankToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
  },
  rankToggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  rankSection: {
    gap: 10,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
  },
  rankSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rankSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  addRankButton: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addRankButtonText: {
    fontSize: 11,
    fontWeight: '700',
  },
  roleBlock: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  roleBlockFirst: {
    paddingTop: 0,
    borderTopWidth: 0,
  },
  rankTierIndex: {
    width: 18,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 0,
  },
  rankTierInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 72,
    maxWidth: 120,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    minHeight: 36,
  },
  removeRankButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  removeRankButtonDisabled: {
    opacity: 0.35,
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
