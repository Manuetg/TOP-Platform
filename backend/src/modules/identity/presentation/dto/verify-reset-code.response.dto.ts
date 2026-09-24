import { ApiProperty } from '@nestjs/swagger';
export class VerifyResetCodeResponseDto { @ApiProperty() resetGrant!: string; }
