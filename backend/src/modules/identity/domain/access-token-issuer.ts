export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');

export interface AccessTokenIssuer {
  issue(payload: { sub: string }): Promise<{ token: string; expiresIn: number }>;
}
