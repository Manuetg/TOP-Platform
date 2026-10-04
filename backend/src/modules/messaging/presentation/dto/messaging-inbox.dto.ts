import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConversationMode } from '../../domain/conversation-mode.enum';
import { ConversationStatus } from '../../domain/conversation-status.enum';
import { MessagingChannel } from '../../domain/messaging-channel.enum';
import { OutboundMessageStatus } from '../../domain/outbound-message-status.enum';
import type { ConversationInboxDetailView, ConversationInboxSummaryView } from '../../application/messaging-inbox.use-cases';
import type { ConversationInboxMessage } from '../../domain/conversation-inbox.repository';

export class MessagingInboxQueryDto { @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string; @ApiPropertyOptional({ example: '50' }) @IsOptional() @IsString() limit?: string; }
export class ChangeConversationModeRequestDto { @ApiProperty({ enum: ConversationMode }) @IsEnum(ConversationMode) mode!: ConversationMode; }
export class SendManualConversationMessageRequestDto { @ApiProperty({ maxLength: 4000 }) @IsString() @IsNotEmpty() @MaxLength(4000) text!: string; @ApiProperty({ maxLength: 255 }) @IsString() @IsNotEmpty() @MaxLength(255) clientRequestId!: string; }

export class MessagingInboxPageInfoDto { @ApiPropertyOptional({ nullable: true }) nextCursor!: string | null; @ApiProperty() hasNextPage!: boolean; }
export class ConversationInboxSummaryResponseDto {
  @ApiProperty({ format: 'uuid' }) conversationId!: string;
  @ApiProperty({ enum: MessagingChannel }) channel!: MessagingChannel;
  @ApiProperty({ enum: ConversationMode }) mode!: ConversationMode;
  @ApiProperty({ enum: ConversationStatus }) status!: ConversationStatus;
  @ApiProperty() externalParticipant!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) contactId!: string | null;
  @ApiPropertyOptional({ nullable: true }) contactName!: string | null;
  @ApiProperty({ format: 'date-time' }) lastMessageAt!: string;
  @ApiPropertyOptional({ nullable: true }) lastMessagePreview!: string | null;
  @ApiPropertyOptional({ enum: ['INBOUND', 'OUTBOUND'], nullable: true }) lastMessageDirection!: 'INBOUND' | 'OUTBOUND' | null;
  static fromDomain(item: ConversationInboxSummaryView): ConversationInboxSummaryResponseDto { return { ...item, lastMessageAt: item.lastMessageAt.toISOString() }; }
}
export class ConversationContactResponseDto { @ApiProperty({ format: 'uuid' }) id!: string; @ApiProperty() name!: string; @ApiPropertyOptional({ nullable: true }) phone!: string | null; @ApiPropertyOptional({ nullable: true }) whatsapp!: string | null; }
export class ConversationBookingResponseDto { @ApiProperty({ format: 'uuid' }) id!: string; @ApiProperty() status!: string; }
export class ConversationInboxDetailResponseDto { @ApiProperty({ format: 'uuid' }) conversationId!: string; @ApiProperty({ enum: MessagingChannel }) channel!: MessagingChannel; @ApiProperty({ enum: ConversationMode }) mode!: ConversationMode; @ApiProperty({ enum: ConversationStatus }) status!: ConversationStatus; @ApiProperty() externalParticipant!: string; @ApiPropertyOptional({ format: 'uuid', nullable: true }) contactId!: string | null; @ApiPropertyOptional({ nullable: true }) contactName!: string | null; @ApiProperty({ format: 'date-time' }) lastMessageAt!: string; @ApiPropertyOptional({ nullable: true }) lastMessagePreview!: string | null; @ApiPropertyOptional({ enum: ['INBOUND', 'OUTBOUND'], nullable: true }) lastMessageDirection!: 'INBOUND' | 'OUTBOUND' | null; @ApiProperty({ format: 'date-time' }) createdAt!: string; @ApiPropertyOptional({ format: 'date-time', nullable: true }) closedAt!: string | null; @ApiPropertyOptional({ type: ConversationContactResponseDto, nullable: true }) contact!: ConversationContactResponseDto | null; @ApiPropertyOptional({ type: ConversationBookingResponseDto, nullable: true }) booking!: ConversationBookingResponseDto | null; static fromDomain(item: ConversationInboxDetailView): ConversationInboxDetailResponseDto { return { conversationId: item.conversationId, channel: item.channel, mode: item.mode, status: item.status, externalParticipant: item.externalParticipant, contactId: item.contactId, contactName: item.contactName, lastMessageAt: item.lastMessageAt.toISOString(), lastMessagePreview: item.lastMessagePreview, lastMessageDirection: item.lastMessageDirection, createdAt: item.createdAt.toISOString(), closedAt: item.closedAt?.toISOString() ?? null, contact: item.contact, booking: item.booking }; } }
export class ConversationInboxMessageResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['INBOUND', 'OUTBOUND'] }) direction!: 'INBOUND' | 'OUTBOUND';
  @ApiProperty() messageType!: string;
  @ApiPropertyOptional({ nullable: true }) text!: string | null;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiPropertyOptional({ enum: OutboundMessageStatus, nullable: true }) status!: OutboundMessageStatus | null;
  @ApiPropertyOptional({ enum: ['BOT', 'AUTOMATION', 'MANUAL'], nullable: true }) origin!: 'BOT' | 'AUTOMATION' | 'MANUAL' | null;
  static fromDomain(item: ConversationInboxMessage): ConversationInboxMessageResponseDto { return { ...item, occurredAt: item.occurredAt.toISOString() }; }
}
export class ConversationInboxSummaryPageResponseDto { @ApiProperty({ type: ConversationInboxSummaryResponseDto, isArray: true }) items!: ConversationInboxSummaryResponseDto[]; @ApiProperty({ type: MessagingInboxPageInfoDto }) pageInfo!: MessagingInboxPageInfoDto; }
export class ConversationInboxMessagePageResponseDto { @ApiProperty({ type: ConversationInboxMessageResponseDto, isArray: true }) items!: ConversationInboxMessageResponseDto[]; @ApiProperty({ type: MessagingInboxPageInfoDto }) pageInfo!: MessagingInboxPageInfoDto; }
export class SendManualConversationMessageResponseDto { @ApiProperty({ format: 'uuid' }) id!: string; @ApiProperty() text!: string; @ApiProperty({ enum: OutboundMessageStatus }) status!: OutboundMessageStatus; @ApiProperty({ format: 'date-time' }) occurredAt!: string; static fromDomain(message: { id: string; payload: Record<string, unknown>; status: OutboundMessageStatus; createdAt: Date }): SendManualConversationMessageResponseDto { return { id: message.id, text: typeof message.payload.text === 'string' ? message.payload.text : '', status: message.status, occurredAt: message.createdAt.toISOString() }; } }
