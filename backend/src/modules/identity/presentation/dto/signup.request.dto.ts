import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
export class SignupRequestDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) displayName!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 }) @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(160) businessName!: string;
  @ApiProperty({ example: 'America/Asuncion' }) @IsString() @IsNotEmpty() timezone!: string;
}
