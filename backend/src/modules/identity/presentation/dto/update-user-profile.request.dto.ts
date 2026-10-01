import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateUserProfileRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 120, description: 'Nombre personal; se recortan los espacios en los extremos.' })
  @IsString()
  displayName!: string;

  @ApiProperty({ description: 'Motivo ingresado por el usuario; se recorta y no puede quedar vacío.' })
  @IsString()
  reason!: string;

  @ApiProperty({ format: 'date-time', description: 'updatedAt exacto del perfil consultado, en ISO UTC con milisegundos.' })
  @IsString()
  expectedUpdatedAt!: string;
}
