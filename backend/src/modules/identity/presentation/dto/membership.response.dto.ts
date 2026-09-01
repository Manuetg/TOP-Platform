import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '../../domain/membership-role.enum';
import { UserBusinessMembership } from '../../domain/user-business-membership.entity';

export class MembershipResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'uuid', example: '11111111-1111-4111-8111-111111111111' }) userId!: string;
  @ApiProperty({ format: 'uuid', example: '22222222-2222-4222-8222-222222222222' }) businessId!: string;
  @ApiProperty({ enum: MembershipRole, example: MembershipRole.OWNER }) role!: MembershipRole;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromDomain(membership: UserBusinessMembership): MembershipResponseDto {
    return { id: membership.id, userId: membership.userId, businessId: membership.businessId, role: membership.role, createdAt: membership.createdAt, updatedAt: membership.updatedAt };
  }
}
