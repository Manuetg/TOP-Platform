import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateUserRequestDto {
  @ApiProperty({ example: 'nuevo-email@ejemplo.com' })
  @IsString()
  email!: string;
}
