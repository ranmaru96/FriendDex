export const PHOTO_LIMITS = {
  free: 5,
  paid: 10,
} as const;

export type SubscriptionTier = keyof typeof PHOTO_LIMITS;
