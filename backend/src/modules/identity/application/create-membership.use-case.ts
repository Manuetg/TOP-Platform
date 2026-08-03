import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_LOOKUP, MEMBERSHIP_REPOSITORY, type BusinessLookup, type MembershipRepository, USER_LOOKUP, type UserLookup } from '../domain/membership.repository';
import { MembershipRole } from '../domain/membership-role.enum';
import { UserBusinessMembership } from '../domain/user-business-membership.entity';
export class InvalidMembershipInputError extends Error {}
export class MembershipNotFoundError extends Error {}
export class MembershipAlreadyExistsError extends Error {}
@Injectable()
export class CreateMembershipUseCase {
  constructor(@Inject(MEMBERSHIP_REPOSITORY) private readonly repository: MembershipRepository, @Inject(USER_LOOKUP) private readonly users: UserLookup, @Inject(BUSINESS_LOOKUP) private readonly businesses: BusinessLookup) {}
  async execute(input: { userId: string; businessId: string; role: MembershipRole }): Promise<UserBusinessMembership> {
    this.validateUuid(input.userId, 'El identificador de usuario no es válido.'); this.validateUuid(input.businessId, 'El identificador de negocio no es válido.');
    if (!Object.values(MembershipRole).includes(input.role)) throw new InvalidMembershipInputError('El rol de membresía no es válido.');
    if (!await this.users.exists(input.userId)) throw new MembershipNotFoundError('El usuario no existe.');
    if (!await this.businesses.exists(input.businessId)) throw new MembershipNotFoundError('El negocio no existe.');
    if (await this.repository.findByUserAndBusiness(input.userId, input.businessId)) throw new MembershipAlreadyExistsError('La membresía ya existe.');
    return this.repository.create(input);
  }
  private validateUuid(value: string, message: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InvalidMembershipInputError(message); }
}
