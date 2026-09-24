import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';
export class ForgotPasswordRequestDto { @ApiProperty({ example: 'persona@ejemplo.com' }) @IsString() @IsEmail() email!: string; }
