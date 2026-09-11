import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DashboardQueryDto {
  @ApiProperty({
    example: '2026-09-01',
    format: 'date',
    description: 'Inicio inclusivo del período local del Business.',
  })
  @IsString()
  from!: string;

  @ApiProperty({
    example: '2026-09-30',
    format: 'date',
    description: 'Fin exclusivo del período local del Business; el rango máximo es de 31 días.',
  })
  @IsString()
  to!: string;
}
