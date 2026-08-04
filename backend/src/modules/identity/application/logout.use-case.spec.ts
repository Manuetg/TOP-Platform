import type { RefreshSessionRepository } from '../domain/refresh-session.repository';
import type { RefreshTokenHasher } from '../domain/refresh-token';
import { InvalidLogoutInputError, LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  const hash: jest.MockedFunction<RefreshTokenHasher['hash']> = jest.fn();
  const revokeByTokenHash: jest.MockedFunction<RefreshSessionRepository['revokeByTokenHash']> = jest.fn();
  const useCase = new LogoutUseCase({ hash }, { create: jest.fn(), findByTokenHash: jest.fn(), revokeByTokenHash, rotate: jest.fn() });

  beforeEach(() => { jest.resetAllMocks(); hash.mockImplementation((token) => `hash:${token}`); revokeByTokenHash.mockResolvedValue(); });

  it('hashea y revoca de forma idempotente sin devolver datos', async () => {
    await expect(useCase.execute('refresh-token')).resolves.toBeUndefined();
    expect(hash).toHaveBeenCalledWith('refresh-token');
    expect(revokeByTokenHash).toHaveBeenCalledWith('hash:refresh-token', expect.any(Date));
  });

  it.each([undefined as never, '', '   ', 1 as never])('rechaza una entrada inválida sin consultar el repositorio', async (token) => {
    await expect(useCase.execute(token)).rejects.toEqual(new InvalidLogoutInputError('El refresh token es obligatorio.'));
    expect(hash).not.toHaveBeenCalled();
    expect(revokeByTokenHash).not.toHaveBeenCalled();
  });

  it('propaga fallos inesperados del hasher y del repositorio', async () => {
    hash.mockImplementationOnce(() => { throw new Error('hash failure'); });
    await expect(useCase.execute('refresh-token')).rejects.toThrow('hash failure');
    revokeByTokenHash.mockRejectedValueOnce(new Error('repository failure'));
    await expect(useCase.execute('refresh-token')).rejects.toThrow('repository failure');
  });
});
