import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpCode, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import { FinancePeriodClosedError, isFinancePeriodClosedError } from '../../../shared/infrastructure/finance-period.guard';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess, BusinessAccessByBody } from '../../../shared/security/security.decorators';
import { PaymentAdjustmentConflictError, PaymentAdjustmentForbiddenError, PaymentAdjustmentInputError, PaymentAdjustmentInvariantError, PaymentAdjustmentNotFoundError } from '../../payment/payment.contract';
import { TerminalFinalAmountConflictError, TerminalFinalAmountForbiddenError, TerminalFinalAmountInputError, TerminalFinalAmountNotFoundError } from '../../pricing/pricing.contract';
import { FinanceCorrectionsUseCases } from '../application/finance-corrections.use-cases';
import { FinanceConflictError, FinanceForbiddenError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import type { FinanceActor } from '../domain/finance.types';
import type { FinanceCorrectionsData, FinancePaymentAdjustmentResult, FinanceTerminalPricingResult } from '../domain/finance-corrections.types';

function actor(businessId: string, request: AuthenticatedRequest): FinanceActor {
  if (!request.authenticatedPrincipal) throw new UnauthorizedException();
  return { businessId, actorUserId: request.authenticatedPrincipal.userId };
}

const inputErrors = [FinanceInputError, PaymentAdjustmentInputError, TerminalFinalAmountInputError];
const forbiddenErrors = [FinanceForbiddenError, PaymentAdjustmentForbiddenError, TerminalFinalAmountForbiddenError];
const notFoundErrors = [FinanceNotFoundError, PaymentAdjustmentNotFoundError, TerminalFinalAmountNotFoundError];
const conflictErrors = [FinanceConflictError, PaymentAdjustmentConflictError, PaymentAdjustmentInvariantError, TerminalFinalAmountConflictError, FinancePeriodClosedError];

async function correctionResponse<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error: unknown) {
    if (!(error instanceof Error)) throw error;
    if (isFinancePeriodClosedError(error)) throw new ConflictException(new FinancePeriodClosedError().message);
    if ('code' in error && error.code === 'SOURCE_LIMIT') throw new ConflictException(error.message);
    if (inputErrors.some((type) => error instanceof type)) throw new BadRequestException(error.message);
    if (forbiddenErrors.some((type) => error instanceof type)) throw new ForbiddenException(error.message);
    if (notFoundErrors.some((type) => error instanceof type)) throw new NotFoundException(error.message);
    if (conflictErrors.some((type) => error instanceof type)) throw new ConflictException(error.message);
    throw error;
  }
}

@ApiTags('Finance')
@Controller('businesses/:businessId/finance')
export class FinanceCorrectionsController {
  constructor(private readonly useCases: FinanceCorrectionsUseCases) {}

  @Get('corrections') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Consulta bruto, neto, ajustes y versiones para correcciones manuales OWNER.' })
  read(@Param('businessId') businessId: string, @Req() request: AuthenticatedRequest): Promise<FinanceCorrectionsData> {
    return correctionResponse(() => this.useCases.read(actor(businessId, request)));
  }

  @Post('payment-adjustments') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @BusinessAccessByBody('businessId', Capability.FINANCE_WRITE, 'type', { VOID_PAYMENT: Capability.PAYMENT_VOID, REFUND_PAYMENT: Capability.PAYMENT_REFUND })
  @ApiOperation({ summary: 'Registra una anulación registral o devolución informativa ligada al cobro original.' })
  adjustment(@Param('businessId') businessId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() request: AuthenticatedRequest): Promise<FinancePaymentAdjustmentResult> {
    return correctionResponse(() => this.useCases.paymentAdjustment(actor(businessId, request), body, key));
  }

  @Post('terminal-pricing') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @BusinessAccessByBody('businessId', Capability.FINANCE_WRITE, 'type', { SET_TERMINAL_FINAL_AMOUNT: Capability.PRICING_FINAL_AMOUNT })
  @ApiOperation({ summary: 'Confirma manualmente el importe final exigible de una reserva cancelada o no-show.' })
  terminal(@Param('businessId') businessId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() request: AuthenticatedRequest): Promise<FinanceTerminalPricingResult> {
    return correctionResponse(() => this.useCases.terminalPricing(actor(businessId, request), body, key));
  }
}
