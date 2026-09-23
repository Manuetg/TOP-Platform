import { ConflictException, Controller, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';
import { AuthenticatedUser } from '../../../shared/security/authenticated-user.decorator';
import type { AuthenticatedPrincipal } from '../../../shared/security/authenticated-principal';
import { SubscriptionBusinessNotFoundError, SubscriptionBusinessUnavailableError, SubscriptionUseCase } from '../application/subscription.use-case';
import { SubscriptionResponseDto, UpgradeResponseDto } from './subscription.response.dto';

@ApiTags('Subscription')
@Controller('businesses/:businessId/subscription')
export class SubscriptionController {
  constructor(private readonly useCase: SubscriptionUseCase) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @BusinessAccess('businessId', Capability.SUBSCRIPTION_READ)
  @ApiOperation({ summary: 'Consultar plan, cupo y uso de recursos operativos del negocio' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiForbiddenResponse()
  @ApiConflictResponse({ description: 'Business no activo.' })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  async get(@Param('businessId', new ParseUUIDPipe()) businessId: string): Promise<SubscriptionResponseDto> {
    return this.execute(() => this.useCase.get(businessId));
  }
  @Post('upgrade-request')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @BusinessAccess('businessId', Capability.SUBSCRIPTION_REQUEST_UPGRADE)
  @ApiOperation({ summary: 'Registrar una solicitud única de ampliación, sin cambiar el plan ni efectuar cobros' })
  @ApiOkResponse({ type: UpgradeResponseDto })
  @ApiForbiddenResponse()
  @ApiConflictResponse({ description: 'Business no activo.' })
  async request(@Param('businessId', new ParseUUIDPipe()) businessId: string, @AuthenticatedUser() principal: AuthenticatedPrincipal): Promise<UpgradeResponseDto> {
    return this.execute(() => this.useCase.requestUpgrade(businessId, principal.userId));
  }
  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) {
      if (error instanceof SubscriptionBusinessNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SubscriptionBusinessUnavailableError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
