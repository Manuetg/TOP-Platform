import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import { ChangeConversationModeUseCase } from '../application/change-conversation-mode.use-case';
import { ConversationClosedError, ConversationNotFoundError, InvalidInboundMessageInputError, InvalidManualConversationMessageError, ManualConversationMessageNotAllowedError } from '../application/receive-inbound-message.errors';
import { MessagingInboxUseCases, SendManualConversationMessageUseCase } from '../application/messaging-inbox.use-cases';
import { ChangeConversationModeRequestDto, ConversationInboxDetailResponseDto, ConversationInboxMessagePageResponseDto, ConversationInboxMessageResponseDto, ConversationInboxSummaryPageResponseDto, ConversationInboxSummaryResponseDto, MessagingInboxQueryDto, SendManualConversationMessageRequestDto, SendManualConversationMessageResponseDto } from './dto/messaging-inbox.dto';

@ApiTags('Messaging Inbox')
@Controller('businesses/:businessId/messaging')
export class MessagingInboxController {
  constructor(private readonly inbox: MessagingInboxUseCases, private readonly changeMode: ChangeConversationModeUseCase, private readonly sendManual: SendManualConversationMessageUseCase) {}

  @Get('conversations') @BusinessAccess('businessId', Capability.MESSAGING_READ) @ApiOkResponse({ type: ConversationInboxSummaryPageResponseDto }) @ApiBadRequestResponse()
  async list(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Query() query: MessagingInboxQueryDto): Promise<ConversationInboxSummaryPageResponseDto> { return this.run(async () => { const page = await this.inbox.listConversations({ businessId, cursor: query.cursor, limit: query.limit }); return { items: page.items.map((item) => ConversationInboxSummaryResponseDto.fromDomain(item)), pageInfo: page.pageInfo }; }); }

  @Get('conversations/:conversationId') @BusinessAccess('businessId', Capability.MESSAGING_READ) @ApiOkResponse({ type: ConversationInboxDetailResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async detail(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Param('conversationId', new ParseUUIDPipe()) conversationId: string): Promise<ConversationInboxDetailResponseDto> { return this.run(async () => ConversationInboxDetailResponseDto.fromDomain(await this.inbox.getConversation({ businessId, conversationId }))); }

  @Get('conversations/:conversationId/messages') @BusinessAccess('businessId', Capability.MESSAGING_READ) @ApiOkResponse({ type: ConversationInboxMessagePageResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async messages(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Param('conversationId', new ParseUUIDPipe()) conversationId: string, @Query() query: MessagingInboxQueryDto): Promise<ConversationInboxMessagePageResponseDto> { return this.run(async () => { const page = await this.inbox.listMessages({ businessId, conversationId, cursor: query.cursor, limit: query.limit }); return { items: page.items.map((item) => ConversationInboxMessageResponseDto.fromDomain(item)), pageInfo: page.pageInfo }; }); }

  @Patch('conversations/:conversationId/mode') @BusinessAccess('businessId', Capability.MESSAGING_WRITE) @ApiOkResponse({ type: ConversationInboxDetailResponseDto }) @ApiBadRequestResponse() @ApiConflictResponse() @ApiNotFoundResponse()
  async mode(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Param('conversationId', new ParseUUIDPipe()) conversationId: string, @Body() body: ChangeConversationModeRequestDto): Promise<ConversationInboxDetailResponseDto> { return this.run(async () => { await this.changeMode.execute({ businessId, conversationId, mode: body.mode }); return ConversationInboxDetailResponseDto.fromDomain(await this.inbox.getConversation({ businessId, conversationId })); }); }

  @Post('conversations/:conversationId/messages') @BusinessAccess('businessId', Capability.MESSAGING_WRITE) @ApiCreatedResponse({ type: SendManualConversationMessageResponseDto }) @ApiBadRequestResponse() @ApiConflictResponse() @ApiNotFoundResponse()
  async manual(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Param('conversationId', new ParseUUIDPipe()) conversationId: string, @Body() body: SendManualConversationMessageRequestDto): Promise<SendManualConversationMessageResponseDto> { return this.run(async () => SendManualConversationMessageResponseDto.fromDomain(await this.sendManual.execute({ businessId, conversationId, text: body.text, clientRequestId: body.clientRequestId }))); }

  private async run<T>(operation: () => Promise<T>): Promise<T> { try { return await operation(); } catch (error: unknown) { if (error instanceof InvalidInboundMessageInputError || error instanceof InvalidManualConversationMessageError) throw new BadRequestException(error.message); if (error instanceof ConversationNotFoundError) throw new NotFoundException(error.message); if (error instanceof ConversationClosedError || error instanceof ManualConversationMessageNotAllowedError) throw new ConflictException(error.message); throw error; } }
}
