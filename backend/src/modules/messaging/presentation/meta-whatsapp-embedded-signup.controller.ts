import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, NotFoundException, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import { CompleteMetaWhatsAppEmbeddedSignupUseCase } from '../application/complete-meta-whatsapp-embedded-signup.use-case';
import { MetaWhatsAppEmbeddedSignupApplicationError } from '../application/meta-whatsapp-embedded-signup.errors';
import { StartMetaWhatsAppEmbeddedSignupUseCase } from '../application/start-meta-whatsapp-embedded-signup.use-case';
import { MetaWhatsAppEmbeddedSignupCompleteRequestDto, MetaWhatsAppEmbeddedSignupCompleteResponseDto, MetaWhatsAppEmbeddedSignupStartResponseDto } from './dto/meta-whatsapp-embedded-signup.dto';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';

@ApiTags('Messaging Connections')
@Controller('businesses/:businessId/messaging/connections/meta/embedded-signup')
export class MetaWhatsAppEmbeddedSignupController {
  constructor(private readonly start: StartMetaWhatsAppEmbeddedSignupUseCase, private readonly complete: CompleteMetaWhatsAppEmbeddedSignupUseCase) {}

  @Post('start')
  @BusinessAccess('businessId', Capability.MESSAGING_WRITE)
  @ApiCreatedResponse({ type: MetaWhatsAppEmbeddedSignupStartResponseDto })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  async startSignup(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Req() request: AuthenticatedRequest): Promise<MetaWhatsAppEmbeddedSignupStartResponseDto> {
    try { return await this.start.execute({ businessId, initiatedByUserId: request.authenticatedPrincipal?.userId ?? null }); }
    catch (error: unknown) { throw this.httpError(error); }
  }

  @Post('complete')
  @BusinessAccess('businessId', Capability.MESSAGING_WRITE)
  @ApiCreatedResponse({ type: MetaWhatsAppEmbeddedSignupCompleteResponseDto })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async completeSignup(@Param('businessId', new ParseUUIDPipe()) businessId: string, @Body() body: MetaWhatsAppEmbeddedSignupCompleteRequestDto): Promise<MetaWhatsAppEmbeddedSignupCompleteResponseDto> {
    try { return await this.complete.execute({ businessId, attemptId: body.attemptId, state: body.state, code: body.code, sessionInfo: body.sessionInfo }); }
    catch (error: unknown) { throw this.httpError(error); }
  }

  private httpError(error: unknown): Error {
    if (!(error instanceof MetaWhatsAppEmbeddedSignupApplicationError)) return error instanceof Error ? error : new Error('No se pudo procesar Embedded Signup.');
    if (error.code === 'ATTEMPT_NOT_FOUND') return new NotFoundException(error.message);
    if (error.code === 'CONFIGURATION_UNAVAILABLE') return new ForbiddenException(error.message);
    if (['PHONE_NUMBER_ALREADY_LINKED', 'ATTEMPT_CONSUMED', 'ATTEMPT_IN_PROGRESS'].includes(error.code)) return new ConflictException(error.message);
    if (error.code === 'ATTEMPT_EXPIRED') return new ConflictException(error.message);
    return new BadRequestException(error.message);
  }
}
