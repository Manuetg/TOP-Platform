import { ApiProperty } from '@nestjs/swagger';
export class ResendVerificationResponseDto { @ApiProperty({ example: 'VERIFICATION_EMAIL_SENT_IF_ELIGIBLE' }) status!: 'VERIFICATION_EMAIL_SENT_IF_ELIGIBLE'; }
