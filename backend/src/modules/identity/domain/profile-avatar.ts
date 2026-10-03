export const PROFILE_AVATAR_IDS = ['user', 'leaf', 'sun', 'mountain'] as const;

export type ProfileAvatarId = typeof PROFILE_AVATAR_IDS[number];
