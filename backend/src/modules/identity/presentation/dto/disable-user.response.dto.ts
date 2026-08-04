import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../domain/user.entity';

export class DisableUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['DISABLED'] }) status!: 'DISABLED';

  static fromDomain(user: User): DisableUserResponseDto {
    return { id: user.id, status: 'DISABLED' };
  }
}
