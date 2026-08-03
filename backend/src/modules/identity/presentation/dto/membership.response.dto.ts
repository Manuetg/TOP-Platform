import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '../../domain/membership-role.enum';
import { UserBusinessMembership } from '../../domain/user-business-membership.entity';

export class MembershipResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() businessId!: string;
  @ApiProperty({ enum: MembershipRole }) role!: MembershipRole;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromDomain(membership: UserBusinessMembership): MembershipResponseDto {
    return { id: membership.id, userId: membership.userId, businessId: membership.businessId, role: membership.role, createdAt: membership.createdAt, updatedAt: membership.updatedAt };
  }
}
