import type { AccessTokenIssuer } from '../domain/access-token-issuer';
import { RefreshSession } from '../domain/refresh-session.entity';
import type { RefreshSessionRepository } from '../domain/refresh-session.repository';
import type { RefreshTokenExpiration, RefreshTokenGenerator, RefreshTokenHasher } from '../domain/refresh-token';
import type { UserByIdLookup } from '../domain/user-by-id.lookup';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import { InvalidRefreshTokenError, InvalidRefreshTokenInputError, RefreshTokenUseCase, RefreshUserDisabledError } from './refresh-token.use-case';

const user = (status = UserStatus.ACTIVE): User => User.create({ id: '11111111-1111-4111-8111-111111111111', email: 'user@example.com', status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') });
const session = (changes: Partial<{ revokedAt: Date | null; expiresAt: Date }> = {}): RefreshSession => RefreshSession.create({ id: 'session-id', userId: user().id, tokenHash: 'old-hash', expiresAt: new Date('2027-01-01'), revokedAt: null, replacedBySessionId: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...changes });

describe('RefreshTokenUseCase', () => {
  const findByTokenHash: jest.MockedFunction<RefreshSessionRepository['findByTokenHash']> = jest.fn();
  const rotate: jest.MockedFunction<RefreshSessionRepository['rotate']> = jest.fn();
  const hash: jest.MockedFunction<RefreshTokenHasher['hash']> = jest.fn();
  const generate: jest.MockedFunction<RefreshTokenGenerator['generate']> = jest.fn();
  const expiresAt: jest.MockedFunction<RefreshTokenExpiration['expiresAt']> = jest.fn();
  const issue: jest.MockedFunction<AccessTokenIssuer['issue']> = jest.fn();
  const findById: jest.MockedFunction<UserByIdLookup['findById']> = jest.fn();
  const useCase = new RefreshTokenUseCase(
    { create: jest.fn(), findByTokenHash, revokeByTokenHash: jest.fn(), rotate }, { generate }, { hash }, { expiresAt }, { issue }, { findById },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    hash.mockImplementation((token) => `hash:${token}`);
    generate.mockReturnValue('new-refresh-token');
    expiresAt.mockReturnValue(new Date('2026-02-01'));
    findByTokenHash.mockResolvedValue(session());
    findById.mockResolvedValue(user());
    issue.mockResolvedValue({ token: 'new-access-token', expiresIn: 900 });
    rotate.mockResolvedValue();
  });

  it('rota una sesión válida y devuelve únicamente tokens públicos', async () => {
    await expect(useCase.execute('old-refresh-token')).resolves.toEqual({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token', tokenType: 'Bearer', expiresIn: 900 });
    expect(findByTokenHash).toHaveBeenCalledWith('hash:old-refresh-token');
    expect(issue).toHaveBeenCalledWith({ sub: user().id });
    expect(rotate).toHaveBeenCalledWith('session-id', { userId: user().id, tokenHash: 'hash:new-refresh-token', expiresAt: new Date('2026-02-01') }, expect.any(Date));
  });

  it.each([undefined as never, '', '   '])('rechaza refresh token vacío o ausente', async (token) => {
    await expect(useCase.execute(token)).rejects.toEqual(new InvalidRefreshTokenInputError('El refresh token es obligatorio.'));
    expect(findByTokenHash).not.toHaveBeenCalled();
  });

  it.each([null, session({ expiresAt: new Date('2020-01-01') }), session({ revokedAt: new Date('2026-01-01') })])('usa el mismo error genérico para sesión inexistente, expirada o revocada', async (value) => {
    findByTokenHash.mockResolvedValue(value);
    await expect(useCase.execute('old-refresh-token')).rejects.toEqual(new InvalidRefreshTokenError('La sesión no es válida.'));
    expect(rotate).not.toHaveBeenCalled();
  });

  it('rechaza User inexistente o deshabilitado sin rotar', async () => {
    findById.mockResolvedValueOnce(null);
    await expect(useCase.execute('old-refresh-token')).rejects.toEqual(new InvalidRefreshTokenError('La sesión no es válida.'));
    findById.mockResolvedValueOnce(user(UserStatus.DISABLED));
    await expect(useCase.execute('old-refresh-token')).rejects.toEqual(new RefreshUserDisabledError('El usuario está deshabilitado.'));
    expect(rotate).not.toHaveBeenCalled();
  });

  it('propaga fallos inesperados sin informar una renovación exitosa', async () => {
    rotate.mockRejectedValueOnce(new Error('database failure'));
    await expect(useCase.execute('old-refresh-token')).rejects.toThrow('database failure');
  });
});
