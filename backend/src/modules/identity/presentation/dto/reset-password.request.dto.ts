import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
export class ResetPasswordRequestDto { @ApiProperty() @IsString() resetGrant!: string; @ApiProperty({ minLength: 12, maxLength: 128 }) @IsString() @Length(12, 128) password!: string; }
