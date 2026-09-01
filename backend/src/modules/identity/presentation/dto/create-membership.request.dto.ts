import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { MembershipRole } from '../../domain/membership-role.enum';

export class CreateMembershipRequestDto {
  @ApiProperty({ format: 'uuid', example: '11111111-1111-4111-8111-111111111111' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.OWNER })
  @IsEnum(MembershipRole)
  role!: MembershipRole;
}
