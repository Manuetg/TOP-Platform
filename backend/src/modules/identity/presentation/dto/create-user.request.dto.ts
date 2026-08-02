import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserRequestDto {
  @ApiProperty({ example: 'propietario@ejemplo.com' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString() @IsEmail()
  email!: string;
  @ApiProperty({ example: 'una contraseña suficientemente larga', minLength: 12, maxLength: 128 })
  @IsString() @MinLength(12) @MaxLength(128)
  password!: string;
}
