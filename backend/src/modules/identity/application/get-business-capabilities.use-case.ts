import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from '../domain/membership.repository';
import { AuthorizationPolicy, Capability } from '../../../shared/application/authorization-policy';

@Injectable()
export class GetBusinessCapabilitiesUseCase {
  constructor(@Inject(MEMBERSHIP_REPOSITORY) private readonly memberships: MembershipRepository, private readonly policy: AuthorizationPolicy) {}
  async execute(userId: string, businessId: string): Promise<Capability[]> {
    const membership = await this.memberships.findByUserAndBusiness(userId, businessId);
    if (!membership) throw new ForbiddenException('No tienes acceso a este negocio.');
    return Object.values(Capability).filter((capability) => this.policy.isAllowed(membership.role, capability));
  }
}
