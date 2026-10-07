import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BUSINESS_ACCESS_KEY } from '../../../shared/security/security.decorators';
import { FinanceConflictError, FinanceForbiddenError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { FinanceRecognitionError } from '../domain/finance-recognition.support';
import type { FinanceCloseOperations } from '../application/finance-close.operations';
import type { FinanceRecognitionOperations } from '../application/finance-recognition.operations';
import { FinanceCloseController } from './finance-close.controller';
import { FinanceRecognitionController } from './finance-recognition.controller';
import { financeRecognitionResponse } from './finance-recognition.http';

const id = '11111111-1111-4111-8111-111111111111';
const key = 'request-1234567890';
const token = 'a'.repeat(64);
const request = { authenticatedPrincipal: { userId: 'server-owner' } } as AuthenticatedRequest;
const service = () => ({ bookingId: id, expectedBookingUpdatedAt: '2026-10-05T00:00:00.000Z', expectedCertificateVersion: 0, expectedPricingSourceId: id, servedNights: ['2026-09-01'], effectiveCheckInOn: '2026-09-01', effectiveCheckOutOn: null, evidence: 'Registro.', reason: 'Certificar.', supersedesCertificateId: null });

describe('Invocación unitaria de controllers; sin servidor HTTP ni guardias reales', () => {
  const recognition = { certifyService: jest.fn(), recognizeTerminal: jest.fn(), profitability: jest.fn(), recognitionSources: jest.fn(), bookingResult: jest.fn() } satisfies FinanceRecognitionOperations;
  const close = { listPeriods: jest.fn(), createPeriod: jest.fn(), prepareClose: jest.fn(), readSnapshot: jest.fn(), readPackage: jest.fn(), closePeriod: jest.fn(), reopenPeriod: jest.fn() } satisfies FinanceCloseOperations;
  const recognitionController = new FinanceRecognitionController(recognition);
  const closeController = new FinanceCloseController(close);
  beforeEach(() => { jest.resetAllMocks(); });

  it('entrega actor de servidor, comando parseado y clave sin aceptar suplantación', async () => {
    recognition.certifyService.mockResolvedValue({ id });
    await expect(recognitionController.certifyService(id, service(), key, request)).resolves.toEqual({ id });
    expect(recognition.certifyService).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, service(), key);
    await expect(recognitionController.certifyService(id, { ...service(), actorUserId: 'attacker' }, key, request)).rejects.toBeInstanceOf(BadRequestException);
    expect(recognition.certifyService).toHaveBeenCalledTimes(1);
  });
  it('requiere principal autenticado antes de invocar el puerto', async () => {
    await expect(recognitionController.certifyService(id, service(), key, {} as AuthenticatedRequest)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(recognition.certifyService).not.toHaveBeenCalled();
  });
  it('consulta rentabilidad con token esperado validado', async () => {
    recognition.profitability.mockResolvedValue({ complete: true });
    await expect(recognitionController.profitability(id, { from: '2026-09-01', to: '2026-10-01', token }, request)).resolves.toEqual({ complete: true });
    expect(recognition.profitability).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, { from: '2026-09-01', to: '2026-10-01', expectedSourceToken: token });
  });
  it('consulta fuentes tipadas con actor OWNER de servidor y rango validado', async () => {
    recognition.recognitionSources.mockResolvedValue({ sources: [] });
    await expect(recognitionController.recognitionSources(id, { from: '2026-09-01', to: '2026-10-01' }, request)).resolves.toEqual({ sources: [] });
    expect(recognition.recognitionSources).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, { from: '2026-09-01', to: '2026-10-01' });
  });
  it('consulta contribución de reserva con corte UTC y token, sin aceptar actor ni costo inferido', async () => {
    recognition.bookingResult.mockResolvedValue({ bookingId: id, contributionMinor: null });
    await expect(recognitionController.bookingResult(id, id, { from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-05T09:00:00-03:00', token }, request)).resolves.toEqual({ bookingId: id, contributionMinor: null });
    expect(recognition.bookingResult).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, id, { from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-05T12:00:00.000Z', expectedSourceToken: token });
    await expect(recognitionController.bookingResult(id, id, { from: '2026-09-01', to: '2026-10-01', actorUserId: 'attacker' }, request)).rejects.toBeInstanceOf(BadRequestException);
    expect(recognition.bookingResult).toHaveBeenCalledTimes(1);
  });
  it('invoca confirmación terminal sin importe final del cliente', async () => {
    const command = { bookingId: id, expectedBookingUpdatedAt: '2026-10-05T00:00:00.000Z', expectedVersion: 0, expectedPricingRevisionId: id, serviceCertificateId: null, serviceCertificateVersion: 0, recognitionOn: '2026-09-01', confirmedNonServiceAmountMinor: 5, coverage: 'DECLARED_NONE', classification: 'Cancelación', reason: 'Confirmar.' };
    recognition.recognizeTerminal.mockResolvedValue({ id });
    await expect(recognitionController.recognizeTerminal(id, command, key, request)).resolves.toEqual({ id });
    expect(recognition.recognizeTerminal).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, command, key);
  });
  it('invoca listado, creación y preparación con ids y actor del servidor', async () => {
    close.listPeriods.mockResolvedValue([]); close.createPeriod.mockResolvedValue({ id }); close.prepareClose.mockResolvedValue({ sourceToken: token });
    await expect(closeController.listPeriods(id, request)).resolves.toEqual([]);
    await expect(closeController.createPeriod(id, { from: '2026-09-01', to: '2026-10-01', reason: 'Mes.' }, key, request)).resolves.toEqual({ id });
    await expect(closeController.prepareClose(id, id, request)).resolves.toEqual({ sourceToken: token });
    expect(close.prepareClose).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, id);
    await expect(closeController.prepareClose(id, 'other', request)).rejects.toBeInstanceOf(BadRequestException);
    expect(close.prepareClose).toHaveBeenCalledTimes(1);
  });
  it('cierre y reapertura preservan CAS/token/motivo sin crear datos del snapshot', async () => {
    close.closePeriod.mockResolvedValue({ id }); close.reopenPeriod.mockResolvedValue({ id });
    await expect(closeController.closePeriod(id, id, { expectedVersion: 1, expectedSourceToken: token, reason: 'Cerrar.', acknowledgements: { EVIDENCE: 'Revisado.' } }, key, request)).resolves.toEqual({ id });
    expect(close.closePeriod).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, id, { expectedVersion: 1, expectedSourceToken: token, reason: 'Cerrar.', acknowledgements: { EVIDENCE: 'Revisado.' } }, key);
    await expect(closeController.reopenPeriod(id, id, { expectedVersion: 2, reason: 'Reabrir.' }, key, request)).resolves.toEqual({ id });
    expect(close.reopenPeriod).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, id, { expectedVersion: 2, reason: 'Reabrir.' }, key);
  });
  it('lee sólo el snapshot persistido tenant-scoped, vigente o histórico', async () => {
    close.readSnapshot.mockResolvedValue({ id });
    await expect(closeController.readSnapshot(id, id, undefined, request)).resolves.toEqual({ id });
    expect(close.readSnapshot).toHaveBeenLastCalledWith({ businessId: id, actorUserId: 'server-owner' }, id, undefined);
    await closeController.readSnapshot(id, id, id, request);
    expect(close.readSnapshot).toHaveBeenLastCalledWith({ businessId: id, actorUserId: 'server-owner' }, id, id);
    await expect(closeController.readSnapshot(id, id, '', request)).rejects.toBeInstanceOf(BadRequestException);
    expect(close.readSnapshot).toHaveBeenCalledTimes(2);
  });
  it('exporta paquete del snapshot seleccionado con capability OWNER existente', async () => {
    close.readPackage.mockResolvedValue({ snapshot: { id }, detailsCsv: 'csv' });
    await expect(closeController.readPackage(id, id, id, request)).resolves.toEqual({ snapshot: { id }, detailsCsv: 'csv' });
    expect(close.readPackage).toHaveBeenCalledWith({ businessId: id, actorUserId: 'server-owner' }, id, id);
  });
  it('declara rutas y capabilities OWNER existentes para cada operación', () => {
    const entries: [object, string, string, Capability][] = [
      [FinanceRecognitionController.prototype, 'certifyService', 'service-certificates', Capability.FINANCE_WRITE],
      [FinanceRecognitionController.prototype, 'recognizeTerminal', 'terminal-recognitions', Capability.FINANCE_WRITE],
      [FinanceRecognitionController.prototype, 'profitability', 'profitability', Capability.FINANCE_READ],
      [FinanceRecognitionController.prototype, 'recognitionSources', 'recognition-sources', Capability.FINANCE_READ],
      [FinanceRecognitionController.prototype, 'bookingResult', 'bookings/:bookingId/result', Capability.FINANCE_READ],
      [FinanceCloseController.prototype, 'listPeriods', '/', Capability.FINANCE_READ],
      [FinanceCloseController.prototype, 'createPeriod', '/', Capability.FINANCE_WRITE],
      [FinanceCloseController.prototype, 'prepareClose', ':id/prepare', Capability.FINANCE_READ],
      [FinanceCloseController.prototype, 'readSnapshot', ':id/snapshot', Capability.FINANCE_READ],
      [FinanceCloseController.prototype, 'readPackage', ':id/package', Capability.FINANCE_EXPORT],
      [FinanceCloseController.prototype, 'closePeriod', ':id/close', Capability.FINANCE_WRITE],
      [FinanceCloseController.prototype, 'reopenPeriod', ':id/reopen', Capability.FINANCE_WRITE],
    ];
    for (const [prototype, name, path, capability] of entries) {
      const method: unknown = Reflect.get(prototype, name);
      expect(Reflect.getMetadata(PATH_METADATA, method as object)).toBe(path);
      expect(Reflect.getMetadata(BUSINESS_ACCESS_KEY, method as object)).toEqual({ parameter: 'businessId', capabilities: [capability] });
    }
  });
});

describe('Mapeo unitario de errores públicos', () => {
  it.each([
    [new FinanceInputError('input'), BadRequestException], [new FinanceConflictError('conflict'), ConflictException],
    [new FinanceNotFoundError('missing'), NotFoundException], [new FinanceForbiddenError('forbidden'), ForbiddenException],
    [new FinanceRecognitionError('FINANCE_FORBIDDEN', 'forbidden'), ForbiddenException],
    [new FinanceRecognitionError('SOURCE_NOT_FOUND', 'missing'), NotFoundException],
    [new FinanceRecognitionError('SOURCE_VERSION_CONFLICT', 'stale'), ConflictException],
    [new FinanceRecognitionError('FINANCE_PERIOD_CLOSED', 'closed'), ConflictException],
    [new FinanceRecognitionError('CLOSE_WRITERS_UNGUARDED', 'unguarded'), ConflictException],
    [new FinanceRecognitionError('SOURCE_LIMIT', 'limit'), ConflictException],
    [new FinanceRecognitionError('INVALID_DATE', 'date'), BadRequestException],
  ])('traduce %p', async (error, exception) => {
    await expect(financeRecognitionResponse(() => Promise.reject(error))).rejects.toBeInstanceOf(exception);
  });
  it('preserva el código de dominio y no oculta errores inesperados', async () => {
    const error = new FinanceRecognitionError('SOURCE_VERSION_CONFLICT', 'Cambió la fuente.');
    await expect(financeRecognitionResponse(() => Promise.reject(error))).rejects.toMatchObject({ response: { code: error.code, message: error.message } });
    const unexpected = new Error('unexpected');
    await expect(financeRecognitionResponse(() => Promise.reject(unexpected))).rejects.toBe(unexpected);
  });
});
