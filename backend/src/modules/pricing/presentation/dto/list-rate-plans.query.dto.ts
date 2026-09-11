import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListRatePlansQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Resource para el modo de selección de Booking.' })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({ example: '2026-09-20', description: 'Check-in inclusivo del modo de selección.' })
  @IsOptional()
  @IsString()
  checkIn?: string;

  @ApiPropertyOptional({ example: '2026-09-23', description: 'Check-out exclusivo del modo de selección.' })
  @IsOptional()
  @IsString()
  checkOut?: string;
}
