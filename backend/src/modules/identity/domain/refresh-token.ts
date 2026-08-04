export const REFRESH_TOKEN_GENERATOR = Symbol('REFRESH_TOKEN_GENERATOR');
export const REFRESH_TOKEN_HASHER = Symbol('REFRESH_TOKEN_HASHER');
export const REFRESH_TOKEN_EXPIRATION = Symbol('REFRESH_TOKEN_EXPIRATION');

export interface RefreshTokenGenerator { generate(): string; }
export interface RefreshTokenHasher { hash(token: string): string; }
export interface RefreshTokenExpiration { expiresAt(now: Date): Date; }
