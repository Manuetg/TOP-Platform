import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateBusinessRequestDto {
  @ApiProperty({ example: 'Cabañas del Lago', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Cabañas del Lago S.R.L.' })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: '80012345-6' })
  @IsOptional()
  @IsString()
  taxId?: string;
}
