/** 将来サーバ同期するエンティティ共通のメタデータ（Phase 0） */
export type SyncMetadata = {
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
  /** 論理削除。null なら有効 */
  deletedAt: string | null;
  /** サーバ側の楽観的ロック用（未同期時は 0） */
  syncVersion: number;
};

export type WithSyncMetadata<T> = T & SyncMetadata;

/** クライアント生成 ID（UUID）。サーバ採番前もこの形式を維持 */
export type EntityId = string;

/** サーバー採番ユーザー ID（Phase 2 以降） */
export type UserId = string;

/** 端末ローカルの Friend.id。サーバ非保持 or 端末のみの紐付け用 */
export type LocalFriendId = string;

export type SyncEntityKind = 'settlement_room' | 'settlement_expense' | 'identity_profile';

export type SyncCursor = {
  kind: SyncEntityKind;
  /** 最後に同期した updatedAt または syncVersion */
  watermark: string;
};

export type RepositoryErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'NOT_IMPLEMENTED'
  | 'LOCAL_DB';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}
