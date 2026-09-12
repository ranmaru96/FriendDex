/**
 * 診断用（段階ボタン）
 * 起動時は SQLite を開かない。画面のボタンで空DB → 既存DB → 読み取りを踏む。
 */
export const DIAGNOSTIC_SKIP_SQLITE_OPEN = true;
export const DIAGNOSTIC_SKIP_DATABASE_INIT = true;
export const DIAGNOSTIC_SKIP_FILESYSTEM = true;
export const DIAGNOSTIC_LAUNCH_PANEL = true;

export const DIAGNOSTIC_EMPTY_DB_NAME = 'frienddex-diag.db';
