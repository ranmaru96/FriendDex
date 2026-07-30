import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Radius, Spacing, Theme } from '@/constants/theme';
import { useContentColors } from '@/utils/useContentColors';
import {
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentSwitchColors,
  contentTagStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { ParticipantChip } from '@/components/participant/ParticipantChip';
import type { Friend, ShufflePool } from '../../types';
import { buildParticipantChipDisplays } from '../../utils/episodeHelpers';
import {
  createDefaultRankTiers,
  createRankTierId,
  memberIdsToParticipantEntries,
  sanitizeTeamSettingsForPool,
  splitMembersIntoTeams,
  suggestNextRankLabel,
  type ShuffleRankTier,
  type ShuffleTeamAssignment,
} from '../../utils/shuffleHelpers';
import { ShuffleTeamResults } from './ShuffleTeamResults';

type ShuffleTeamPanelProps = {
  activePool: ShufflePool | null;
  friendNameById: Map<string, string>;
  friendPhotoById: Map<string, string | null>;
  friendsById: Map<string, Friend>;
  myselfId?: string | null;
  onShuffleComplete: () => void;
};

export function ShuffleTeamPanel({
  activePool,
  friendNameById,
  friendPhotoById,
  friendsById,
  myselfId = null,
  onShuffleComplete,
}: ShuffleTeamPanelProps) {
  const content = useContentColors();
  const switchColors = contentSwitchColors(content);
  const [teamCount, setTeamCount] = useState(2);
  const [useRanks, setUseRanks] = useState(false);
  const [rankTiers, setRankTiers] = useState<ShuffleRankTier[]>(createDefaultRankTiers);
  const [memberRankById, setMemberRankById] = useState<Record<string, string>>({});
  const [teams, setTeams] = useState<ShuffleTeamAssignment[] | null>(null);
  const [error, setError] = useState('');

  const memberCount = activePool?.memberIds.length ?? 0;

  useEffect(() => {
    if (!activePool) {
      setTeams(null);
      setError('');
      return;
    }
    const sanitized = sanitizeTeamSettingsForPool(
      teamCount,
      memberRankById,
      rankTiers,
      activePool.memberIds
    );
    setTeamCount(sanitized.teamCount);
    setMemberRankById(sanitized.memberRankById);
    setRankTiers(sanitized.rankTiers);
    setTeams(null);
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

  const decrementTeamCount = useCallback(() => {
    setTeamCount((current) => Math.max(2, current - 1));
    setError('');
  }, []);

  const incrementTeamCount = useCallback(() => {
    if (!activePool) {
      return;
    }
    setTeamCount((current) => Math.min(activePool.memberIds.length, current + 1));
    setError('');
  }, [activePool]);

  const updateRankLabel = useCallback((tierId: string, label: string) => {
    setRankTiers((current) =>
      current.map((tier) => (tier.id === tierId ? { ...tier, label } : tier))
    );
    setError('');
  }, []);

  const addRankTier = useCallback(() => {
    setRankTiers((current) => [
      ...current,
      { id: createRankTierId(), label: suggestNextRankLabel(current) },
    ]);
    setError('');
  }, []);

  const removeRankTier = useCallback((tierId: string) => {
    setRankTiers((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((tier) => tier.id !== tierId);
    });
    setMemberRankById((current) => {
      const next: Record<string, string> = {};
      Object.entries(current).forEach(([memberId, assignedTierId]) => {
        if (assignedTierId !== tierId) {
          next[memberId] = assignedTierId;
        }
      });
      return next;
    });
    setError('');
  }, []);

  const assignMemberRank = useCallback((memberId: string, tierId: string | null) => {
    setMemberRankById((current) => {
      const next = { ...current };
      if (!tierId) {
        delete next[memberId];
      } else {
        next[memberId] = tierId;
      }
      return next;
    });
    setError('');
  }, []);

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

    setTeams(result.teams);
    setError('');
    onShuffleComplete();
  }, [activePool, memberRankById, onShuffleComplete, rankTiers, teamCount, useRanks]);

  if (!activePool) {
    return (
      <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
        <Text style={[styles.emptyHint, contentMutedTextStyle(content)]}>
          集団を選ぶと、ここからチーム分けできます。
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.shuffleCard, contentSurfaceStyle(content)]}>
      <Text style={[styles.hintText, contentMutedTextStyle(content)]}>
        チーム数を指定してシャッフルします。ランクを使うと、各チームにランクが均等に配分されます。
      </Text>

      <View style={styles.pickCountRow}>
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
        <Text style={[styles.pickCountMeta, contentMutedTextStyle(content)]}>／ 最大{memberCount}</Text>
      </View>

      <View style={[styles.rankToggleRow, contentTagStyle(content)]}>
        <View style={styles.rankToggleTextWrap}>
          <Text style={[styles.rankToggleLabel, contentTextStyle(content)]}>ランクでバランスを取る</Text>
          <Text style={[styles.rankToggleHint, contentMutedTextStyle(content)]}>
            各ランクの人数をチーム間で均等に配分
          </Text>
        </View>
        <Switch
          value={useRanks}
          onValueChange={(value) => {
            setUseRanks(value);
            setError('');
          }}
          trackColor={switchColors.trackColor}
          thumbColor={useRanks ? Theme.accent : switchColors.thumbColorOff}
        />
      </View>

      {useRanks ? (
        <View style={[styles.rankSection, contentTagStyle(content)]}>
          <View style={styles.rankSectionHeader}>
            <Text style={[styles.rankSectionTitle, contentTextStyle(content)]}>ランク設定</Text>
            <Pressable
              style={[styles.addRankButton, contentSelectedOptionStyle(content)]}
              onPress={addRankTier}
            >
              <Text style={[styles.addRankButtonText, contentTextStyle(content)]}>＋ ランク追加</Text>
            </Pressable>
          </View>

          {rankTiers.map((tier, index) => (
            <View key={tier.id} style={styles.rankTierRow}>
              <Text style={[styles.rankTierIndex, contentMutedTextStyle(content)]}>{index + 1}</Text>
              <TextInput
                style={[styles.rankTierInput, contentInputStyle(content)]}
                value={tier.label}
                onChangeText={(label) => updateRankLabel(tier.id, label)}
                placeholder={`ランク${index + 1}`}
                placeholderTextColor={content.contentTextSecondary}
              />
              <Pressable
                onPress={() => removeRankTier(tier.id)}
                disabled={rankTiers.length <= 1}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.removeRankText,
                    rankTiers.length <= 1 && styles.removeRankTextDisabled,
                  ]}
                >
                  削除
                </Text>
              </Pressable>
            </View>
          ))}

          <Text style={[styles.memberRankTitle, contentTextStyle(content)]}>メンバーのランク</Text>
          <View style={styles.memberRankList}>
            {poolMemberChips.map((chip) => {
              const memberId = chip.friendId;
              if (!memberId) {
                return null;
              }
              const assignedTierId = memberRankById[memberId];
              return (
                <View
                  key={chip.id}
                  style={[styles.memberRankRow, { borderTopColor: content.contentDivider }]}
                >
                  <View style={styles.memberChipWrap}>
                    <ParticipantChip chip={chip} compact />
                  </View>
                  <View style={styles.rankPillRow}>
                    <Pressable
                      style={[
                        styles.rankPill,
                        contentTagStyle(content),
                        !assignedTierId ? contentSelectedOptionStyle(content) : null,
                      ]}
                      onPress={() => assignMemberRank(memberId, null)}
                    >
                      <Text
                        style={[
                          styles.rankPillText,
                          contentTextStyle(content),
                        ]}
                      >
                        なし
                      </Text>
                    </Pressable>
                    {rankTiers.map((tier) => {
                      const selected = assignedTierId === tier.id;
                      return (
                        <Pressable
                          key={`${memberId}-${tier.id}`}
                          style={[
                            styles.rankPill,
                            contentTagStyle(content),
                            selected ? contentSelectedOptionStyle(content) : null,
                          ]}
                          onPress={() => assignMemberRank(memberId, tier.id)}
                        >
                          <Text
                            style={[
                              styles.rankPillText,
                              contentTextStyle(content),
                            ]}
                          >
                            {tier.label.trim() || '?'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <Pressable style={styles.shuffleButton} onPress={runTeamShuffle}>
        <Text style={styles.shuffleButtonText}>シャッフル</Text>
      </Pressable>

      {error ? <Text style={styles.formError}>{error}</Text> : null}

      {teams && teams.length > 0 ? (
        <View style={[styles.resultSection, { borderTopColor: content.contentDivider }]}>
          <Text style={[styles.resultTitle, contentTextStyle(content)]}>チーム分け結果</Text>
          <ShuffleTeamResults
            teams={teams}
            friendsById={friendsById}
            myselfId={myselfId}
          />
          <Pressable
            style={[styles.reshuffleButton, contentSelectedOptionStyle(content)]}
            onPress={runTeamShuffle}
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
  pickCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
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
  pickCountMeta: {
    fontSize: 13,
    fontWeight: '600',
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
  rankToggleTextWrap: {
    flex: 1,
    gap: 2,
  },
  rankToggleLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  rankToggleHint: {
    fontSize: 11,
    lineHeight: 15,
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
  rankTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankTierIndex: {
    width: 18,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  rankTierInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    minHeight: 36,
  },
  removeRankText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  removeRankTextDisabled: {
    opacity: 0.35,
  },
  memberRankTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  memberRankList: {
    gap: 10,
  },
  memberRankRow: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  memberChipWrap: {
    alignSelf: 'flex-start',
  },
  rankPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rankPill: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  rankPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  shuffleButton: {
    backgroundColor: Theme.accent,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shuffleButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.onAccent,
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
