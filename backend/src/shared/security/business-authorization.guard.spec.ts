import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AuthorizationPolicy, Capability } from '../application/authorization-policy';
import { MembershipRole } from '../../modules/identity/domain/membership-role.enum';
import { UserBusinessMembership } from '../../modules/identity/domain/user-business-membership.entity';
import type { AuthenticatedRequest } from './authenticated-principal';
import { BusinessAuthorizationGuard } from './business-authorization.guard';
import { BUSINESS_ACCESS_KEY, PLATFORM_AUTHORITY_REQUIRED_KEY, PUBLIC_ROUTE_KEY } from './security.decorators';

const userId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const membership = (role: MembershipRole): UserBusinessMembership => UserBusinessMembership.create({ id: '33333333-3333-4333-8333-333333333333', userId, businessId, role, createdAt: new Date(), updatedAt: new Date() });

describe('BusinessAuthorizationGuard', () => {
  const request = { params: { businessId }, body: {}, authenticatedPrincipal: { userId }, method: 'POST' } as unknown as AuthenticatedRequest;
  const metadata = jest.fn();
  const findByUserAndBusiness = jest.fn();
  const context = { getHandler: () => jest.fn(), getClass: () => class {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  const guard = new BusinessAuthorizationGuard({ getAllAndOverride: metadata } as unknown as Reflector, { findByUserAndBusiness, findByUserId: jest.fn(), create: jest.fn() }, new AuthorizationPolicy());

  const configure = (requirement?: object, platform = false): void => {
    metadata.mockImplementation((key: string) => {
      if (key === PUBLIC_ROUTE_KEY) return false;
      if (key === PLATFORM_AUTHORITY_REQUIRED_KEY) return platform;
      if (key === BUSINESS_ACCESS_KEY) return requirement;
      return undefined;
    });
  };

  beforeEach(() => {
    jest.resetAllMocks(); request.params = { businessId }; request.body = {}; request.authenticatedPrincipal = { userId };
    configure({ parameter: 'businessId', capabilities: [Capability.BUSINESS_READ] });
    findByUserAndBusiness.mockResolvedValue(membership(MembershipRole.VIEWER));
  });

  it('resuelve la membresía exacta del actor y Business', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findByUserAndBusiness).toHaveBeenCalledWith(userId, businessId);
    findByUserAndBusiness.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN])('autoriza business.update para %s', async (role) => {
    configure({ parameter: 'businessId', capabilities: [Capability.BUSINESS_UPDATE] }); findByUserAndBusiness.mockResolvedValue(membership(role));
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([MembershipRole.RECEPTIONIST, MembershipRole.VIEWER])('rechaza business.update para %s', async (role) => {
    configure({ parameter: 'businessId', capabilities: [Capability.BUSINESS_UPDATE] }); findByUserAndBusiness.mockResolvedValue(membership(role));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });

  it('no hereda OWNER desde otro Business', async () => {
    request.params = { businessId: '44444444-4444-4444-8444-444444444444' };
    configure({ parameter: 'businessId', capabilities: [Capability.RESOURCE_WRITE] }); findByUserAndBusiness.mockResolvedValue(membership(MembershipRole.VIEWER));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    expect(findByUserAndBusiness).toHaveBeenCalledWith(userId, '44444444-4444-4444-8444-444444444444');
  });

  it('exige la capability base y la asignación de rol seleccionada', async () => {
    configure({ parameter: 'businessId', capabilities: [Capability.MEMBERSHIP_CREATE], bodySelector: { field: 'role', capabilities: { OWNER: Capability.MEMBERSHIP_ASSIGN_OWNER, RECEPTIONIST: Capability.MEMBERSHIP_ASSIGN_RECEPTIONIST } } });
    findByUserAndBusiness.mockResolvedValue(membership(MembershipRole.ADMIN)); request.body = { role: 'OWNER' };
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    request.body = { role: 'RECEPTIONIST' }; await expect(guard.canActivate(context)).resolves.toBe(true);
    request.body = { role: 'UNKNOWN' }; await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });

  it('deniega fail-closed una operación de plataforma', async () => {
    configure(undefined, true); await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    expect(findByUserAndBusiness).not.toHaveBeenCalled();
  });

  it('deja que UUID inválido conserve la validación HTTP', async () => {
    request.params = { businessId: 'invalid' }; await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findByUserAndBusiness).not.toHaveBeenCalled();
  });

  it('deniega metadata sin capability y permite rutas solo autenticadas', async () => {
    configure({ parameter: 'businessId', capabilities: [] }); await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    configure(); await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('permite rutas públicas antes de exigir principal autenticado', async () => {
    request.authenticatedPrincipal = undefined;
    metadata.mockImplementation((key: string, targets: unknown[]) => {
      expect(targets).toHaveLength(2);
      return key === PUBLIC_ROUTE_KEY;
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rechaza una ruta protegida sin principal autenticado', async () => {
    request.authenticatedPrincipal = undefined;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
      message: 'No existe un principal autenticado.',
    });
  });

  it('rechaza una membresía ausente sin perder el mensaje contractual', async () => {
    findByUserAndBusiness.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
      message: 'El usuario no pertenece al Business solicitado.',
    });
  });

  it('rechaza selectores de body ausentes o no string', async () => {
    configure({ parameter: 'businessId', capabilities: [Capability.MEMBERSHIP_CREATE], bodySelector: { field: 'role', capabilities: { OWNER: Capability.MEMBERSHIP_ASSIGN_OWNER } } });
    findByUserAndBusiness.mockResolvedValue(membership(MembershipRole.OWNER));
    request.body = undefined;
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
    request.body = { role: 7 };
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });
});
