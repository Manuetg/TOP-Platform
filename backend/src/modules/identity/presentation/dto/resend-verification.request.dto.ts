import { ApiProperty } from '@nestjs/swagger';
export class ResendVerificationRequestDto { @ApiProperty({ example: 'user@example.com' }) email!: string; }
