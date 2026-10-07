import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { FINANCE_RECOGNITION_OPERATIONS, type FinanceRecognitionOperations, type FinanceRecognitionSourceReport, type FinanceTerminalRecognitionResult } from '../application/finance-recognition.operations';
import { parseFinanceBookingResultQuery, parseFinanceProfitabilityQuery, parseFinanceRecognitionIdempotencyKey, parseFinanceRecognitionUuid, parseFinanceServiceCertificateCommand, parseFinanceTerminalRecognitionCommand } from '../application/finance-recognition.validation';
import type { CloseJson } from '../domain/finance-close.types';
import type { FinanceBookingResult } from '../domain/finance-booking-result.types';
import type { ServiceCertificate } from '../domain/finance-recognition.types';
import { financeRecognitionActor, financeRecognitionResponse } from './finance-recognition.http';

@ApiTags('Finance')
@Controller('businesses/:businessId/finance')
export class FinanceRecognitionController {
  constructor(@Inject(FINANCE_RECOGNITION_OPERATIONS) private readonly finance: FinanceRecognitionOperations) {}

  @Post('service-certificates') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @BusinessAccess('businessId', Capability.FINANCE_WRITE)
  @ApiOperation({ summary: 'Certifica noches prestadas con evidencia, fuente fijada y versión esperada.' })
  certifyService(@Param('businessId') businessId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() request: AuthenticatedRequest): Promise<ServiceCertificate> {
    return financeRecognitionResponse(() => this.finance.certifyService(financeRecognitionActor(businessId, request), parseFinanceServiceCertificateCommand(body), parseFinanceRecognitionIdempotencyKey(key)));
  }

  @Post('terminal-recognitions') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @BusinessAccess('businessId', Capability.FINANCE_WRITE)
  @ApiOperation({ summary: 'Confirma el ingreso terminal no servicio contra el importe final del servidor.' })
  recognizeTerminal(@Param('businessId') businessId: string, @Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() request: AuthenticatedRequest): Promise<FinanceTerminalRecognitionResult> {
    return financeRecognitionResponse(() => this.finance.recognizeTerminal(financeRecognitionActor(businessId, request), parseFinanceTerminalRecognitionCommand(body), parseFinanceRecognitionIdempotencyKey(key)));
  }

  @Get('profitability') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Consulta rentabilidad por ingreso reconocido y consumo en un corte común.' })
  profitability(@Param('businessId') businessId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest): Promise<CloseJson> {
    return financeRecognitionResponse(() => this.finance.profitability(financeRecognitionActor(businessId, request), parseFinanceProfitabilityQuery(query)));
  }
  @Get('recognition-sources') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Consulta fuentes, versiones y noches elegibles para declaración manual.' })
  recognitionSources(@Param('businessId') businessId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest): Promise<FinanceRecognitionSourceReport> {
    return financeRecognitionResponse(() => this.finance.recognitionSources(financeRecognitionActor(businessId, request), parseFinanceProfitabilityQuery(query)));
  }

  @Get('bookings/:bookingId/result') @Header('Cache-Control', 'no-store') @BusinessAccess('businessId', Capability.FINANCE_READ)
  @ApiOperation({ summary: 'Consulta contribución por reserva con servicio certificado y costos directos explícitos.' })
  bookingResult(@Param('businessId') businessId: string, @Param('bookingId') bookingId: string, @Query() query: unknown, @Req() request: AuthenticatedRequest): Promise<FinanceBookingResult> {
    return financeRecognitionResponse(() => this.finance.bookingResult(financeRecognitionActor(businessId, request), parseFinanceRecognitionUuid(bookingId), parseFinanceBookingResultQuery(query)));
  }
}
