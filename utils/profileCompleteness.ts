import { Theme } from '@/constants/theme';
import type { Friend } from '../types';

export const computeProfileCompleteness = (friend: Friend, hasPhoto: boolean): number => {
  const completenessFields = [
    hasPhoto ? friend.photoUri : null,
    friend.mbti?.trim() || null,
    friend.birthday?.trim() || null,
    friend.origin?.trim() || null,
    friend.residence?.trim() || null,
    friend.height,
    friend.weight,
    friend.description?.trim() || null,
    friend.category?.trim() || null,
    friend.affiliations.some((value) => value.trim()) ? 'ok' : null,
    friend.personalities.some((value) => value.trim()) ? 'ok' : null,
    friend.likes.some((value) => value.trim()) ? 'ok' : null,
    friend.dislikes.some((value) => value.trim()) ? 'ok' : null,
  ];
  return Math.round((completenessFields.filter(Boolean).length / completenessFields.length) * 100);
};

export type HomeCardBorderStyle = {
  borderColor: string;
  cardBorderWidth: number;
};

export const getHomeCardBorderStyle = (completeness: number): HomeCardBorderStyle => {
  if (completeness >= 100) {
    return {
      borderColor: Theme.homeCardBorderComplete,
      cardBorderWidth: Theme.homeCardBorderWidth,
    };
  }
  if (completeness >= 80) {
    return { borderColor: Theme.homeCardBorderHigh, cardBorderWidth: Theme.homeCardBorderWidth };
  }
  if (completeness >= 50) {
    return { borderColor: Theme.homeCardBorderMid, cardBorderWidth: Theme.homeCardBorderWidth };
  }
  return { borderColor: Theme.homeCardBorderLow, cardBorderWidth: Theme.homeCardBorderWidth };
};
