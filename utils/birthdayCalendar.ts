import type { Friend } from '@/types';
import { resolveFriendDisplayPhotoUri } from '@/utils/friendPhoto';

export type BirthdayFriendDisplay = {
  friendId: string;
  name: string;
  photoUri: string | null;
};

/** 'YYYY-MM-DD' / 'MM-DD' → 'MM-DD'。判定できない値は null */
export const toMonthDayKey = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const matched = trimmed.match(/(\d{2})-(\d{2})$/);
  if (!matched) {
    return null;
  }
  const month = Number(matched[1]);
  const day = Number(matched[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${matched[1]}-${matched[2]}`;
};

/** 月日（MM-DD）→ 該当する人物。年は無視するので毎年表示される。 */
export const buildBirthdayFriendsByMonthDay = (
  friends: Friend[]
): Map<string, BirthdayFriendDisplay[]> => {
  const map = new Map<string, BirthdayFriendDisplay[]>();
  friends.forEach((friend) => {
    const monthDay = toMonthDayKey(friend.birthday ?? '');
    if (!monthDay) {
      return;
    }
    const list = map.get(monthDay) ?? [];
    list.push({
      friendId: friend.id,
      name: friend.name,
      photoUri: resolveFriendDisplayPhotoUri(friend),
    });
    map.set(monthDay, list);
  });
  return map;
};

export const getBirthdayFriendsForDateKey = (
  byMonthDay: Map<string, BirthdayFriendDisplay[]>,
  dateKey: string
): BirthdayFriendDisplay[] => {
  const monthDay = toMonthDayKey(dateKey);
  if (!monthDay) {
    return [];
  }
  return byMonthDay.get(monthDay) ?? [];
};
