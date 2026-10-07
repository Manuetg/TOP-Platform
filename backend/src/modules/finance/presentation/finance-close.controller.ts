import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { FINANCE_CLOSE_OPERATIONS, type FinanceCloseOperations } from '../application/finance-close.operations';
import { parseFinanceClosePeriodCommand, parseFinanceCreatePeriodCommand, parseFinanceReopenPeriodCommand } from '../application/finance-close.validation';
import { parseFinanceRecognitionIdempotencyKey, parseFinanceRecognitionUuid } from '../application/finance-recognition.validation';
import type { CloseResult } from '../application/finance-close.use-cases';
import type { FinanceClosePackage } from '../application/finance-close.package';
import type { FinanceCloseSources, FinanceCloseSnapshot, FinancePeriod } from '../domain/finance-close.types';
import { financeRecognitionActor, financeRecognitionResponse } from './finance-recognition.http';

@ApiTags('Finance')
@Controller('businesses/:businessId/finance/periods')
export class FinanceCloseController {
  constructor(@Inject(FINANCE_CLOSE_OPERATIONS) private readonly finance: FinanceCloseOperations) {}

  @Get() @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Consulta períodos financieros y sus versiones vigentes.' })
  listPeriods(@Param('businessId') businessId: string, @Req() request: AuthenticatedRequest): Promise<readonly FinancePeriod[]> {
    return financeRecognitionResponse(() => this.finance.listPeriods(financeRecognitionActor(businessId, request)));
  }

  @Post() @HttpCode(200) @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_WRITE)
  @ApiOperation({ summary: 'Crea un período mensual local con motivo auditable.' })
  createPeriod(@Param('businessId') businessId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() request: AuthenticatedRequest): Promise<FinancePeriod> {
    return financeRecognitionResponse(() => this.finance.createPeriod(financeRecognitionActor(businessId, request), parseFinanceCreatePeriodCommand(body), parseFinanceRecognitionIdempotencyKey(key)));
  }

  @Get(':id/prepare') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Calcula fuentes, checklist y token antes del cierre.' })
  prepareClose(@Param('businessId') businessId: string, @Param('id') id: string, @Req() request: AuthenticatedRequest): Promise<FinanceCloseSources> {
    return financeRecognitionResponse(() => this.finance.prepareClose(financeRecognitionActor(businessId, request), parseFinanceRecognitionUuid(id)));
  }

  @Get(':id/snapshot') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Lee el paquete cerrado inmutable, incluido un cierre histórico tras reapertura.' })
  readSnapshot(@Param('businessId') businessId: string, @Param('id') id: string, @Query('snapshotId') snapshotId: unknown, @Req() request: AuthenticatedRequest): Promise<FinanceCloseSnapshot> {
    return financeRecognitionResponse(() => this.finance.readSnapshot(financeRecognitionActor(businessId, request), parseFinanceRecognitionUuid(id), snapshotId === undefined ? undefined : parseFinanceRecognitionUuid(snapshotId)));
  }
  @Get(':id/package') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_EXPORT)
  @ApiOperation({ summary: 'Prepara paquete contador del snapshot guardado con CSV por base y alertas.' })
  readPackage(@Param('businessId') businessId: string, @Param('id') id: string, @Query('snapshotId') snapshotId: unknown, @Req() request: AuthenticatedRequest): Promise<FinanceClosePackage> {
    return financeRecognitionResponse(() => this.finance.readPackage(financeRecognitionActor(businessId, request), parseFinanceRecognitionUuid(id), snapshotId === undefined ? undefined : parseFinanceRecognitionUuid(snapshotId)));
  }

  @Post(':id/close') @HttpCode(200) @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_WRITE)
  @ApiOperation({ summary: 'Cierra con versión, token esperado y reconocimientos explícitos de excepciones.' })
  closePeriod(@Param('businessId') businessId: string, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() request: AuthenticatedRequest): Promise<CloseResult> {
    return financeRecognitionResponse(() => this.finance.closePeriod(financeRecognitionActor(businessId, request), parseFinanceRecognitionUuid(id), parseFinanceClosePeriodCommand(body), parseFinanceRecognitionIdempotencyKey(key)));
  }

  @Post(':id/reopen') @HttpCode(200) @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_WRITE)
  @ApiOperation({ summary: 'Reabre con versión esperada y motivo sin borrar snapshots.' })
  reopenPeriod(@Param('businessId') businessId: string, @Param('id') id: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() request: AuthenticatedRequest): Promise<CloseResult> {
    return financeRecognitionResponse(() => this.finance.reopenPeriod(financeRecognitionActor(businessId, request), parseFinanceRecognitionUuid(id), parseFinanceReopenPeriodCommand(body), parseFinanceRecognitionIdempotencyKey(key)));
  }
}
