import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { User } from '../../modules/identity/domain/user.entity';
import { UserStatus } from '../../modules/identity/domain/user-status.enum';
import { AuthenticationGuard } from './authentication.guard';
import type { AuthenticatedRequest } from './authenticated-principal';

const userId = '11111111-1111-4111-8111-111111111111';

describe('AuthenticationGuard', () => {
  const request = { headers: {} } as AuthenticatedRequest;
  const metadata = jest.fn();
  const verify = jest.fn();
  const findById = jest.fn();
  const context = { getHandler: () => jest.fn(), getClass: () => class {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  const guard = new AuthenticationGuard({ getAllAndOverride: metadata } as unknown as Reflector, { verify }, { findById });

  beforeEach(() => {
    jest.resetAllMocks();
    request.headers = {};
    request.authenticatedPrincipal = undefined;
    metadata.mockReturnValue(false);
    verify.mockResolvedValue({ sub: userId });
    findById.mockResolvedValue(User.create({ id: userId, email: 'user@example.com', status: UserStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() }));
  });

  it('omite rutas públicas', async () => {
    metadata.mockReturnValue(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Basic token', 'Bearer', 'Bearer ', 'Bearer token extra'])('rechaza header inválido: %s', async (authorization) => {
    if (authorization !== undefined) request.headers.authorization = authorization;
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
  });

  it('verifica el token, exige User ACTIVE y establece principal', async () => {
    request.headers.authorization = 'Bearer access-token';
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('access-token');
    expect(findById).toHaveBeenCalledWith(userId);
    expect(request.authenticatedPrincipal).toEqual({ userId });
  });

  it('normaliza errores de token, User inexistente y User deshabilitado a 401', async () => {
    request.headers.authorization = 'Bearer access-token';
    verify.mockRejectedValueOnce(new Error('firma'));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    verify.mockResolvedValue({ sub: userId });
    findById.mockResolvedValueOnce(null).mockResolvedValueOnce(User.create({ id: userId, email: 'user@example.com', status: UserStatus.DISABLED, createdAt: new Date(), updatedAt: new Date() }));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
  });
});
