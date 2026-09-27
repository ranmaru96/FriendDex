import type { Friend } from '@/types';

export type FriendPhotoSource = 'local' | 'identity';

export function resolveFriendDisplayPhotoUri(
  friend: Pick<Friend, 'photoUri' | 'identityPhotoUri' | 'photoSource'>
): string | null {
  const localUri = friend.photoUri?.trim() || null;
  const identityUri = friend.identityPhotoUri?.trim() || null;
  if (friend.photoSource === 'identity' && identityUri) {
    return identityUri;
  }
  return localUri ?? identityUri;
}

export function friendHasBothPhotos(
  friend: Pick<Friend, 'photoUri' | 'identityPhotoUri'>
): boolean {
  return Boolean(friend.photoUri?.trim()) && Boolean(friend.identityPhotoUri?.trim());
}

export function buildFriendPhotoById(friends: Friend[]): Map<string, string | null> {
  return new Map(friends.map((friend) => [friend.id, resolveFriendDisplayPhotoUri(friend)]));
}
