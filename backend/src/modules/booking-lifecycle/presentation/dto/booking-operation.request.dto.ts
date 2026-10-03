import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class BookingOperationRequestDto {
  @ApiProperty({ format: 'date-time', example: '2026-10-02T12:00:00.000Z', description: 'updatedAt exacto obtenido al consultar la reserva.' })
  @IsString()
  expectedUpdatedAt!: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 500, description: 'Motivo opcional de la acción manual.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
