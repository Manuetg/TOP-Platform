import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer';

describe('JwtAccessTokenIssuer', () => {
  it('emite un JWT con sub y expiración de 900 segundos', async () => {
    const secret = 'secret-for-test-only';
    const issuer = new JwtAccessTokenIssuer(new JwtService(), new ConfigService({ JWT_ACCESS_SECRET: secret }));
    const result = await issuer.issue({ sub: 'user-id' });
    const payload = await new JwtService().verifyAsync<{ sub: string; iat: number; exp: number }>(result.token, { secret });

    expect(result.expiresIn).toBe(900);
    expect(payload.sub).toBe('user-id');
    expect(payload.exp - payload.iat).toBe(900);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('businessId');
    expect(payload).not.toHaveProperty('role');
  });

  it('requiere un secret configurado', () => {
    expect(() => new JwtAccessTokenIssuer(new JwtService(), new ConfigService())).toThrow('JWT_ACCESS_SECRET es obligatoria.');
  });
});
