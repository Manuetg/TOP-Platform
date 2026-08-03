import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginRequestDto {
  @ApiProperty({ example: 'propietario@ejemplo.com' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'contraseña' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
