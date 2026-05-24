export const PHOTO_LIMITS = {
  free: 2,
  paid: 10,
} as const;

export type SubscriptionTier = keyof typeof PHOTO_LIMITS;
