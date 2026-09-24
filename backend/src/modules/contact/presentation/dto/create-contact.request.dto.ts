import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactRequestDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string | null;
  @ApiPropertyOptional({ description: 'Número internacional (+/00) o nacional con country. Se normaliza a E.164 cuando hay contexto; sin país se conserva entrada nacional compatible. PATCH conserva valores históricos sin editar.', example: '+595981123456' }) @IsOptional() @IsString() phone?: string | null;
  @ApiPropertyOptional({ description: 'Misma normalización que phone. No se sobrescribe automáticamente un WhatsApp histórico distinto.', example: '+595981123456' }) @IsOptional() @IsString() whatsapp?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() documentType?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() documentNumber?: string | null;
  @ApiPropertyOptional({ description: 'País en español del catálogo o ISO alpha-2. Ayuda a interpretar números nacionales nuevos; no modifica números históricos ni prefijos internacionales explícitos.', example: 'Paraguay' }) @IsOptional() @IsString() country?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string | null;
}
