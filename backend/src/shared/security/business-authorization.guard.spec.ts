import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { MembershipRole } from '../../modules/identity/domain/membership-role.enum';
import { UserBusinessMembership } from '../../modules/identity/domain/user-business-membership.entity';
import type { AuthenticatedRequest } from './authenticated-principal';
import { BusinessAuthorizationGuard } from './business-authorization.guard';

const userId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const item = (role: MembershipRole): UserBusinessMembership => UserBusinessMembership.create({ id: '33333333-3333-4333-8333-333333333333', userId, businessId, role, createdAt: new Date(), updatedAt: new Date() });

describe('BusinessAuthorizationGuard', () => {
  const request = { params: { businessId }, authenticatedPrincipal: { userId }, method: 'GET' } as unknown as AuthenticatedRequest;
  const metadata = jest.fn();
  const findByUserAndBusiness = jest.fn();
  const findByUserId = jest.fn();
  const context = { getHandler: () => jest.fn(), getClass: () => class {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  const guard = new BusinessAuthorizationGuard({ getAllAndOverride: metadata } as unknown as Reflector, { findByUserAndBusiness, findByUserId, create: jest.fn() });

  beforeEach(() => { jest.resetAllMocks(); request.params = { businessId }; request.authenticatedPrincipal = { userId }; request.method = 'GET'; metadata.mockReturnValueOnce(false).mockReturnValueOnce({ parameter: 'businessId', roles: [] }); findByUserAndBusiness.mockResolvedValue(item(MembershipRole.VIEWER)); });

  it('autoriza una membresía existente y rechaza acceso cruzado', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findByUserAndBusiness).toHaveBeenCalledWith(userId, businessId);
    jest.resetAllMocks(); metadata.mockReturnValueOnce(false).mockReturnValueOnce({ parameter: 'businessId', roles: [] }); findByUserAndBusiness.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN])('autoriza %s cuando la capability admite OWNER/ADMIN', async (role) => {
    metadata.mockReset().mockReturnValueOnce(false).mockReturnValueOnce({ parameter: 'businessId', roles: ['OWNER', 'ADMIN'] });
    findByUserAndBusiness.mockResolvedValue(item(role));
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([MembershipRole.RECEPTIONIST, MembershipRole.VIEWER])('rechaza %s cuando la capability exige OWNER/ADMIN', async (role) => {
    metadata.mockReset().mockReturnValueOnce(false).mockReturnValueOnce({ parameter: 'businessId', roles: ['OWNER', 'ADMIN'] });
    findByUserAndBusiness.mockResolvedValue(item(role));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });

  it('permite lectura a VIEWER y rechaza mutaciones sin inventar permisos para RECEPTIONIST', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    request.method = 'PATCH';
    metadata.mockReset().mockReturnValueOnce(false).mockReturnValueOnce({ parameter: 'businessId', roles: [] });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    findByUserAndBusiness.mockResolvedValue(item(MembershipRole.RECEPTIONIST));
    metadata.mockReset().mockReturnValueOnce(false).mockReturnValueOnce({ parameter: 'businessId', roles: [] });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('no hereda un rol elevado desde otro Business', async () => {
    request.params = { businessId: '44444444-4444-4444-8444-444444444444' };
    request.method = 'PATCH';
    metadata.mockReset().mockReturnValueOnce(false).mockReturnValueOnce({ parameter: 'businessId', roles: ['OWNER', 'ADMIN'] });
    findByUserAndBusiness.mockResolvedValue(item(MembershipRole.VIEWER));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    expect(findByUserAndBusiness).toHaveBeenCalledWith(userId, '44444444-4444-4444-8444-444444444444');
  });

  it('deja que UUID inválido conserve la validación HTTP del controller', async () => {
    request.params = { businessId: 'invalid' };
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findByUserAndBusiness).not.toHaveBeenCalled();
  });

  it('aplica roles administrativos globales', async () => {
    metadata.mockReset().mockReturnValueOnce(false).mockReturnValueOnce(undefined).mockReturnValueOnce(['OWNER', 'ADMIN']);
    findByUserId.mockResolvedValue([item(MembershipRole.ADMIN)]);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    metadata.mockReset().mockReturnValueOnce(false).mockReturnValueOnce(undefined).mockReturnValueOnce(['OWNER', 'ADMIN']);
    findByUserId.mockResolvedValue([item(MembershipRole.VIEWER)]);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });
});
