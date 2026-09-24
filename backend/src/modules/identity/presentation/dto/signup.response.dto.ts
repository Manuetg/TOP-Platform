import { ApiProperty } from '@nestjs/swagger';
export class SignupResponseDto { @ApiProperty({ example: 'EMAIL_VERIFICATION_REQUIRED' }) status!: string; @ApiProperty() email!: string; }
