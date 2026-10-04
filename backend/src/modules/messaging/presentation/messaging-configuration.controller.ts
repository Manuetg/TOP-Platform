import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseEnumPipe, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import { MessagingAutomationType } from '../domain/messaging-automation-type.enum';
import { MessagingConfigurationBusinessNotFoundError, MessagingConfigurationInputError, MessagingConfigurationTemplateNotFoundError, MessagingConfigurationUseCases } from '../application/messaging-configuration.use-cases';
import { MessagingAutomationResponseDto, MessagingSettingsResponseDto, MessagingTemplateResponseDto, UpdateMessagingAutomationRequestDto, UpdateMessagingSettingsRequestDto, UpdateMessagingTemplateRequestDto } from './dto/messaging-configuration.dto';

@ApiTags('Messaging')
@Controller('businesses/:businessId/messaging')
export class MessagingConfigurationController {
  constructor(private readonly configuration: MessagingConfigurationUseCases) {}

  @Get('settings')
  @BusinessAccess('businessId', Capability.MESSAGING_READ)
  @ApiOkResponse({ type: MessagingSettingsResponseDto })
  @ApiNotFoundResponse()
  async settings(@Param('businessId', new ParseUUIDPipe()) businessId: string): Promise<MessagingSettingsResponseDto> {
    return this.run(() => this.configuration.getSettings(businessId));
  }

  @Patch('settings')
  @BusinessAccess('businessId', Capability.MESSAGING_WRITE)
  @ApiOkResponse({ type: MessagingSettingsResponseDto })
  @ApiNotFoundResponse()
  async updateSettings(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Body() body: UpdateMessagingSettingsRequestDto): Promise<MessagingSettingsResponseDto> {
    return this.run(() => this.configuration.updateSettings({ businessId, botEnabled: body.botEnabled }));
  }

  @Get('automations')
  @BusinessAccess('businessId', Capability.MESSAGING_READ)
  @ApiOkResponse({ type: MessagingAutomationResponseDto, isArray: true })
  async automations(@Param('businessId', new ParseUUIDPipe()) businessId: string): Promise<MessagingAutomationResponseDto[]> {
    return this.run(() => this.configuration.listAutomations(businessId));
  }

  @Patch('automations/:automationType')
  @BusinessAccess('businessId', Capability.MESSAGING_WRITE)
  @ApiOkResponse({ type: MessagingAutomationResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async updateAutomation(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Param('automationType', new ParseEnumPipe(MessagingAutomationType)) automationType: MessagingAutomationType, @Body() body: UpdateMessagingAutomationRequestDto): Promise<MessagingAutomationResponseDto> {
    return this.run(() => this.configuration.updateAutomation({ businessId, automationType, enabled: body.enabled, templateId: body.templateId }));
  }

  @Get('templates')
  @BusinessAccess('businessId', Capability.MESSAGING_READ)
  @ApiOkResponse({ type: MessagingTemplateResponseDto, isArray: true })
  async templates(@Param('businessId', new ParseUUIDPipe()) businessId: string): Promise<MessagingTemplateResponseDto[]> {
    return this.run(() => this.configuration.listTemplates(businessId));
  }

  @Patch('templates/:templateType')
  @BusinessAccess('businessId', Capability.MESSAGING_WRITE)
  @ApiOkResponse({ type: MessagingTemplateResponseDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  async updateTemplate(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Param('templateType', new ParseEnumPipe(MessagingAutomationType)) templateType: MessagingAutomationType, @Body() body: UpdateMessagingTemplateRequestDto): Promise<MessagingTemplateResponseDto> {
    return this.run(() => this.configuration.updateTemplate({ businessId, templateType, content: body.content }));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error: unknown) {
      if (error instanceof MessagingConfigurationInputError) throw new BadRequestException(error.message);
      if (error instanceof MessagingConfigurationBusinessNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof MessagingConfigurationTemplateNotFoundError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
