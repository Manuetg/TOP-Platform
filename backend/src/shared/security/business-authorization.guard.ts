import { CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from '../../modules/identity/domain/membership.repository';
import { MembershipRole } from '../../modules/identity/domain/membership-role.enum';
import type { AuthenticatedRequest } from './authenticated-principal';
import { ANY_BUSINESS_ROLES_KEY, BUSINESS_ACCESS_KEY, type BusinessAccessRequirement, PUBLIC_ROUTE_KEY } from './security.decorators';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readOnlyMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class BusinessAuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly memberships: MembershipRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.authenticatedPrincipal?.userId;
    if (!userId) throw new ForbiddenException('No existe un principal autenticado.');

    const business = this.reflector.getAllAndOverride<BusinessAccessRequirement>(BUSINESS_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    const requestedBusinessId = business ? request.params[business.parameter] : undefined;
    if (business) return this.authorizeBusiness(
      userId,
      typeof requestedBusinessId === 'string' ? requestedBusinessId : undefined,
      business.roles,
      request.method,
    );

    const roles = this.reflector.getAllAndOverride<readonly string[]>(ANY_BUSINESS_ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles) {
      const available = await this.memberships.findByUserId(userId);
      if (!available.some((membership) => roles.includes(membership.role))) throw new ForbiddenException('El usuario no posee un rol administrativo autorizado.');
    }
    return true;
  }

  private async authorizeBusiness(userId: string, businessId: string | undefined, roles: readonly string[], method: string): Promise<boolean> {
    if (typeof businessId !== 'string' || !uuidPattern.test(businessId)) return true;
    const membership = await this.memberships.findByUserAndBusiness(userId, businessId);
    if (!membership) throw new ForbiddenException('El usuario no pertenece al Business solicitado.');
    if (roles.length > 0 && !roles.includes(membership.role)) throw new ForbiddenException('El rol del usuario no autoriza esta operación.');
    if (roles.length === 0 && membership.role === MembershipRole.VIEWER && !readOnlyMethods.has(method.toUpperCase())) {
      throw new ForbiddenException('El rol VIEWER solo autoriza operaciones de lectura.');
    }
    return true;
  }
}
