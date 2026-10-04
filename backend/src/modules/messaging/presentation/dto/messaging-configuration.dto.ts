import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MessagingAutomationType } from '../../domain/messaging-automation-type.enum';

export class MessagingSettingsResponseDto {
  @ApiProperty() businessId!: string;
  @ApiProperty() botEnabled!: boolean;
}

export class UpdateMessagingSettingsRequestDto {
  @ApiProperty() @IsBoolean() botEnabled!: boolean;
}

export class MessagingAutomationResponseDto {
  @ApiProperty({ nullable: true }) id!: string | null;
  @ApiProperty() businessId!: string;
  @ApiProperty({ enum: MessagingAutomationType }) automationType!: MessagingAutomationType;
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ nullable: true }) templateId!: string | null;
  @ApiProperty({ nullable: true }) createdAt!: Date | null;
  @ApiProperty({ nullable: true }) updatedAt!: Date | null;
}

export class UpdateMessagingAutomationRequestDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @IsOptional() @IsUUID() templateId?: string | null;
}

export class MessagingTemplateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() businessId!: string;
  @ApiProperty({ enum: MessagingAutomationType }) templateType!: MessagingAutomationType;
  @ApiProperty({ example: 'WHATSAPP' }) channel!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class UpdateMessagingTemplateRequestDto {
  @ApiProperty({ maxLength: 4000 }) @IsString() @IsNotEmpty() @MaxLength(4000) content!: string;
}
