/**
 * 診断用フラグ（ビルド24）
 * - 本物の DB を開いて読む
 * - スキーマ初期化と写真 FileSystem はまだ止める
 */
export const DIAGNOSTIC_SKIP_SQLITE_OPEN = false;
export const DIAGNOSTIC_SKIP_DATABASE_INIT = true;
export const DIAGNOSTIC_SKIP_FILESYSTEM = true;
