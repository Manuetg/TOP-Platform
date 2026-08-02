import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../domain/user.entity';

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['ACTIVE', 'DISABLED'] }) status!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  static fromDomain(user: User): UserResponseDto {
    return { id: user.id, email: user.email, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt };
  }
}
