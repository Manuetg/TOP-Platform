export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

export interface AccessTokenIssuer {
  issue(payload: { sub: string }): Promise<{ token: string; expiresIn: number }>;
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<{ sub: string }>;
}
