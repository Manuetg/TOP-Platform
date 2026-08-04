import { ApiProperty } from '@nestjs/swagger';
import type { RefreshTokenResponse } from '../../application/refresh-token.use-case';

export class RefreshTokenResponseDto implements RefreshTokenResponse {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: 'Bearer';
  @ApiProperty({ example: 900 }) expiresIn!: number;
}
