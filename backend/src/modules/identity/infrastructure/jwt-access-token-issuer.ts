import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenIssuer, AccessTokenVerifier } from '../domain/access-token-issuer';

const accessTokenExpiresIn = 900;

@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuer, AccessTokenVerifier {
  private readonly secret: string;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET es obligatoria.');
    }
    this.secret = secret;
  }

  async issue(payload: { sub: string }): Promise<{ token: string; expiresIn: number }> {
    return {
      token: await this.jwtService.signAsync(payload, { algorithm: 'HS256', secret: this.secret, expiresIn: accessTokenExpiresIn }),
      expiresIn: accessTokenExpiresIn,
    };
  }

  async verify(token: string): Promise<{ sub: string }> {
    const payload: unknown = await this.jwtService.verifyAsync<Record<string, unknown>>(token, {
      algorithms: ['HS256'],
      secret: this.secret,
    });
    if (!this.isPayload(payload)) throw new Error('El access token no contiene un subject válido.');
    return { sub: payload.sub };
  }

  private isPayload(payload: unknown): payload is { sub: string } {
    return typeof payload === 'object'
      && payload !== null
      && 'sub' in payload
      && typeof payload.sub === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub);
  }
}
