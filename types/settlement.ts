import type { EntityId, LocalFriendId, UserId } from './sync';

/** 精算ルーム（Walica の「ルーム」相当・Phase 1 サーバ対象） */
export type SettlementRoom = {
  id: EntityId;
  title: string;
  /** ルーム作成者の userId（未ログイン時は null） */
  createdByUserId: UserId | null;
  /** 招待コード（サーバ発行） */
  inviteCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementMemberRole = 'owner' | 'member';

/** ルーム参加者。サーバ上は displayName のみ必須、friend 紐付けは端末ローカル */
export type SettlementRoomMember = {
  id: EntityId;
  roomId: EntityId;
  userId: UserId | null;
  displayName: string;
  /** 各端末が自分で保持する FriendDex friendId（サーバに載せない運用も可） */
  localFriendId: LocalFriendId | null;
  role: SettlementMemberRole;
  joinedAt: string;
};

export type SettlementSplitRule =
  | { type: 'even'; memberIds: EntityId[] }
  | { type: 'custom'; shares: { memberId: EntityId; amount: number }[] }
  | { type: 'ratio'; shares: { memberId: EntityId; weight: number }[] };

/** 1 件の支出（誰がいくら立替えたか） */
export type SettlementExpense = {
  id: EntityId;
  roomId: EntityId;
  /** 立替者（SettlementRoomMember.id） */
  payerMemberId: EntityId;
  title: string;
  amount: number;
  splitRule: SettlementSplitRule;
  memo: string;
  /** 完済・精算済みマーク（ルーム内のこの支出に対する個別フラグ） */
  isSettled: boolean;
  createdAt: string;
  updatedAt: string;
};

/** メンバー間のネット残高（計算結果・永続化任意） */
export type SettlementMemberBalance = {
  memberId: EntityId;
  displayName: string;
  /** 正 = 回収できる、負 = 支払うべき */
  netBalance: number;
};

/** 精算案：A が B に amount 円払う */
export type SettlementTransfer = {
  fromMemberId: EntityId;
  toMemberId: EntityId;
  amount: number;
};

export type SettlementRoomSummary = {
  room: SettlementRoom;
  members: SettlementRoomMember[];
  expenseCount: number;
  totalExpenseAmount: number;
  unsettledExpenseCount: number;
};

/** ルーム作成入力 */
export type CreateSettlementRoomInput = {
  title: string;
  /** 作成者を最初のメンバーとして含める */
  ownerDisplayName: string;
  ownerLocalFriendId?: LocalFriendId | null;
};

/** 支出登録入力 */
export type CreateSettlementExpenseInput = {
  roomId: EntityId;
  payerMemberId: EntityId;
  title: string;
  amount: number;
  splitRule: SettlementSplitRule;
  memo?: string;
};

/** メンバー追加入力（招待参加） */
export type JoinSettlementRoomInput = {
  inviteCode: string;
  displayName: string;
  localFriendId?: LocalFriendId | null;
};
