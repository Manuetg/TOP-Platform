import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class MetaWhatsAppEmbeddedSignupStartResponseDto {
  @ApiProperty({ format: 'uuid' }) attemptId!: string;
  @ApiProperty() state!: string;
  @ApiProperty() configurationId!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
}

export class MetaWhatsAppEmbeddedSignupSessionInfoDto {
  @ApiProperty() @IsString() @IsNotEmpty() providerPhoneNumberId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() providerWabaId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() providerBusinessPortfolioId?: string;
}

export class MetaWhatsAppEmbeddedSignupCompleteRequestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() attemptId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() state!: string;
  @ApiProperty() @IsString() @IsNotEmpty() code!: string;
  @ApiProperty({ type: MetaWhatsAppEmbeddedSignupSessionInfoDto }) @ValidateNested() @Type(() => MetaWhatsAppEmbeddedSignupSessionInfoDto) sessionInfo!: MetaWhatsAppEmbeddedSignupSessionInfoDto;
}

export class MetaWhatsAppEmbeddedSignupCompleteResponseDto {
  @ApiProperty({ format: 'uuid' }) connectionId!: string;
  @ApiProperty({ enum: ['ACTIVE'] }) status!: 'ACTIVE';
  @ApiProperty({ enum: ['META_WHATSAPP'] }) provider!: 'META_WHATSAPP';
  @ApiProperty({ enum: ['WHATSAPP'] }) channel!: 'WHATSAPP';
}
