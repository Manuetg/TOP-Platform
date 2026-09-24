import { ApiProperty } from '@nestjs/swagger';
export class VerifyEmailResponseDto { @ApiProperty({ example: 'EMAIL_VERIFIED' }) status!: string; }
