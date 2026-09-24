import { ApiProperty } from '@nestjs/swagger';
export class ForgotPasswordResponseDto { @ApiProperty() message!: string; @ApiProperty() challengeId!: string; }
