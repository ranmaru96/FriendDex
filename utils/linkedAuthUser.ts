import { getDefaultProfile } from '@/db';

const AUTH_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asAuthUserId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return AUTH_USER_ID_RE.test(trimmed) ? trimmed : null;
}

export function getFriendLinkedAuthUserId(friendId: string): string | null {
  const profile = getDefaultProfile(friendId.trim());
  return asAuthUserId(profile?.scannedUserId);
}
