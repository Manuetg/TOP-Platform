import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole } from '../../domain/membership-role.enum';
import type { LoginResponse } from '../../application/login.use-case';
import { UserStatus } from '../../domain/user-status.enum';

class LoginUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
}

class LoginMembershipResponseDto {
  @ApiProperty() businessId!: string;
  @ApiProperty({ enum: MembershipRole }) role!: MembershipRole;
}

export class LoginResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: 'Token opaco rotatorio para renovar la sesión.' }) refreshToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: 'Bearer';
  @ApiProperty({ example: 900 }) expiresIn!: number;
  @ApiProperty({ type: LoginUserResponseDto }) user!: LoginUserResponseDto;
  @ApiProperty({ type: [LoginMembershipResponseDto] }) memberships!: LoginMembershipResponseDto[];

  static fromApplication(response: LoginResponse): LoginResponseDto {
    return response;
  }
}
