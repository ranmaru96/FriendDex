import type { QrScanPayload } from '@/utils/qrScanHelpers';

let pending: QrScanPayload | null = null;

export function setPendingQrImportPayload(payload: QrScanPayload): void {
  pending = payload;
}

export function getPendingQrImportPayload(): QrScanPayload | null {
  return pending;
}

export function clearPendingQrImportPayload(): void {
  pending = null;
}
