import { BadRequestException, Body, ConflictException, Controller, Get, Headers, HttpCode, HttpStatus, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { PaymentConflictError, PaymentInputError, PaymentNotFoundError, RegisterPaymentUseCase } from '../application/register-payment.use-case';
import { ListPaymentsUseCase, PaymentHistoryInputError, PaymentHistoryNotFoundError } from '../application/list-payments.use-case';
import type { Payment } from '../domain/payment';
import { RegisterPaymentRequestDto } from './dto/register-payment.request.dto';
import { PaymentHistoryQueryDto } from './dto/payment-history.query.dto';
import { PaymentHistoryItemResponseDto, PaymentHistoryResponseDto } from './dto/payment-history.response.dto';

@ApiTags('Payment')
@Controller('businesses/:businessId/bookings/:bookingId/payments')
export class PaymentController {
  constructor(private readonly register: RegisterPaymentUseCase, private readonly list: ListPaymentsUseCase) {}
  @Post() @HttpCode(HttpStatus.CREATED) @BusinessAccess('businessId', Capability.PAYMENT_RECORD)
  async create(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Body() body: RegisterPaymentRequestDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest): Promise<Payment> {
    const principal = request.authenticatedPrincipal;
    if (!principal) throw new UnauthorizedException();
    try { return await this.register.execute({ ...body, businessId, bookingId, idempotencyKey, actorUserId: principal.userId }); }
    catch (error: unknown) {
      if (error instanceof PaymentInputError) throw new BadRequestException(error.message);
      if (error instanceof PaymentNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof PaymentConflictError || (error instanceof Error && ['OVERPAYMENT', 'IDEMPOTENCY_CONFLICT'].includes(error.message))) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get()
  @BusinessAccess('businessId', Capability.PAYMENT_READ)
  @ApiOperation({ summary: 'Lists the Booking Payments, newest financial event first.' })
  @ApiOkResponse({ type: PaymentHistoryResponseDto, description: 'Page ordered by paidAt DESC, createdAt DESC and id DESC.' })
  @ApiBadRequestResponse({ description: 'Invalid path, limit, or opaque cursor.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT, or disabled user.' })
  @ApiForbiddenResponse({ description: 'The authenticated user is not a member of the Business.' })
  @ApiNotFoundResponse({ description: 'The Booking does not exist in the requested Business.' })
  async history(
    @Param('businessId') businessId: string,
    @Param('bookingId') bookingId: string,
    @Query() query: PaymentHistoryQueryDto,
  ): Promise<PaymentHistoryResponseDto> {
    try {
      const page = await this.list.execute({ businessId, bookingId, cursor: query.cursor, limit: query.limit });
      return { items: page.items.map((payment) => PaymentHistoryItemResponseDto.fromDomain(payment)), pageInfo: page.pageInfo };
    } catch (error: unknown) {
      if (error instanceof PaymentHistoryInputError) throw new BadRequestException(error.message);
      if (error instanceof PaymentHistoryNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
