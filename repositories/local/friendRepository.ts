import { getAllFriends, getFriendById, getMyself } from '@/db';
import type { Friend } from '@/types';
import type { LocalFriendId } from '@/types/sync';

/** Phase 0: 精算ルームのメンバー紐付け用。人物マスタは当面ローカルのみ */
export interface ILocalFriendRepository {
  listFriends(): Friend[];
  getFriend(friendId: LocalFriendId): Friend | null;
  getMyselfFriendId(): LocalFriendId | null;
  resolveDisplayName(friendId: LocalFriendId): string;
}

export class LocalFriendRepository implements ILocalFriendRepository {
  listFriends(): Friend[] {
    return getAllFriends();
  }

  getFriend(friendId: LocalFriendId): Friend | null {
    return getFriendById(friendId);
  }

  getMyselfFriendId(): LocalFriendId | null {
    return getMyself();
  }

  resolveDisplayName(friendId: LocalFriendId): string {
    return getFriendById(friendId)?.name ?? friendId;
  }
}

export const localFriendRepository = new LocalFriendRepository();
