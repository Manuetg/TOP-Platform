import { BadRequestException, Body, ConflictException, Controller, Headers, HttpCode, HttpStatus, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { PaymentConflictError, PaymentInputError, PaymentNotFoundError, RegisterPaymentUseCase } from '../application/register-payment.use-case';
import type { Payment } from '../domain/payment';
import { RegisterPaymentRequestDto } from './dto/register-payment.request.dto';

@Controller('businesses/:businessId/bookings/:bookingId/payments')
export class PaymentController {
  constructor(private readonly register: RegisterPaymentUseCase) {}
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
}
