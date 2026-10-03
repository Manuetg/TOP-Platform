import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../domain/user.entity';
import { UserStatus } from '../../domain/user-status.enum';

export class UserProfileResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
  @ApiProperty({ type: Number, nullable: true }) birthYear!: number | null;
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) avatarId!: string | null;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;

  static fromDomain(user: User): UserProfileResponseDto {
    return { id: user.id, email: user.email, displayName: user.displayName ?? null, birthYear: user.birthYear ?? null, username: user.username ?? null, phone: user.phone ?? null, avatarId: user.avatarId ?? null, status: user.status, updatedAt: user.updatedAt.toISOString() };
  }
}
