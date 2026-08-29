import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CancelBookingRequestDto {
  @ApiPropertyOptional({ example: 'Cambio de planes del huésped.', minLength: 2, maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(2, 500)
  reason?: string;
}
