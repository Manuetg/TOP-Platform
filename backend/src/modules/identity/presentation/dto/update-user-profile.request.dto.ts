import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PROFILE_AVATAR_IDS } from '../../domain/profile-avatar';

export class UpdateUserProfileRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 120, description: 'Nombre personal; se recortan los espacios en los extremos.' })
  @IsString()
  displayName!: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, description: 'Año de nacimiento opcional; null borra el valor. No admite años futuros.' })
  @IsOptional() @IsInt() @Min(1)
  birthYear?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 50, description: 'Alias del perfil; no cambia el identificador de acceso y no requiere unicidad. null borra el valor.' })
  @IsOptional() @IsString()
  username?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Teléfono internacional con prefijo +; se normaliza a E.164. null borra el valor.' })
  @IsOptional() @IsString()
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, enum: PROFILE_AVATAR_IDS, description: 'Avatar del catálogo cerrado de TOP; null restaura el avatar predeterminado.' })
  @IsOptional() @IsString() @IsIn(PROFILE_AVATAR_IDS)
  avatarId?: string | null;

  @ApiProperty({ format: 'date-time', description: 'updatedAt exacto del perfil consultado, en ISO UTC con milisegundos.' })
  @IsString()
  expectedUpdatedAt!: string;
}
