import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactRequestDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() whatsapp?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() documentType?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() documentNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string | null;
}
