import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpCode, Inject, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { FinancePeriodClosedError, isFinancePeriodClosedError } from '../../../shared/infrastructure/finance-period.guard';
import { FinanceInputError, FinanceConflictError, FinanceForbiddenError, FinanceNotFoundError } from '../domain/finance.errors';
import { FinanceRecognitionError } from '../domain/finance-recognition.support';
import { FinanceEvidenceError } from '../application/finance-v2-evidence.validation';
import { PaymentAdjustmentInvariantError } from '../../payment/payment.contract';
import { FinanceCsvPreviewError } from '../application/finance-v2-csv-preview.error';
import { FinanceV2UseCases } from '../application/finance-v2.use-cases';
import { parseFinanceUuid } from '../domain/finance-validation';
import type { FinanceV2Actor, FinanceV2ReadRepository } from '../domain/finance-v2.types';
import { FINANCE_V2_COMMANDS, FINANCE_V2_READERS, FINANCE_V2_ALERTS } from '../infrastructure/finance-composition.providers';
import { FinanceV2AlertsReadService } from '../infrastructure/finance-v2-alerts.read-service';
import { parseFinanceV2PageQuery, parseFinanceV2BankPageQuery, parseFinanceV2ReportQuery, parseFinanceV2Month, parseFinanceV2BudgetComparisonQuery, parseFinanceV2AccountQuery, parseFinanceV2AgingQuery, parseFinanceHistoryPreview, parseFinanceBankStatementPreview, parseFinanceBankMatchPreview, parseFinancePlanningPreview } from '../infrastructure/finance-composition.validation';

function actor(businessId: string, request: AuthenticatedRequest): FinanceV2Actor {
  if (!request.authenticatedPrincipal) throw new UnauthorizedException();
  return { businessId: parseFinanceUuid(businessId), actorUserId: parseFinanceUuid(request.authenticatedPrincipal.userId) };
}

async function response<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error: unknown) {
    if (isFinancePeriodClosedError(error)) throw new ConflictException(new FinancePeriodClosedError().message);
    if (error instanceof FinanceRecognitionError) throw recognitionException(error);
    if (error instanceof Error) throw commonException(error);
    throw error;
  }
}

function commonException(error: Error): Error {
  if (error instanceof FinanceInputError || error instanceof FinanceEvidenceError) return financialBadRequest(error);
  if (error instanceof FinanceForbiddenError) return new ForbiddenException(error.message);
  if (error instanceof FinanceNotFoundError) return new NotFoundException(error.message);
  if (error instanceof FinanceConflictError || error instanceof PaymentAdjustmentInvariantError || ('code' in error && error.code === 'SOURCE_LIMIT')) return new ConflictException(error.message);
  return error;
}

function financialBadRequest(error: FinanceInputError | FinanceEvidenceError): BadRequestException {
  if (error instanceof FinanceCsvPreviewError) return new BadRequestException({ statusCode: 400, error: 'Bad Request', message: error.message, previewToken: null, issues: error.issues });
  return new BadRequestException(error.message);
}

function recognitionException(error: FinanceRecognitionError): Error {
  if (error.code === 'FINANCE_FORBIDDEN') return new ForbiddenException(error.message);
  if (error.code === 'SOURCE_NOT_FOUND') return new NotFoundException(error.message);
  if (error.code.endsWith('_CONFLICT') || ['MONEY_OVERFLOW', 'SOURCE_LIMIT', 'FINANCE_PERIOD_CLOSED'].includes(error.code)) return new ConflictException(error.message);
  return new BadRequestException(error.message);
}

type ReadResult<K extends keyof FinanceV2ReadRepository> = ReturnType<FinanceV2ReadRepository[K]>;

@ApiTags('Finance V2')
@Controller('businesses/:businessId/finance/v2')
export class FinanceV2Controller {
  constructor(@Inject(FINANCE_V2_READERS) private readonly readers: FinanceV2ReadRepository, @Inject(FINANCE_V2_COMMANDS) private readonly commands: FinanceV2UseCases, @Inject(FINANCE_V2_ALERTS) private readonly alertsReader: FinanceV2AlertsReadService) {}

  @Get('drafts') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  drafts(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'drafts'> { return response(() => this.readers.drafts(actor(id, req), parseFinanceV2PageQuery(query))); }

  @Get('drafts/:id') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  draft(@Param('businessId') id: string, @Param('id') sourceId: string, @Req() req: AuthenticatedRequest): ReadResult<'draft'> { return response(() => this.readers.draft(actor(id, req), parseFinanceUuid(sourceId))); }

  @Get('approval-policy') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  policy(@Param('businessId') id: string, @Req() req: AuthenticatedRequest): ReadResult<'approvalPolicy'> { return response(() => this.readers.approvalPolicy(actor(id, req))); }

  @Get('templates') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  templates(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'templates'> { return response(() => this.readers.templates(actor(id, req), parseFinanceV2PageQuery(query))); }

  @Get('budget') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_PLANNING)
  budget(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'budget'> { return response(() => this.readers.budget(actor(id, req), parseFinanceV2Month(query))); }

  @Get('budget-comparison') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_PLANNING)
  budgetComparison(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'budgetComparison'> {
    return response(() => {
      const parsed = parseFinanceV2BudgetComparisonQuery(query);
      return this.readers.budgetComparison(actor(id, req), parsed.periodMonth, parsed.forecastBasis);
    });
  }

  @Get('commitments') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  commitments(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'commitments'> { return response(() => this.readers.commitments(actor(id, req), parseFinanceV2PageQuery(query))); }

  @Get('bank-match-sources') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  bankSources(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'bankMatchSources'> { return response(() => this.readers.bankMatchSources(actor(id, req), parseFinanceV2AccountQuery(query))); }

  @Get('bank-statements') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  bankStatements(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'bankStatements'> { return response(() => this.readers.bankStatements(actor(id, req), parseFinanceV2BankPageQuery(query))); }

  @Get('bank-matches') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  bankMatches(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'bankMatches'> { return response(() => this.readers.bankMatches(actor(id, req), parseFinanceV2BankPageQuery(query))); }

  @Get('allocation-rules') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  rules(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'allocationRules'> { return response(() => this.readers.allocationRules(actor(id, req), parseFinanceV2PageQuery(query))); }

  @Get('labor-costs') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_LABOR)
  labor(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'laborCosts'> { return response(() => this.readers.laborCosts(actor(id, req), parseFinanceV2PageQuery(query))); }

  @Get('costs') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  costs(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'costs'> { return response(() => this.readers.costs(actor(id, req), parseFinanceV2ReportQuery(query))); }

  @Get('resource-results') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  resources(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'resourceResults'> { return response(() => this.readers.resourceResults(actor(id, req), parseFinanceV2ReportQuery(query))); }

  @Get('aging') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  aging(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReadResult<'aging'> { return response(() => this.readers.aging(actor(id, req), parseFinanceV2AgingQuery(query))); }

  @Get('alerts') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  alerts(@Param('businessId') id: string, @Query() query: unknown, @Req() req: AuthenticatedRequest): ReturnType<FinanceV2AlertsReadService['read']> { return response(() => this.alertsReader.read(actor(id, req), parseFinanceV2ReportQuery(query))); }

  @Post('commands') @HttpCode(200) @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_WRITE)
  command(@Param('businessId') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() req: AuthenticatedRequest): ReturnType<FinanceV2UseCases['execute']> { return response(() => this.commands.execute(actor(id, req), body, key)); }

  @Post('history-preview') @HttpCode(200) @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_IMPORT)
  historyPreview(@Param('businessId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest): ReadResult<'importPreview'> { return response(() => this.readers.importPreview(actor(id, req), parseFinanceHistoryPreview(body))); }

  @Post('bank-preview') @HttpCode(200) @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_IMPORT)
  bankPreview(@Param('businessId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest): ReadResult<'bankStatementPreview'> { return response(() => this.readers.bankStatementPreview(actor(id, req), parseFinanceBankStatementPreview(body))); }

  @Post('bank-match-preview') @HttpCode(200) @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  matchPreview(@Param('businessId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest): ReadResult<'bankMatchPreview'> { return response(() => this.readers.bankMatchPreview(actor(id, req), parseFinanceBankMatchPreview(body))); }

  @Post('planning-preview') @HttpCode(200) @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_PLANNING)
  planningPreview(@Param('businessId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest): ReadResult<'planningPreview'> { return response(() => this.readers.planningPreview(actor(id, req), parseFinancePlanningPreview(body))); }
}
