import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Put, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { PaymentPlanConflictError, PaymentPlanInputError, PaymentPlanNotFoundError, PaymentPlanUseCases, type PaymentPlanResponse } from '../application/payment-plan.use-cases';
import { PaymentPlanRequestDto } from './dto/payment-plan.request.dto';

@ApiTags('Payment')
@Controller('businesses/:businessId/bookings/:bookingId/payment-plan')
export class PaymentPlanController {
  constructor(private readonly plans: PaymentPlanUseCases) {}

  @Post()
  @BusinessAccess('businessId', Capability.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Creates the Booking payment plan and applies recorded Payments.' })
  @ApiCreatedResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  create(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: PaymentPlanRequestDto, @Req() request: AuthenticatedRequest): Promise<PaymentPlanResponse> {
    return this.write('create', businessId, bookingId, body, request);
  }

  @Get()
  @BusinessAccess('businessId', Capability.PAYMENT_READ)
  @ApiOperation({ summary: 'Gets the Booking payment plan with derived installment balances.' })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  async get(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string): Promise<PaymentPlanResponse> {
    try { return await this.plans.get(businessId, bookingId); }
    catch (error: unknown) { throw this.mapError(error); }
  }

  @Put()
  @BusinessAccess('businessId', Capability.PAYMENT_RECORD)
  @ApiOperation({ summary: 'Replaces all installments before the first Payment application.' })
  @ApiOkResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  replace(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: PaymentPlanRequestDto, @Req() request: AuthenticatedRequest): Promise<PaymentPlanResponse> {
    return this.write('replace', businessId, bookingId, body, request);
  }

  private async write(operation: 'create' | 'replace', businessId: string, bookingId: string, body: PaymentPlanRequestDto, request: AuthenticatedRequest): Promise<PaymentPlanResponse> {
    const actorUserId = request.authenticatedPrincipal?.userId;
    if (!actorUserId) throw new UnauthorizedException();
    try { return await this.plans[operation]({ businessId, bookingId, actorUserId, installments: body.installments }); }
    catch (error: unknown) { throw this.mapError(error); }
  }

  private mapError(error: unknown): Error {
    if (error instanceof PaymentPlanInputError) return new BadRequestException(error.message);
    if (error instanceof PaymentPlanNotFoundError) return new NotFoundException(error.message);
    if (error instanceof PaymentPlanConflictError) return new ConflictException(error.message);
    return error instanceof Error ? error : new Error('Error inesperado.');
  }
}
