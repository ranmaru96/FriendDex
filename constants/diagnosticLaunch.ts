/**
 * 診断用（段階ボタン）
 * 起動時は SQLite を開かない。画面のボタンで段階を踏む。
 */
export const DIAGNOSTIC_SKIP_SQLITE_OPEN = true;
export const DIAGNOSTIC_SKIP_DATABASE_INIT = true;
export const DIAGNOSTIC_SKIP_FILESYSTEM = true;
export const DIAGNOSTIC_LAUNCH_PANEL = true;

export const DIAGNOSTIC_EMPTY_DB_NAME = 'frienddex-diag.db';
export const DIAGNOSTIC_DELAY_MS = 2000;

let skipDatabaseInit = DIAGNOSTIC_SKIP_DATABASE_INIT;
let skipFilesystem = DIAGNOSTIC_SKIP_FILESYSTEM;

export const isDiagnosticDatabaseInitSkipped = (): boolean => skipDatabaseInit;
export const isDiagnosticFilesystemSkipped = (): boolean => skipFilesystem;

export const diagnosticAllowDatabaseInit = (): void => {
  skipDatabaseInit = false;
};

export const diagnosticAllowFilesystem = (): void => {
  skipFilesystem = false;
};
