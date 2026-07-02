import {
  addEventParticipant,
  getAllProfiles,
  getDefaultProfile,
  getEventParticipants,
  removeEventParticipant,
} from '../db';
import type { Profile } from '../types';

export type EventParticipantDisplay = {
  profileId: string;
  friendId: string;
  name: string;
  photoUri: string | null;
};

export const buildProfileByIdMap = (): Map<string, Profile> => {
  const profiles = getAllProfiles();
  return new Map(profiles.map((profile) => [profile.id, profile]));
};

export const friendIdsToProfileIds = (friendIds: Iterable<string>): string[] => {
  const profileIds: string[] = [];
  for (const friendId of friendIds) {
    const profile = getDefaultProfile(friendId);
    if (profile?.id) {
      profileIds.push(profile.id);
    }
  }
  return profileIds;
};

export const profileIdsToFriendIds = (profileIds: Iterable<string>): string[] => {
  const profileById = buildProfileByIdMap();
  const friendIds: string[] = [];
  for (const profileId of profileIds) {
    const profile = profileById.get(profileId);
    if (profile?.friendId) {
      friendIds.push(profile.friendId);
    }
  }
  return friendIds;
};

export const toEventParticipantDisplays = (profileIds: string[]): EventParticipantDisplay[] => {
  const profileById = buildProfileByIdMap();
  return profileIds
    .map((profileId) => {
      const profile = profileById.get(profileId);
      if (!profile) {
        return null;
      }
      return {
        profileId: profile.id,
        friendId: profile.friendId,
        name: profile.name,
        photoUri: profile.photoUri,
      };
    })
    .filter((item): item is EventParticipantDisplay => item !== null);
};

export const syncEventParticipants = (eventId: string, nextProfileIds: string[]): void => {
  const existingProfileIds = getEventParticipants(eventId).map((participant) => participant.profileId);
  const nextUniqueProfileIds = Array.from(new Set(nextProfileIds.filter((profileId) => profileId.trim().length > 0)));

  const toAdd = nextUniqueProfileIds.filter((profileId) => !existingProfileIds.includes(profileId));
  const toRemove = existingProfileIds.filter((profileId) => !nextUniqueProfileIds.includes(profileId));

  toAdd.forEach((profileId) => {
    addEventParticipant(eventId, profileId);
  });
  toRemove.forEach((profileId) => {
    removeEventParticipant(eventId, profileId);
  });
};
