import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBusinessRequestDto {
  @ApiPropertyOptional({ example: 'Cabañas Demo Actualizadas', maxLength: 120 })
  @IsOptional() @IsString() @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Cabañas Demo S.A.', nullable: true })
  @IsOptional() @IsString()
  legalName?: string | null;

  @ApiPropertyOptional({ example: '80012345-6', nullable: true })
  @IsOptional() @IsString()
  taxId?: string | null;

  @ApiPropertyOptional({ example: 'America/Asuncion' })
  @IsOptional() @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'PYG', enum: ['PYG'] })
  @IsOptional() @IsString()
  currency?: string;
}
