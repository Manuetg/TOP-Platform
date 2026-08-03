import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenIssuer } from '../domain/access-token-issuer';

const accessTokenExpiresIn = 900;

@Injectable()
export class JwtAccessTokenIssuer implements AccessTokenIssuer {
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
      token: await this.jwtService.signAsync(payload, { secret: this.secret, expiresIn: accessTokenExpiresIn }),
      expiresIn: accessTokenExpiresIn,
    };
  }
}
