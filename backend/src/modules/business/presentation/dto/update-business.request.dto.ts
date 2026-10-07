import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateBusinessRequestDto {
  @ApiProperty({ example: '2026-10-02T00:00:00.000Z', description: 'updatedAt vigente, exacto, en ISO UTC con milisegundos.' })
  @IsString()
  expectedUpdatedAt!: string;

  @ApiPropertyOptional({ example: 'Cabañas Demo Actualizadas', maxLength: 120 })
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Cabañas Demo S.A.', nullable: true })
  @IsOptional() @IsString()
  legalName?: string | null;

  @ApiPropertyOptional({ example: '80012345-6', nullable: true })
  @IsOptional() @IsString()
  taxId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString()
  country?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString()
  region?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional() @IsString()
  city?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional() @IsString()
  address?: string | null;

  @ApiPropertyOptional({ example: 'America/Asuncion' })
  @IsOptional() @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'PYG', enum: ['PYG'] })
  @IsOptional() @IsString()
  currency?: string;
}
