import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpCode, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess, BusinessAccessByBody } from '../../../shared/security/security.decorators';
import { FinancePeriodClosedError, isFinancePeriodClosedError } from '../../../shared/infrastructure/finance-period.guard';
import { FinanceUseCases } from '../application/finance.use-cases';
import { FinanceInputError, FinanceConflictError, FinanceNotFoundError, FinanceForbiddenError } from '../domain/finance.errors';
import type { FinanceActor, FinanceResult, FinanceReport, FinanceExpense, FinanceAuditItem } from '../domain/finance.types';

function financeActor(businessId: string, request: AuthenticatedRequest): FinanceActor {
  if (!request.authenticatedPrincipal) throw new UnauthorizedException();
  return { businessId, actorUserId: request.authenticatedPrincipal.userId };
}

async function financeResponse<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error: unknown) {
    if (isFinancePeriodClosedError(error)) throw new ConflictException({ code: 'FINANCE_PERIOD_CLOSED', message: new FinancePeriodClosedError().message });
    if (error instanceof FinanceInputError) throw new BadRequestException(error.message);
    if (error instanceof FinanceConflictError) throw new ConflictException(error.message);
    if (error instanceof FinanceNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof FinanceForbiddenError) throw new ForbiddenException(error.message);
    throw error;
  }
}

@ApiTags('Finance')
@Controller('businesses/:businessId/finance')
export class FinanceController {
  constructor(private readonly finance: FinanceUseCases) {}

  @Get() @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Consulta gastos por consumo, obligación actual y caja registrada al corte.' })
  report(@Param('businessId') businessId: string, @Query('from') from: unknown, @Query('to') to: unknown, @Req() request: AuthenticatedRequest): Promise<FinanceReport> {
    return financeResponse(() => this.finance.report(financeActor(businessId, request), from, to));
  }

  @Get('expenses/:id') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Consulta documento, pagos parciales y auditoría privada de un gasto.' })
  expense(@Param('businessId') businessId: string, @Param('id') id: string, @Req() request: AuthenticatedRequest): Promise<{ expense: FinanceExpense; audit: FinanceAuditItem[] }> {
    return financeResponse(() => this.finance.expense(financeActor(businessId, request), id));
  }

  @Get('audit/:sourceType/:sourceId') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Consulta el historial privado de un origen financiero validado en el negocio.' })
  audit(@Param('businessId') businessId: string, @Param('sourceType') sourceType: string, @Param('sourceId') sourceId: string, @Req() request: AuthenticatedRequest): Promise<FinanceAuditItem[]> {
    return financeResponse(() => this.finance.audit(financeActor(businessId, request), sourceType, sourceId));
  }

  @Post('commands') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @BusinessAccessByBody('businessId', Capability.FINANCE_WRITE, 'type', {
    CREATE_CATALOG: Capability.FINANCE_WRITE, ARCHIVE_CATALOG: Capability.FINANCE_WRITE,
    CREATE_ACCOUNT: Capability.FINANCE_WRITE, ARCHIVE_ACCOUNT: Capability.FINANCE_WRITE, OPEN_ACCOUNT: Capability.FINANCE_WRITE,
    CREATE_EXPENSE: Capability.FINANCE_WRITE, SETTLE_EXPENSE: Capability.FINANCE_WRITE, SET_EVIDENCE: Capability.FINANCE_WRITE,
    LINK_PAYMENT: Capability.FINANCE_WRITE, TRANSFER: Capability.FINANCE_WRITE,
    CASH_MOVEMENT: Capability.FINANCE_CASH_ADJUST, REVIEW_MOVEMENT: Capability.FINANCE_WRITE,
    COUNT_CASH: Capability.FINANCE_WRITE, ADJUST_COUNT: Capability.FINANCE_CASH_ADJUST,
  })
  @ApiOperation({ summary: 'Registra una operación financiera informativa, idempotente y auditable.' })
  command(@Param('businessId') businessId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() request: AuthenticatedRequest): Promise<FinanceResult> {
    return financeResponse(() => this.finance.execute(financeActor(businessId, request), body, key));
  }

  @Get('export') @Header('Cache-Control', 'no-store') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="top-finanzas.csv"') @BusinessAccess('businessId', Capability.FINANCE_EXPORT)
  @ApiOperation({ summary: 'Exporta el conjunto consultado o exige actualizar si cambió su token.' })
  export(@Param('businessId') businessId: string, @Query('from') from: unknown, @Query('to') to: unknown, @Query('token') token: unknown, @Req() request: AuthenticatedRequest): Promise<string> {
    return financeResponse(() => this.finance.export(financeActor(businessId, request), from, to, token));
  }
}
