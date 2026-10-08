import type { MBTIType } from '@/types';

type MbtiTagGroup = 'analyst' | 'diplomat' | 'sentinel' | 'explorer';

type MbtiTagColors = {
  backgroundColor: string;
  color: string;
};

const MBTI_GROUP: Record<Exclude<MBTIType, ''>, MbtiTagGroup> = {
  INTJ: 'analyst',
  INTP: 'analyst',
  ENTJ: 'analyst',
  ENTP: 'analyst',
  INFJ: 'diplomat',
  INFP: 'diplomat',
  ENFJ: 'diplomat',
  ENFP: 'diplomat',
  ISTJ: 'sentinel',
  ISFJ: 'sentinel',
  ESTJ: 'sentinel',
  ESFJ: 'sentinel',
  ISTP: 'explorer',
  ISFP: 'explorer',
  ESTP: 'explorer',
  ESFP: 'explorer',
};

/** 分析家＝紫 / 外交官＝緑 / 番人＝水色 / 探検家＝黄 */
const GROUP_COLORS: Record<MbtiTagGroup, MbtiTagColors> = {
  analyst: { backgroundColor: '#88619A', color: '#FFFFFF' },
  diplomat: { backgroundColor: '#33A474', color: '#FFFFFF' },
  sentinel: { backgroundColor: '#4298B4', color: '#FFFFFF' },
  explorer: { backgroundColor: '#E4AE3A', color: '#3A2F00' },
};

export function getMbtiTagColors(mbti: string): MbtiTagColors | null {
  const group = MBTI_GROUP[mbti as Exclude<MBTIType, ''>];
  return group ? GROUP_COLORS[group] : null;
}
