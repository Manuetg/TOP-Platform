import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer';

function createConfigService(secret: string | undefined): ConfigService {
  const configService = new ConfigService();
  jest.spyOn(configService, 'get').mockImplementation((key: string) => (
    key === 'JWT_ACCESS_SECRET' ? secret : undefined
  ));
  return configService;
}

describe('JwtAccessTokenIssuer', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  it('emite un JWT con sub y expiración de 900 segundos', async () => {
    const secret = 'secret-for-test-only';
    const issuer = new JwtAccessTokenIssuer(
      new JwtService(),
      createConfigService(secret),
    );
    const result = await issuer.issue({ sub: userId });
    const payload = await new JwtService().verifyAsync<{ sub: string; iat: number; exp: number }>(result.token, { secret });

    expect(result.expiresIn).toBe(900);
    expect(payload.sub).toBe(userId);
    expect(payload.exp - payload.iat).toBe(900);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('businessId');
    expect(payload).not.toHaveProperty('role');
  });

  it('requiere un secret configurado', () => {
    expect(() => new JwtAccessTokenIssuer(
      new JwtService(),
      createConfigService(undefined),
    )).toThrow('JWT_ACCESS_SECRET es obligatoria.');
  });

  it('verifica firma, algoritmo, expiración y subject UUID', async () => {
    const secret = 'secret-for-test-only';
    const jwt = new JwtService();
    const service = new JwtAccessTokenIssuer(jwt, createConfigService(secret));
    const valid = await jwt.signAsync({ sub: userId }, { secret, algorithm: 'HS256', expiresIn: 900 });
    await expect(service.verify(valid)).resolves.toEqual({ sub: userId });

    const wrongSignature = await jwt.signAsync({ sub: userId }, { secret: 'another-secret', algorithm: 'HS256', expiresIn: 900 });
    await expect(service.verify(wrongSignature)).rejects.toBeDefined();
    const wrongAlgorithm = await jwt.signAsync({ sub: userId }, { secret, algorithm: 'HS384', expiresIn: 900 });
    await expect(service.verify(wrongAlgorithm)).rejects.toBeDefined();
    const expired = await jwt.signAsync({ sub: userId }, { secret, algorithm: 'HS256', expiresIn: -1 });
    await expect(service.verify(expired)).rejects.toBeDefined();
    const missingSubject = await jwt.signAsync({}, { secret, algorithm: 'HS256', expiresIn: 900 });
    await expect(service.verify(missingSubject)).rejects.toThrow('subject válido');
    const invalidSubject = await jwt.signAsync({ sub: 'not-a-uuid' }, { secret, algorithm: 'HS256', expiresIn: 900 });
    await expect(service.verify(invalidSubject)).rejects.toThrow('subject válido');
  });
});
