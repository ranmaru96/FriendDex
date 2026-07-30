import type { EntityId, LocalFriendId } from './sync';

/** UI プロトタイプ用: フォロー関係（サーバ実装前のモック） */
export type MockFollowRelation = 'mutual' | 'outgoing' | 'incoming' | 'none';

export type MockSettlementMember = {
  id: EntityId;
  friendId: LocalFriendId;
  displayName: string;
  /**
   * 相手端末の清算台帳に自動で載っているか。
   * 相互フォロー=true。片方向は承認まで false（グループ計算には含める）。
   */
  ledgerSynced: boolean;
};

export type MockSettlementExpense = {
  id: EntityId;
  payerMemberId: EntityId;
  title: string;
  amount: number;
  /** この支出の割り勘対象メンバー（グループ全員とは限らない） */
  splitMemberIds: EntityId[];
  createdAt: string;
};

export type MockSettlementRoom = {
  id: EntityId;
  title: string;
  members: MockSettlementMember[];
  expenses: MockSettlementExpense[];
  createdAt: string;
};

/** 自分宛: 相手のグループを自分の管理台帳に載せるかの承認依頼（片方向フォロー時） */
export type MockSettlementInvite = {
  id: EntityId;
  roomId: EntityId;
  roomTitle: string;
  fromFriendId: LocalFriendId;
  fromDisplayName: string;
  createdAt: string;
};

export type CreateMockSettlementRoomInput = {
  title: string;
  memberFriendIds: LocalFriendId[];
};

export type CreateMockSettlementExpenseInput = {
  roomId: EntityId;
  payerMemberId: EntityId;
  title: string;
  amount: number;
  splitMemberIds: EntityId[];
};
