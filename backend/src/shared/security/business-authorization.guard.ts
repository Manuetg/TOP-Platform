import { CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from '../../modules/identity/domain/membership.repository';
import { AuthorizationPolicy, type Capability } from '../application/authorization-policy';
import type { AuthenticatedRequest } from './authenticated-principal';
import { BUSINESS_ACCESS_KEY, type BusinessAccessRequirement, PLATFORM_AUTHORITY_REQUIRED_KEY, PUBLIC_ROUTE_KEY } from './security.decorators';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class BusinessAuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly memberships: MembershipRepository,
    private readonly policy: AuthorizationPolicy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.authenticatedPrincipal?.userId;
    if (!userId) throw new ForbiddenException('No existe un principal autenticado.');

    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_AUTHORITY_REQUIRED_KEY, [context.getHandler(), context.getClass()])) {
      throw new ForbiddenException('Esta operación requiere una autoridad de plataforma no disponible en el MVP.');
    }

    const business = this.reflector.getAllAndOverride<BusinessAccessRequirement>(BUSINESS_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    const requestedBusinessId = business ? request.params[business.parameter] : undefined;
    if (business) return this.authorizeBusiness(
      userId,
      typeof requestedBusinessId === 'string' ? requestedBusinessId : undefined,
      business,
      request,
    );
    return true;
  }

  private async authorizeBusiness(userId: string, businessId: string | undefined, requirement: BusinessAccessRequirement, request: AuthenticatedRequest): Promise<boolean> {
    if (typeof businessId !== 'string' || !uuidPattern.test(businessId)) return true;
    const membership = await this.memberships.findByUserAndBusiness(userId, businessId);
    if (!membership) throw new ForbiddenException('El usuario no pertenece al Business solicitado.');
    const capabilities = this.resolveCapabilities(requirement, request);
    if (capabilities.length === 0 || capabilities.some((capability) => !this.policy.isAllowed(membership.role, capability))) {
      throw new ForbiddenException('El rol del usuario no autoriza esta operación.');
    }
    return true;
  }

  private resolveCapabilities(requirement: BusinessAccessRequirement, request: AuthenticatedRequest): readonly Capability[] {
    if (!requirement.bodySelector) return requirement.capabilities;
    const body = request.body as Record<string, unknown> | undefined;
    const selected = body?.[requirement.bodySelector.field];
    const capability = typeof selected === 'string' ? requirement.bodySelector.capabilities[selected] : undefined;
    return capability ? [...requirement.capabilities, capability] : [];
  }
}
