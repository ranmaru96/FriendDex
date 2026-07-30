import type { LocalFriendId, UserId } from './sync';

/** Phase 2: サーバ上の最小アカウント（QR publicFields の延長） */
export type IdentityUser = {
  id: UserId;
  displayName: string;
  /** QR と同様、公開してよいフィールドキーのみ */
  publicFields: string[];
  createdAt: string;
  updatedAt: string;
};

/** 端末ローカル Friend とサーバ User の紐付け（端末保持） */
export type LocalFriendLink = {
  localFriendId: LocalFriendId;
  linkedUserId: UserId | null;
  linkedAt: string | null;
};

/** 認証セッション（Phase 1 ではスタブ） */
export type AuthSession = {
  userId: UserId;
  accessToken: string;
  expiresAt: string;
};
